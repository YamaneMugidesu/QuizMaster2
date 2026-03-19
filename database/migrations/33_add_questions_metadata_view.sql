
-- Create a helper function to calculate blank count from correct_answer
-- This handles both JSON arrays and legacy ';&&;' separators
CREATE OR REPLACE FUNCTION public.calculate_blank_count(answer TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF answer IS NULL OR answer = '' THEN
    RETURN 1;
  END IF;

  -- Try to parse as JSON array
  BEGIN
    RETURN jsonb_array_length(answer::jsonb);
  EXCEPTION WHEN OTHERS THEN
    -- Fallback to separator check
    IF position(';&&;' in answer) > 0 THEN
       -- Count occurrences of separator + 1
       -- Trick: (length(str) - length(replace(str, sep, ''))) / length(sep)
       RETURN (length(answer) - length(replace(answer, ';&&;', ''))) / 4 + 1;
    ELSE
       RETURN 1;
    END IF;
  END;
END;
$$;

-- Create a secure metadata view that exposes blank_count but HIDES correct_answer
CREATE OR REPLACE VIEW public.questions_metadata_view AS
SELECT 
  id,
  public.calculate_blank_count(correct_answer) as blank_count
FROM public.questions
WHERE is_deleted = false AND is_disabled = false;

-- Grant access to the view
GRANT SELECT ON public.questions_metadata_view TO authenticated;
GRANT SELECT ON public.questions_metadata_view TO anon;
