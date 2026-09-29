-- v16.7.0 — Search bookmarks table + autocomplete RPC + increment RPC
-- =====================================================================

-- ─── Search Bookmarks Table ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS search_bookmarks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL DEFAULT auth.uid(),
  label       TEXT NOT NULL,
  query       TEXT NOT NULL,
  entity_types TEXT[] NOT NULL DEFAULT ARRAY['job','member','invoice'],
  org_filter  UUID REFERENCES organizations(org_id) ON DELETE SET NULL,
  use_count   INT NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: users can only see/manage their own bookmarks
ALTER TABLE search_bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own bookmarks"
  ON search_bookmarks
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Index for fast lookup by user
CREATE INDEX idx_search_bookmarks_user ON search_bookmarks(user_id);

-- ─── Autocomplete Suggestions RPC ───────────────────────────────────
-- Returns top queries from platform_search_logs matching a prefix

CREATE OR REPLACE FUNCTION get_search_suggestions(
  query_prefix TEXT,
  result_limit INT DEFAULT 8
)
RETURNS TABLE(query_text TEXT, frequency BIGINT, last_used TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    query AS query_text,
    COUNT(*) AS frequency,
    MAX(created_at) AS last_used
  FROM platform_search_logs
  WHERE query ILIKE (query_prefix || '%')
  GROUP BY query
  ORDER BY frequency DESC, last_used DESC
  LIMIT result_limit;
$$;

-- ─── Increment Bookmark Use RPC ─────────────────────────────────────

CREATE OR REPLACE FUNCTION increment_bookmark_use(bookmark_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE search_bookmarks
  SET use_count = use_count + 1,
      last_used_at = now()
  WHERE id = bookmark_id
    AND user_id = auth.uid();
END;
$$;
