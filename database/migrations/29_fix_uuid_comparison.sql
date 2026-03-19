-- 29_fix_uuid_comparison.sql

-- ==========================================
-- 1. Fix submit_quiz RPC (UUID Comparison)
-- ==========================================
-- The issue is in the DELETE statement:
-- WHERE user_id = v_user_id AND config_id = p_config_id::text;
-- quiz_progress.config_id is UUID, but p_config_id::text is TEXT.
-- This causes "operator does not exist: uuid = text".

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
  v_answer_record RECORD;
  v_question RECORD;
  v_q_score NUMERIC;
  v_is_correct BOOLEAN;
  v_attempts JSONB := '[]'::jsonb;
  v_attempt_item JSONB;
  v_user_answer TEXT;
  v_result_id UUID;
  v_result_row RECORD;
  v_last_reset_at BIGINT;
  v_existing_attempts INT;
  v_correct_parts TEXT[];
  v_user_parts TEXT[];
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
      -- quiz_results.config_id is TEXT
      SELECT COUNT(*) INTO v_existing_attempts 
      FROM public.quiz_results 
      WHERE user_id = v_user_id 
      AND config_id = p_config_id::text 
      AND timestamp > v_last_reset_at;

      IF v_existing_attempts > 0 THEN
          RAISE EXCEPTION 'One attempt limit reached for this quiz.';
      END IF;
  END IF;

  -- Grading Loop
  FOR v_answer_record IN SELECT * FROM jsonb_to_recordset(p_answers) AS x("questionId" uuid, "userAnswer" text)
  LOOP
    SELECT * INTO v_question FROM public.questions WHERE id = v_answer_record."questionId";
    
    IF FOUND THEN
      v_q_score := COALESCE(v_question.score, 1);
      v_user_answer := COALESCE(v_answer_record."userAnswer", '');
      v_is_correct := FALSE;

      CASE v_question.type
        WHEN 'MULTIPLE_CHOICE', 'TRUE_FALSE' THEN
           v_is_correct := (v_user_answer = v_question.correct_answer);
           
        WHEN 'MULTIPLE_SELECT' THEN
           BEGIN
             v_is_correct := public.arrays_equal_unordered(
               v_user_answer::jsonb, 
               v_question.correct_answer::jsonb
             );
           EXCEPTION WHEN OTHERS THEN
             v_is_correct := FALSE;
           END;

        WHEN 'SHORT_ANSWER' THEN
           IF v_question.needs_grading THEN
              v_is_correct := FALSE; 
           ELSE
              v_is_correct := (public.normalize_answer(v_user_answer) = public.normalize_answer(v_question.correct_answer));
           END IF;

        WHEN 'FILL_IN_THE_BLANK' THEN
           v_correct_parts := string_to_array(v_question.correct_answer, ';&&;');
           v_user_parts := string_to_array(v_user_answer, ';&&;');
           
           IF array_length(v_correct_parts, 1) = array_length(v_user_parts, 1) THEN
              v_is_correct := TRUE;
              FOR i IN 1 .. array_length(v_correct_parts, 1) LOOP
                 IF public.normalize_answer(v_user_parts[i]) != public.normalize_answer(v_correct_parts[i]) THEN
                    v_is_correct := FALSE;
                 END IF;
              END LOOP;
           ELSE
              v_is_correct := FALSE;
           END IF;
           
        ELSE
           v_is_correct := FALSE;
      END CASE;

      IF v_is_correct THEN
         v_total_score := v_total_score + v_q_score;
      END IF;
      v_max_score := v_max_score + v_q_score;

      v_attempts := v_attempts || jsonb_build_object(
        'questionId', v_question.id,
        'userAnswer', v_user_answer,
        'isCorrect', v_is_correct,
        'score', CASE WHEN v_is_correct THEN v_q_score ELSE 0 END,
        'maxScore', v_q_score,
        'correctAnswerText', v_question.correct_answer, 
        'explanation', v_question.explanation,
        'questionText', v_question.text,
        'questionImageUrls', v_question.image_urls
      );
      v_attempts := v_attempts || v_attempt_item;
    END IF;
  END LOOP;

  v_is_passed := (v_total_score >= v_passing_score);

  -- Insert Result
  -- quiz_results.config_id is TEXT
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
    p_config_id::text, -- Cast to TEXT for quiz_results
    v_config.name,
    p_duration,
    'completed'
  ) RETURNING * INTO v_result_row;

  -- Cleanup Progress
  -- quiz_progress.config_id is UUID (FIX: No cast)
  DELETE FROM public.quiz_progress 
  WHERE user_id = v_user_id AND config_id = p_config_id;

  RETURN row_to_json(v_result_row)::jsonb;

EXCEPTION WHEN OTHERS THEN
  -- Log error to system_logs if table exists
  BEGIN
    INSERT INTO public.system_logs (
      id, level, category, message, details, user_id, created_at
    ) VALUES (
      gen_random_uuid(),
      'ERROR',
      'RPC_SUBMIT_QUIZ',
      SQLERRM,
      jsonb_build_object(
        'state', SQLSTATE, 
        'config_id', p_config_id,
        'user_id', auth.uid()
      ),
      auth.uid(),
      extract(epoch from now()) * 1000
    );
  EXCEPTION WHEN OTHERS THEN
    -- Ignore logging error
  END;
  
  -- Re-raise original error so frontend knows
  RAISE;
END;
$$;

-- Grant Execute
GRANT EXECUTE ON FUNCTION public.submit_quiz(UUID, JSONB, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_quiz(UUID, JSONB, INT) TO service_role;
