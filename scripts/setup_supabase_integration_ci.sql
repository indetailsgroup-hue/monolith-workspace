-- Test-only helpers for the isolated local Supabase integration lane.
-- This file is applied after migrations and never ships to hosted environments.

CREATE OR REPLACE FUNCTION public.exec_sql(
  query text,
  params jsonb DEFAULT '[]'::jsonb
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  rendered text := regexp_replace(query, ';[[:space:]]*$', '');
  param_index integer;
BEGIN
  IF jsonb_typeof(params) = 'array' THEN
    FOR param_index IN REVERSE jsonb_array_length(params)..1 LOOP
      rendered := replace(
        rendered,
        '$' || param_index::text,
        quote_nullable(params ->> (param_index - 1))
      );
    END LOOP;
  END IF;

  IF lower(rendered) ~ '^[[:space:]]*(select|with|show|values)([[:space:]]|$)' THEN
    RETURN QUERY EXECUTE
      'SELECT to_jsonb(result_row) FROM (' || rendered || ') AS result_row';
  ELSE
    EXECUTE rendered;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.exec_sql(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.exec_sql(text, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
