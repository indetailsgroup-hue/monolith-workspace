-- Platform Full-Text Search with ts_vector ranking
-- Replaces ILIKE with proper FTS for performance and relevance scoring
-- v16.6.0 (schema-corrected: job_code/invoice_code/member_id/org_id PK)

-- ─── Enable pg_trgm extension (if not already) ──────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- ─── Add tsvector columns ────────────────────────────────────────────────────

-- Jobs: searchable text vector
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION jobs_search_vector_update() RETURNS trigger AS $$
DECLARE
  v_customer_name TEXT;
BEGIN
  SELECT name INTO v_customer_name
    FROM public.customers WHERE customer_id = NEW.customer_id;
  NEW.search_vector :=
    setweight(to_tsvector('simple', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.job_code, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(v_customer_name, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.notes, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS jobs_search_vector_trigger ON public.jobs;
CREATE TRIGGER jobs_search_vector_trigger
  BEFORE INSERT OR UPDATE OF title, job_code, notes
  ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION jobs_search_vector_update();

-- Backfill existing rows
UPDATE public.jobs j SET search_vector =
  setweight(to_tsvector('simple', coalesce(j.title, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(j.job_code, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(c.name, '')), 'B') ||
  setweight(to_tsvector('simple', coalesce(j.notes, '')), 'C')
FROM public.customers c
WHERE c.customer_id = j.customer_id;

-- Rows with no customer FK
UPDATE public.jobs SET search_vector =
  setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(job_code, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(notes, '')), 'C')
WHERE search_vector IS NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_search_vector ON public.jobs USING gin(search_vector);

-- Members: searchable text vector
ALTER TABLE public.org_members ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION members_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', coalesce(NEW.display_name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.email, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.role::TEXT, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS members_search_vector_trigger ON public.org_members;
CREATE TRIGGER members_search_vector_trigger
  BEFORE INSERT OR UPDATE OF display_name, email, role
  ON public.org_members
  FOR EACH ROW EXECUTE FUNCTION members_search_vector_update();

UPDATE public.org_members SET search_vector =
  setweight(to_tsvector('simple', coalesce(display_name, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(email, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(role::TEXT, '')), 'B');

CREATE INDEX IF NOT EXISTS idx_members_search_vector ON public.org_members USING gin(search_vector);

-- Invoices: searchable text vector
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION invoices_search_vector_update() RETURNS trigger AS $$
DECLARE
  v_customer_name TEXT;
BEGIN
  SELECT name INTO v_customer_name
    FROM public.customers WHERE customer_id = NEW.customer_id;
  NEW.search_vector :=
    setweight(to_tsvector('simple', coalesce(NEW.invoice_code, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(v_customer_name, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.notes, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS invoices_search_vector_trigger ON public.invoices;
CREATE TRIGGER invoices_search_vector_trigger
  BEFORE INSERT OR UPDATE OF invoice_code, notes
  ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION invoices_search_vector_update();

-- Backfill existing rows
UPDATE public.invoices i SET search_vector =
  setweight(to_tsvector('simple', coalesce(i.invoice_code, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(c.name, '')), 'B') ||
  setweight(to_tsvector('simple', coalesce(i.notes, '')), 'C')
FROM public.customers c
WHERE c.customer_id = i.customer_id;

UPDATE public.invoices SET search_vector =
  setweight(to_tsvector('simple', coalesce(invoice_code, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(notes, '')), 'C')
WHERE search_vector IS NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_search_vector ON public.invoices USING gin(search_vector);

-- ─── Search Analytics Table ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform_search_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  query TEXT NOT NULL,
  entity_types TEXT[] NOT NULL DEFAULT '{job,member,invoice}',
  org_filter UUID REFERENCES public.organizations(org_id),
  result_count INT NOT NULL DEFAULT 0,
  query_time_ms INT NOT NULL DEFAULT 0,
  clicked_result_id UUID,
  clicked_result_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_logs_created ON platform_search_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_logs_query ON platform_search_logs USING gin(to_tsvector('simple', query));
CREATE INDEX IF NOT EXISTS idx_search_logs_user ON platform_search_logs(user_id);

-- RLS: only super admins can read search logs
ALTER TABLE platform_search_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY search_logs_super_admin ON platform_search_logs
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid()));

CREATE POLICY search_logs_insert ON platform_search_logs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ─── Replace Search RPCs with FTS-ranked versions ────────────────────────────

CREATE OR REPLACE FUNCTION platform_search_jobs(
  search_query TEXT,
  result_limit INT DEFAULT 20,
  result_offset INT DEFAULT 0,
  filter_org_id UUID DEFAULT NULL
)
RETURNS TABLE (
  job_id UUID,
  org_id UUID,
  org_name TEXT,
  title TEXT,
  job_code TEXT,
  status TEXT,
  customer_name TEXT,
  match_field TEXT,
  match_snippet TEXT,
  rank REAL,
  created_at TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  tsquery_val tsquery;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Super Admin access required';
  END IF;

  tsquery_val := to_tsquery('simple',
    array_to_string(
      array(SELECT word || ':*' FROM unnest(string_to_array(trim(search_query), ' ')) AS word WHERE word <> ''),
      ' & '
    )
  );

  RETURN QUERY
  WITH matches AS (
    SELECT
      j.job_id,
      j.org_id,
      o.name AS org_name,
      j.title,
      j.job_code,
      j.status::TEXT,
      coalesce(c.name, '') AS customer_name,
      CASE
        WHEN j.title    ILIKE '%' || search_query || '%' THEN 'title'
        WHEN j.job_code ILIKE '%' || search_query || '%' THEN 'job_code'
        WHEN c.name     ILIKE '%' || search_query || '%' THEN 'customer_name'
        ELSE 'notes'
      END AS match_field,
      ts_headline('simple',
        coalesce(j.title,'') || ' ' || coalesce(j.job_code,'') || ' ' || coalesce(c.name,'') || ' ' || coalesce(j.notes,''),
        tsquery_val,
        'StartSel=<mark>, StopSel=</mark>, MaxWords=20, MinWords=5'
      ) AS match_snippet,
      ts_rank_cd(j.search_vector, tsquery_val, 32) AS rank,
      j.created_at,
      COUNT(*) OVER() AS total_count
    FROM public.jobs j
    JOIN public.organizations o ON o.org_id = j.org_id
    LEFT JOIN public.customers c ON c.customer_id = j.customer_id
    WHERE (filter_org_id IS NULL OR j.org_id = filter_org_id)
      AND (
        j.search_vector @@ tsquery_val
        OR j.title    ILIKE '%' || search_query || '%'
        OR j.job_code ILIKE '%' || search_query || '%'
        OR c.name     ILIKE '%' || search_query || '%'
      )
    ORDER BY rank DESC, j.created_at DESC
    LIMIT result_limit
    OFFSET result_offset
  )
  SELECT * FROM matches;
END;
$$;

CREATE OR REPLACE FUNCTION platform_search_members(
  search_query TEXT,
  result_limit INT DEFAULT 20,
  result_offset INT DEFAULT 0,
  filter_org_id UUID DEFAULT NULL
)
RETURNS TABLE (
  member_id UUID,
  org_id UUID,
  org_name TEXT,
  display_name TEXT,
  email TEXT,
  role TEXT,
  match_field TEXT,
  match_snippet TEXT,
  rank REAL,
  joined_at TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  tsquery_val tsquery;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Super Admin access required';
  END IF;

  tsquery_val := to_tsquery('simple',
    array_to_string(
      array(SELECT word || ':*' FROM unnest(string_to_array(trim(search_query), ' ')) AS word WHERE word <> ''),
      ' & '
    )
  );

  RETURN QUERY
  WITH matches AS (
    SELECT
      m.member_id,
      m.org_id,
      o.name AS org_name,
      m.display_name,
      m.email,
      m.role::TEXT,
      CASE
        WHEN m.display_name ILIKE '%' || search_query || '%' THEN 'display_name'
        WHEN m.email        ILIKE '%' || search_query || '%' THEN 'email'
        ELSE 'role'
      END AS match_field,
      ts_headline('simple', coalesce(m.display_name,'') || ' ' || coalesce(m.email,''),
        tsquery_val,
        'StartSel=<mark>, StopSel=</mark>, MaxWords=10, MinWords=3'
      ) AS match_snippet,
      ts_rank_cd(m.search_vector, tsquery_val, 32) AS rank,
      m.joined_at,
      COUNT(*) OVER() AS total_count
    FROM public.org_members m
    JOIN public.organizations o ON o.org_id = m.org_id
    WHERE (filter_org_id IS NULL OR m.org_id = filter_org_id)
      AND (
        m.search_vector @@ tsquery_val
        OR m.display_name ILIKE '%' || search_query || '%'
        OR m.email        ILIKE '%' || search_query || '%'
      )
    ORDER BY rank DESC, m.joined_at DESC NULLS LAST
    LIMIT result_limit
    OFFSET result_offset
  )
  SELECT * FROM matches;
END;
$$;

CREATE OR REPLACE FUNCTION platform_search_invoices(
  search_query TEXT,
  result_limit INT DEFAULT 20,
  result_offset INT DEFAULT 0,
  filter_org_id UUID DEFAULT NULL
)
RETURNS TABLE (
  invoice_id UUID,
  org_id UUID,
  org_name TEXT,
  invoice_code TEXT,
  status TEXT,
  total NUMERIC,
  customer_name TEXT,
  match_field TEXT,
  match_snippet TEXT,
  rank REAL,
  issued_at TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  tsquery_val tsquery;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Super Admin access required';
  END IF;

  tsquery_val := to_tsquery('simple',
    array_to_string(
      array(SELECT word || ':*' FROM unnest(string_to_array(trim(search_query), ' ')) AS word WHERE word <> ''),
      ' & '
    )
  );

  RETURN QUERY
  WITH matches AS (
    SELECT
      i.invoice_id,
      i.org_id,
      o.name AS org_name,
      i.invoice_code,
      i.status::TEXT,
      i.total,
      coalesce(c.name, '') AS customer_name,
      CASE
        WHEN i.invoice_code ILIKE '%' || search_query || '%' THEN 'invoice_code'
        WHEN c.name         ILIKE '%' || search_query || '%' THEN 'customer_name'
        ELSE 'notes'
      END AS match_field,
      ts_headline('simple',
        coalesce(i.invoice_code,'') || ' ' || coalesce(c.name,'') || ' ' || coalesce(i.notes,''),
        tsquery_val,
        'StartSel=<mark>, StopSel=</mark>, MaxWords=20, MinWords=5'
      ) AS match_snippet,
      ts_rank_cd(i.search_vector, tsquery_val, 32) AS rank,
      i.issued_at,
      COUNT(*) OVER() AS total_count
    FROM public.invoices i
    JOIN public.organizations o ON o.org_id = i.org_id
    LEFT JOIN public.customers c ON c.customer_id = i.customer_id
    WHERE (filter_org_id IS NULL OR i.org_id = filter_org_id)
      AND (
        i.search_vector @@ tsquery_val
        OR i.invoice_code ILIKE '%' || search_query || '%'
        OR c.name         ILIKE '%' || search_query || '%'
      )
    ORDER BY rank DESC, i.issued_at DESC NULLS LAST
    LIMIT result_limit
    OFFSET result_offset
  )
  SELECT * FROM matches;
END;
$$;

-- ─── Log Search RPC ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION log_platform_search(
  search_query TEXT,
  entity_types TEXT[],
  org_filter UUID DEFAULT NULL,
  result_count INT DEFAULT 0,
  query_time_ms INT DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  log_id UUID;
BEGIN
  INSERT INTO platform_search_logs (user_id, query, entity_types, org_filter, result_count, query_time_ms)
  VALUES (auth.uid(), search_query, entity_types, org_filter, result_count, query_time_ms)
  RETURNING id INTO log_id;
  RETURN log_id;
END;
$$;

-- ─── Search Analytics RPCs ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_search_analytics(
  days_back INT DEFAULT 30
)
RETURNS TABLE (
  total_searches BIGINT,
  unique_users BIGINT,
  avg_query_time_ms NUMERIC,
  avg_result_count NUMERIC,
  zero_result_rate NUMERIC,
  searches_per_day JSONB,
  top_queries JSONB,
  top_entity_types JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Super Admin access required';
  END IF;

  RETURN QUERY
  WITH period AS (
    SELECT * FROM platform_search_logs
    WHERE created_at >= now() - (days_back || ' days')::interval
  ),
  daily AS (
    SELECT date_trunc('day', created_at)::date AS day, COUNT(*) AS cnt
    FROM period GROUP BY 1 ORDER BY 1
  ),
  queries AS (
    SELECT lower(trim(query)) AS q, COUNT(*) AS cnt
    FROM period GROUP BY 1 ORDER BY 2 DESC LIMIT 20
  ),
  types AS (
    SELECT unnest(entity_types) AS etype, COUNT(*) AS cnt
    FROM period GROUP BY 1 ORDER BY 2 DESC
  )
  SELECT
    (SELECT COUNT(*) FROM period)::BIGINT,
    (SELECT COUNT(DISTINCT user_id) FROM period)::BIGINT,
    (SELECT ROUND(AVG(query_time_ms), 1) FROM period),
    (SELECT ROUND(AVG(result_count), 1) FROM period),
    (SELECT ROUND(
      COUNT(*) FILTER (WHERE result_count = 0)::NUMERIC / GREATEST(COUNT(*), 1) * 100, 1
    ) FROM period),
    (SELECT jsonb_agg(jsonb_build_object('date', day, 'count', cnt) ORDER BY day) FROM daily),
    (SELECT jsonb_agg(jsonb_build_object('query', q, 'count', cnt) ORDER BY cnt DESC) FROM queries),
    (SELECT jsonb_agg(jsonb_build_object('type', etype, 'count', cnt) ORDER BY cnt DESC) FROM types);
END;
$$;

GRANT EXECUTE ON FUNCTION log_platform_search TO authenticated;
GRANT EXECUTE ON FUNCTION get_search_analytics TO authenticated;
