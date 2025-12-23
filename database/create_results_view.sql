-- Create a view to return lightweight result summaries
-- This avoids fetching the full 'attempts' JSON (with images) while preserving scores for stats calculation

CREATE OR REPLACE VIEW public.quiz_results_summary_view 
WITH (security_invoker = true) -- Respect RLS policies of the underlying table
AS 
SELECT 
    id, 
    user_id, 
    username, 
    timestamp, 
    score, 
    max_score, 
    passing_score, 
    is_passed, 
    total_questions, 
    config_id, 
    config_name, 
    status, 
    duration, 
    -- Extract only score and maxScore from attempts JSON array
    COALESCE(
        (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'score', COALESCE((elem->>'score')::numeric, 0), 
                    'maxScore', COALESCE((elem->>'maxScore')::numeric, 0)
                )
                ORDER BY idx
            )
            FROM jsonb_array_elements(COALESCE(attempts, '[]'::jsonb)) WITH ORDINALITY AS t(elem, idx)
        ), 
        '[]'::jsonb
    ) AS attempts
FROM public.quiz_results;

-- Grant access to the view
GRANT SELECT ON public.quiz_results_summary_view TO authenticated;
GRANT SELECT ON public.quiz_results_summary_view TO service_role;
