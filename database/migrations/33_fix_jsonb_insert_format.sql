-- 33_fix_jsonb_insert_format.sql

-- ==========================================
-- 1. Fix submit_quiz RPC (JSONB Array Construction)
-- ==========================================
-- The issue is likely that `v_attempts` is being constructed as a string concatenation or invalid JSONB merge
-- in a way that Postgres doesn't like, OR the `jsonb_build_object` is creating a structure 
-- that the frontend doesn't expect (e.g. missing keys).

-- But more likely: The `attempts` column in `quiz_results` is being saved as `null` or empty array
-- because the loop isn't matching any questions.

-- We already fixed the UUID comparison in Migration 29.
-- But let's look at `v_attempts := v_attempts || v_attempt_item;`
-- If `v_attempts` is `NULL` initially, `||` with JSONB returns NULL?
-- Postgres: `NULL || jsonb` -> NULL.
-- We initialized `v_attempts JSONB := '[]'::jsonb;` in Migration 29. So it should be fine.

-- Let's try to rewrite the loop to be more robust using `jsonb_agg`.
-- This is cleaner and less error-prone than iterative concatenation.

CREATE OR REPLACE FUNCTION public.submit_quiz(
  p_config_id UUID,
  p_answers JSONB, 
  p_duration INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_user_id UUID;
  v_username TEXT;
  v_config RECORD;
  v_total_score NUMERIC := 0;
  v_max_score NUMERIC := 0;
  v_passing_score NUMERIC;
  v_is_passed BOOLEAN;
  v_attempts JSONB; -- We will build this using a query
  v_result_id UUID;
  v_result_row RECORD;
  v_last_reset_at BIGINT;
  v_existing_attempts INT;
BEGIN
  -- Get User ID safely
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated (auth.uid() is null)';
  END IF;

  SELECT username INTO v_username FROM public.profiles WHERE id = v_user_id;

  -- Fetch Config
  SELECT * INTO v_config FROM public.quiz_configs WHERE id = p_config_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quiz configuration not found: %', p_config_id;
  END IF;

  v_passing_score := v_config.passing_score;
  v_last_reset_at := COALESCE(v_config.last_reset_at, 0);

  -- Enforce "One Attempt" Rule
  IF v_config.allow_one_attempt THEN
      SELECT COUNT(*) INTO v_existing_attempts 
      FROM public.quiz_results 
      WHERE user_id = v_user_id 
      AND config_id = p_config_id::text 
      AND timestamp > v_last_reset_at;

      IF v_existing_attempts > 0 THEN
          RAISE EXCEPTION 'One attempt limit reached for this quiz.';
      END IF;
  END IF;

  -- Grading Query (Set-based approach instead of Loop)
  -- This calculates score and builds the attempts array in one go.
  
  WITH graded_answers AS (
    SELECT 
      q.id as question_id,
      q.text as question_text,
      q.image_urls as question_image_urls,
      q.explanation,
      q.correct_answer,
      q.score as q_score_val,
      COALESCE(u."userAnswer", '') as user_answer,
      -- Grading Logic
      CASE 
        WHEN q.type IN ('MULTIPLE_CHOICE', 'TRUE_FALSE') THEN 
           (COALESCE(u."userAnswer", '') = q.correct_answer)
        
        WHEN q.type = 'MULTIPLE_SELECT' THEN
           public.arrays_equal_unordered(COALESCE(u."userAnswer", '[]')::jsonb, q.correct_answer::jsonb)
           
        WHEN q.type = 'SHORT_ANSWER' THEN
           CASE WHEN q.needs_grading THEN FALSE
           ELSE (public.normalize_answer(COALESCE(u."userAnswer", '')) = public.normalize_answer(q.correct_answer))
           END
           
        WHEN q.type = 'FILL_IN_THE_BLANK' THEN
           (
             SELECT bool_and(
               public.normalize_answer(u_part) = public.normalize_answer(c_part)
             )
             FROM unnest(string_to_array(COALESCE(u."userAnswer", ''), ';&&;'), string_to_array(q.correct_answer, ';&&;')) AS t(u_part, c_part)
           )
           
        ELSE FALSE
      END as is_correct
    FROM jsonb_to_recordset(p_answers) AS u("questionId" uuid, "userAnswer" text)
    JOIN public.questions q ON q.id = u."questionId"
  ),
  summary AS (
    SELECT 
      SUM(CASE WHEN is_correct THEN COALESCE(q_score_val, 1) ELSE 0 END) as total_score,
      SUM(COALESCE(q_score_val, 1)) as max_score,
      jsonb_agg(
        jsonb_build_object(
          'questionId', question_id,
          'userAnswer', user_answer,
          'isCorrect', is_correct,
          'score', CASE WHEN is_correct THEN COALESCE(q_score_val, 1) ELSE 0 END,
          'maxScore', COALESCE(q_score_val, 1),
          'correctAnswerText', correct_answer, 
          'explanation', explanation,
          'questionText', question_text,
          'questionImageUrls', question_image_urls
        )
      ) as attempts_json
    FROM graded_answers
  )
  SELECT 
    COALESCE(total_score, 0), 
    COALESCE(max_score, 0), 
    COALESCE(attempts_json, '[]'::jsonb)
  INTO v_total_score, v_max_score, v_attempts
  FROM summary;

  -- Fallback if summary is empty (e.g. no answers provided)
  IF v_attempts IS NULL THEN v_attempts := '[]'::jsonb; END IF;

  v_is_passed := (v_total_score >= v_passing_score);

  -- Insert Result
  INSERT INTO public.quiz_results (
    id,
    user_id, 
    username, 
    timestamp, 
    score, 
    max_score, 
    passing_score, 
    is_passed, 
    total_questions, 
    attempts, 
    config_id, 
    config_name, 
    duration, 
    status
  ) VALUES (
    gen_random_uuid(),
    v_user_id, 
    v_username,
    extract(epoch from now()) * 1000,
    v_total_score,
    v_max_score,
    v_passing_score,
    v_is_passed,
    jsonb_array_length(p_answers),
    v_attempts,
    p_config_id::text,
    v_config.name,
    p_duration,
    'completed'
  ) RETURNING * INTO v_result_row;

  -- Cleanup Progress
  DELETE FROM public.quiz_progress 
  WHERE user_id = v_user_id AND config_id = p_config_id;

  RETURN row_to_json(v_result_row)::jsonb;

EXCEPTION WHEN OTHERS THEN
  -- Log error
  INSERT INTO public.system_logs (
      id, level, category, message, details, user_id, created_at
  ) VALUES (
      gen_random_uuid(),
      'ERROR',
      'RPC_SUBMIT_QUIZ',
      SQLERRM,
      jsonb_build_object('state', SQLSTATE, 'config_id', p_config_id),
      auth.uid(),
      extract(epoch from now()) * 1000
  );
  RAISE;
END;
$$;

-- Grant Execute
GRANT EXECUTE ON FUNCTION public.submit_quiz(UUID, JSONB, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_quiz(UUID, JSONB, INT) TO service_role;
ALTER FUNCTION public.submit_quiz(UUID, JSONB, INT) OWNER TO postgres;
