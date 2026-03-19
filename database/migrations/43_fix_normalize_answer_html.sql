
-- 43_fix_normalize_answer_html.sql

-- ==========================================
-- Enhance normalize_answer to strip HTML tags
-- ==========================================
-- The database stores some answers wrapped in HTML tags (e.g. "<p>answer</p>").
-- The user submits plain text (e.g. "answer").
-- We need to strip HTML tags before normalizing to ensure correct comparison.

CREATE OR REPLACE FUNCTION public.normalize_answer(p_text TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_text TEXT;
BEGIN
  IF p_text IS NULL THEN
    RETURN '';
  END IF;

  -- 1. Strip HTML tags (simple regex approach)
  -- Removes anything between < and >
  v_text := regexp_replace(p_text, '<[^>]+>', '', 'g');

  -- 2. Decode HTML entities (basic ones) if necessary
  -- Postgres doesn't have a built-in unescape function easily available in standard install,
  -- but usually the editor sends decoded text inside P tags.
  -- If we see &nbsp;, replace with space
  v_text := replace(v_text, '&nbsp;', ' ');
  v_text := replace(v_text, '&amp;', '&');
  v_text := replace(v_text, '&lt;', '<');
  v_text := replace(v_text, '&gt;', '>');
  v_text := replace(v_text, '&quot;', '"');

  -- 3. Standard normalization (Trim, Lowercase, Remove punctuation)
  -- Remove punctuation/symbols except alphanumeric and spaces
  -- Keep Chinese characters, letters, numbers
  -- v_text := regexp_replace(v_text, '[^\w\s\u4e00-\u9fa5]', '', 'g'); 
  -- Actually, let's just trim and lowercase for now to be safe, 
  -- aggressive punctuation removal might break math/chemistry answers.
  
  -- Current logic: Trim whitespace, Lowercase.
  v_text := lower(trim(v_text));
  
  -- Collapse multiple spaces
  v_text := regexp_replace(v_text, '\s+', ' ', 'g');

  RETURN v_text;
END;
$$;
