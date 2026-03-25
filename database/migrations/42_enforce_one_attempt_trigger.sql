CREATE OR REPLACE FUNCTION public.enforce_quiz_one_attempt_on_results_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_allow_one_attempt BOOLEAN := false;
  v_last_reset_at BIGINT := 0;
  v_now_ms BIGINT := (extract(epoch from now()) * 1000)::bigint;
  v_cutoff BIGINT := 0;
BEGIN
  SELECT allow_one_attempt, COALESCE(last_reset_at, 0)
  INTO v_allow_one_attempt, v_last_reset_at
  FROM public.quiz_configs
  WHERE id::text = NEW.config_id
  LIMIT 1;

  IF COALESCE(v_allow_one_attempt, false) THEN
    v_cutoff := CASE
      WHEN v_last_reset_at > 0 AND v_last_reset_at <= v_now_ms THEN v_last_reset_at
      ELSE 0
    END;

    IF EXISTS (
      SELECT 1
      FROM public.quiz_results qr
      WHERE qr.user_id = NEW.user_id
        AND qr.config_id = NEW.config_id
        AND qr.timestamp > v_cutoff
    ) THEN
      RAISE EXCEPTION 'One attempt limit reached for this quiz.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_quiz_one_attempt_on_results_insert ON public.quiz_results;

CREATE TRIGGER trg_enforce_quiz_one_attempt_on_results_insert
BEFORE INSERT ON public.quiz_results
FOR EACH ROW
EXECUTE FUNCTION public.enforce_quiz_one_attempt_on_results_insert();
