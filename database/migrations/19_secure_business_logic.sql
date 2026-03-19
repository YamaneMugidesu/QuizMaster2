-- 19_secure_business_logic.sql

-- ==========================================
-- 1. Secure Profiles (Prevent Privilege Escalation)
-- ==========================================

-- Function to protect sensitive profile fields
CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- Prevent changing role (unless Super Admin)
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Permission denied: You cannot change your own role.';
    END IF;
  END IF;
  
  -- Prevent changing is_active or is_deleted (unless Admin)
  IF (NEW.is_active IS DISTINCT FROM OLD.is_active) OR (NEW.is_deleted IS DISTINCT FROM OLD.is_deleted) THEN
     IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Permission denied: You cannot change account status.';
     END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists
DROP TRIGGER IF EXISTS on_profile_update_protect ON public.profiles;

-- Create trigger (Before Update)
CREATE TRIGGER on_profile_update_protect
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_profile_fields();


-- ==========================================
-- 2. Secure Questions (Hide Answers)
-- ==========================================

-- 2.1 Create Safe View (Excludes correct_answer and explanation)
CREATE OR REPLACE VIEW public.questions_safe_view AS
SELECT 
  id, 
  type, 
  text, 
  image_urls, 
  options, 
  subject, 
  grade_level, 
  difficulty, 
  category, 
  content_category, 
  created_at, 
  is_disabled, 
  score, 
  needs_grading,
  is_deleted
FROM public.questions
WHERE is_deleted = false AND is_disabled = false;

-- 2.2 Grant Access to View
GRANT SELECT ON public.questions_safe_view TO authenticated;
GRANT SELECT ON public.questions_safe_view TO anon;

-- 2.3 Revoke Direct Table Access for Non-Admins
-- Drop the old permissive policy
DROP POLICY IF EXISTS "Enable read access for all users" ON public.questions;

-- Create new restrictive policy (Admins only)
CREATE POLICY "Allow admins to read all questions"
ON public.questions FOR SELECT
USING ( public.is_admin() );


-- ==========================================
-- 3. Secure Grading (Server-Side Logic)
-- ==========================================

-- Helper: Normalize text for comparison (removes spaces, lowercase)
CREATE OR REPLACE FUNCTION public.normalize_answer(p_text TEXT) 
RETURNS TEXT IMMUTABLE LANGUAGE sql AS $$
  SELECT lower(regexp_replace(p_text, '\s+', '', 'g'));
$$;

-- Helper: Check if two JSON arrays are equal (ignoring order)
CREATE OR REPLACE FUNCTION public.arrays_equal_unordered(json_a JSONB, json_b JSONB) 
RETURNS BOOLEAN IMMUTABLE LANGUAGE plpgsql AS $$
DECLARE
  arr_a TEXT[];
  arr_b TEXT[];
BEGIN
  SELECT array_agg(elem ORDER BY elem) INTO arr_a FROM jsonb_array_elements_text(json_a) elem;
  SELECT array_agg(elem ORDER BY elem) INTO arr_b FROM jsonb_array_elements_text(json_b) elem;
  -- Handle NULLs
  IF arr_a IS NULL THEN arr_a := '{}'; END IF;
  IF arr_b IS NULL THEN arr_b := '{}'; END IF;
  RETURN arr_a = arr_b;
EXCEPTION WHEN OTHERS THEN
  RETURN FALSE;
END;
$$;

-- 3.1 Revoke Public Insert on Quiz Results
-- Drop permissive policy
DROP POLICY IF EXISTS "Users can submit own results" ON public.quiz_results;

-- 3.2 Submit Quiz RPC
CREATE OR REPLACE FUNCTION public.submit_quiz(
  p_config_id UUID,
  p_answers JSONB, -- Array of { questionId: string, userAnswer: string }
  p_duration INT
)
RETURNS JSONB -- Returns the Result Object
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
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
  v_temp_correct_text TEXT;
BEGIN
  -- 1. Authentication Check
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT username INTO v_username FROM profiles WHERE id = v_user_id;

  -- 2. Fetch Config & Validate
  SELECT * INTO v_config FROM public.quiz_configs WHERE id = p_config_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quiz configuration not found';
  END IF;

  v_passing_score := v_config.passing_score;
  v_last_reset_at := COALESCE(v_config.last_reset_at, 0);

  -- 2.1 Enforce "One Attempt" Rule (Server-Side)
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

  -- 3. Grading Loop
  FOR v_answer_record IN SELECT * FROM jsonb_to_recordset(p_answers) AS x("questionId" uuid, "userAnswer" text)
  LOOP
    -- Fetch Question (Securely inside Security Definer)
    SELECT * INTO v_question FROM public.questions WHERE id = v_answer_record."questionId";
    
    IF FOUND THEN
      v_q_score := COALESCE(v_question.score, 1); -- Default to 1 if null
      v_user_answer := COALESCE(v_answer_record."userAnswer", '');
      v_is_correct := FALSE;
      v_temp_correct_text := v_question.correct_answer;

      -- Grading Logic based on Type
      CASE v_question.type
        WHEN 'MULTIPLE_CHOICE', 'TRUE_FALSE' THEN
           v_is_correct := (v_user_answer = v_question.correct_answer);
           
        WHEN 'MULTIPLE_SELECT' THEN
           -- Use helper function to compare JSON arrays
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
              v_is_correct := FALSE; -- Pending manual review
           ELSE
              v_is_correct := (public.normalize_answer(v_user_answer) = public.normalize_answer(v_question.correct_answer));
           END IF;

        WHEN 'FILL_IN_THE_BLANK' THEN
           -- Split by ';&&;' and compare each part
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

      -- Calculate Score
      IF v_is_correct THEN
         v_total_score := v_total_score + v_q_score;
      END IF;
      v_max_score := v_max_score + v_q_score;

      -- Add to Attempts (Includes Correct Answer for Review)
      -- NOTE: We return the correct answer here so the user can review their mistakes AFTER submission.
      v_attempt_item := jsonb_build_object(
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

  -- 4. Insert Result
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

  -- 5. Cleanup Progress
  DELETE FROM public.quiz_progress 
  WHERE user_id = v_user_id AND config_id = p_config_id::text;

  -- Return Result as JSON
  RETURN row_to_json(v_result_row)::jsonb;
END;
$$;
