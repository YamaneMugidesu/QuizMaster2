-- 40_fix_grading_field_name.sql

-- ==========================================
-- Fix RPC to return correct field name for manual grading
-- ==========================================
-- The frontend expects 'manualGrading' in the QuizAttempt object,
-- but the database was returning 'needsGrading'. This caused the
-- grading modal to filter out all items as non-manual.

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
  v_attempts JSONB;
  v_result_id UUID;
  v_result_row RECORD;
  v_last_reset_at BIGINT;
  v_existing_attempts INT;
  v_input_count INT;
  v_has_pending_grading BOOLEAN := false;
  v_final_status TEXT;
BEGIN
  -- Get User ID safely
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated (auth.uid() is null)';
  END IF;

  SELECT username INTO v_username FROM public.profiles WHERE id = v_user_id;

  -- Log Start
  v_input_count := jsonb_array_length(p_answers);
  INSERT INTO public.system_logs (id, level, category, message, details, user_id, created_at)
  VALUES (gen_random_uuid(), 'INFO', 'DEBUG_RPC', 'submit_quiz_start', 
    jsonb_build_object('config_id', p_config_id, 'input_count', v_input_count),
    v_user_id, extract(epoch from now()) * 1000);

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

  -- Grading Query with Config-based Score Logic
  WITH config_parts AS (
    SELECT 
        COALESCE((elem->>'score')::numeric, 1) as part_score,
        COALESCE((elem->>'questionTypes')::jsonb, '[]'::jsonb) as types,
        COALESCE((elem->>'difficulties')::jsonb, '[]'::jsonb) as difficulties,
        COALESCE((elem->>'categories')::jsonb, '[]'::jsonb) as categories,
        idx
    FROM jsonb_array_elements(v_config.parts) WITH ORDINALITY as t(elem, idx)
  ),
  parsed_inputs AS (
    SELECT 
      (item->>'questionId')::uuid as q_id,
      COALESCE(item->>'userAnswer', '') as u_answer
    FROM jsonb_array_elements(p_answers) AS item
  ),
  graded_answers AS (
    SELECT 
      q.id as question_id,
      q.text as question_text,
      q.image_urls as question_image_urls,
      q.explanation,
      q.correct_answer,
      q.needs_grading,
      
      -- DYNAMIC SCORE CALCULATION
      -- Matches the question against config parts to find the assigned score
      COALESCE(
        (
            SELECT cp.part_score 
            FROM config_parts cp
            WHERE (jsonb_array_length(cp.types) = 0 OR q.type = ANY(SELECT jsonb_array_elements_text(cp.types)))
            AND (jsonb_array_length(cp.difficulties) = 0 OR q.difficulty = ANY(SELECT jsonb_array_elements_text(cp.difficulties)))
            -- Check category (optional in parts)
            AND (
                jsonb_array_length(cp.categories) = 0 
                OR q.category = ANY(SELECT jsonb_array_elements_text(cp.categories))
            )
            ORDER BY cp.idx ASC
            LIMIT 1
        ),
        q.score, -- Fallback to question default
        1        -- Fallback absolute default
      ) as q_score_val,
      
      p.u_answer as user_answer,
      -- Grading Logic
      CASE 
        WHEN q.type IN ('MULTIPLE_CHOICE', 'TRUE_FALSE') THEN 
           (p.u_answer = q.correct_answer)
        
        WHEN q.type = 'MULTIPLE_SELECT' THEN
           public.arrays_equal_unordered(
             CASE WHEN p.u_answer IS NULL OR p.u_answer = '' THEN '[]'::jsonb ELSE p.u_answer::jsonb END, 
             q.correct_answer::jsonb
           )
           
        WHEN q.type = 'SHORT_ANSWER' THEN
           CASE WHEN q.needs_grading THEN FALSE
           ELSE (public.normalize_answer(p.u_answer) = public.normalize_answer(q.correct_answer))
           END
           
        WHEN q.type = 'FILL_IN_THE_BLANK' THEN
           (
             SELECT bool_and(
               public.normalize_answer(u_part) = public.normalize_answer(c_part)
             )
             FROM unnest(string_to_array(p.u_answer, ';&&;'), string_to_array(q.correct_answer, ';&&;')) AS t(u_part, c_part)
           )
           
        ELSE FALSE
      END as is_correct
    FROM parsed_inputs p
    JOIN public.questions q ON q.id = p.q_id
  ),
  summary AS (
    SELECT 
      SUM(CASE WHEN is_correct THEN q_score_val ELSE 0 END) as total_score,
      SUM(q_score_val) as max_score,
      BOOL_OR(needs_grading) as has_pending,
      jsonb_agg(
        jsonb_build_object(
          'questionId', question_id,
          'userAnswer', user_answer,
          'isCorrect', is_correct,
          'score', CASE WHEN is_correct THEN q_score_val ELSE 0 END,
          'maxScore', q_score_val,
          'correctAnswerText', correct_answer, 
          'explanation', explanation,
          'questionText', question_text,
          'questionImageUrls', question_image_urls,
          'manualGrading', needs_grading -- Renamed from needsGrading to manualGrading
        )
      ) as attempts_json
    FROM graded_answers
  )
  SELECT 
    COALESCE(total_score, 0), 
    COALESCE(max_score, 0), 
    COALESCE(has_pending, false),
    COALESCE(attempts_json, '[]'::jsonb)
  INTO v_total_score, v_max_score, v_has_pending_grading, v_attempts
  FROM summary;

  -- Fallback if summary is empty
  IF v_attempts IS NULL THEN v_attempts := '[]'::jsonb; END IF;

  -- Determine Status
  IF v_has_pending_grading THEN
      v_final_status := 'pending_grading';
  ELSE
      v_final_status := 'completed';
  END IF;

  -- Log Grading Result
  INSERT INTO public.system_logs (id, level, category, message, details, user_id, created_at)
  VALUES (gen_random_uuid(), 'INFO', 'DEBUG_RPC', 'submit_quiz_graded', 
    jsonb_build_object(
        'total_score', v_total_score, 
        'attempts_count', jsonb_array_length(v_attempts),
        'status', v_final_status
    ),
    v_user_id, extract(epoch from now()) * 1000);

  IF v_input_count > 0 AND jsonb_array_length(v_attempts) = 0 THEN
      INSERT INTO public.system_logs (id, level, category, message, details, user_id, created_at)
      VALUES (gen_random_uuid(), 'ERROR', 'DEBUG_RPC', 'DATA_LOSS_DETECTED', 
        jsonb_build_object('input_count', v_input_count, 'matched_count', 0),
        v_user_id, extract(epoch from now()) * 1000);
  END IF;

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
    v_input_count, 
    v_attempts,
    p_config_id::text,
    v_config.name,
    p_duration,
    v_final_status
  ) RETURNING * INTO v_result_row;

  -- Cleanup Progress
  DELETE FROM public.quiz_progress 
  WHERE user_id = v_user_id AND config_id = p_config_id;

  RETURN row_to_json(v_result_row)::jsonb;

EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.system_logs (
      id, level, category, message, details, user_id, created_at
  ) VALUES (
      gen_random_uuid(), 'ERROR', 'RPC_SUBMIT_QUIZ', SQLERRM,
      jsonb_build_object('state', SQLSTATE, 'config_id', p_config_id),
      auth.uid(), extract(epoch from now()) * 1000
  );
  RAISE;
END;
$$;
