
-- 42_debug_grading_helper.sql

-- Helper function to test grading logic for a specific question and answer
-- This bypasses the full submit_quiz flow and authentication requirements
CREATE OR REPLACE FUNCTION public.debug_grade_question(
  p_question_id UUID,
  p_user_answer TEXT
)
RETURNS TABLE (
  question_id UUID,
  question_type TEXT,
  raw_correct_answer TEXT,
  parsed_correct_answer TEXT[],
  user_answer TEXT,
  parsed_user_answer TEXT[],
  is_correct BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    q.id,
    q.type::text,
    q.correct_answer,
    -- Debug parsing of correct answer
    CASE 
        WHEN q.correct_answer ~ '^\s*\[' THEN 
            ARRAY(SELECT jsonb_array_elements_text(q.correct_answer::jsonb))
        ELSE 
            string_to_array(q.correct_answer, ';&&;')
    END,
    p_user_answer,
    -- Debug parsing of user answer
    string_to_array(p_user_answer, ';&&;'),
    -- The actual grading logic
    (
       SELECT bool_and(
         public.normalize_answer(u_part) = public.normalize_answer(c_part)
       )
       FROM unnest(
          string_to_array(p_user_answer, ';&&;'), 
          CASE 
              WHEN q.correct_answer ~ '^\s*\[' THEN 
                  ARRAY(SELECT jsonb_array_elements_text(q.correct_answer::jsonb))
              ELSE 
                  string_to_array(q.correct_answer, ';&&;')
          END
       ) AS t(u_part, c_part)
    )
  FROM public.questions q
  WHERE q.id = p_question_id;
END;
$$;

-- Grant execute to anon for debugging script
GRANT EXECUTE ON FUNCTION public.debug_grade_question(UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.debug_grade_question(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.debug_grade_question(UUID, TEXT) TO service_role;
