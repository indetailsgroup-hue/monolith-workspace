-- =============================================================================
-- Migration: schema contract convergence
--
-- Several historical migrations used CREATE TABLE IF NOT EXISTS after the
-- minimal clean-bootstrap stubs had already created the relation. PostgreSQL
-- correctly kept the existing relation, but did not add the columns declared in
-- the later CREATE TABLE statement. The eTax partitioning migration also
-- replaced the queue with a narrower table and left older RPC contracts behind.
--
-- This forward-only migration makes both paths converge without rewriting
-- applied migration history. All additions are nullable or have safe defaults;
-- existing production rows are preserved.
-- =============================================================================

BEGIN;

-- Canonical multi-tenant columns omitted when the bootstrap stub existed first.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS primary_color TEXT,
  ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{
    "locale": "th-TH",
    "currency": "THB",
    "timezone": "Asia/Bangkok",
    "enableCurvedPanels": false,
    "enableNesting": false,
    "enableDxfExport": false,
    "quotationPrefix": "ORG",
    "jobCodePrefix": "ORG"
  }'::jsonb,
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.org_members
  ADD COLUMN IF NOT EXISTS member_id UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS org_members_member_id_key
  ON public.org_members (member_id);

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 0177 published approval routing against employee_id/role_key membership
-- columns, while the installation schema stored auth user_id/general role.
-- Materialize the routing contract and derive it from the canonical identity
-- binding so approval delivery can resolve the intended employee safely.
ALTER TABLE public.installation_memberships
  ADD COLUMN IF NOT EXISTS employee_id UUID,
  ADD COLUMN IF NOT EXISTS role_key TEXT;

UPDATE public.installation_memberships im
SET employee_id = ib.employee_id,
    role_key = COALESCE(
      ib.app_role,
      CASE im.role
        WHEN 'foreman' THEN 'installation_team_lead'
        WHEN 'office' THEN 'project_manager'
        ELSE im.role
      END
    )
FROM public.identity_binding ib
WHERE ib.auth_user_id = im.user_id
  AND ib.is_active
  AND (im.employee_id IS DISTINCT FROM ib.employee_id OR im.role_key IS NULL);

CREATE INDEX IF NOT EXISTS installation_memberships_approval_route_idx
  ON public.installation_memberships (project_id, role_key)
  WHERE is_active;

CREATE OR REPLACE FUNCTION public.fn_installation_membership_route_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_binding public.identity_binding%ROWTYPE;
BEGIN
  SELECT ib.* INTO v_binding
  FROM public.identity_binding ib
  WHERE ib.auth_user_id = NEW.user_id AND ib.is_active
  ORDER BY ib.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    NEW.employee_id := v_binding.employee_id;
    NEW.role_key := COALESCE(
      v_binding.app_role,
      CASE NEW.role
        WHEN 'foreman' THEN 'installation_team_lead'
        WHEN 'office' THEN 'project_manager'
        ELSE NEW.role
      END
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_installation_membership_route_fields
  ON public.installation_memberships;
CREATE TRIGGER trg_installation_membership_route_fields
  BEFORE INSERT OR UPDATE OF user_id, role ON public.installation_memberships
  FOR EACH ROW EXECUTE FUNCTION public.fn_installation_membership_route_fields();

-- Restore the complete eTax queue contract on the partitioned parent. These are
-- the columns published by 0181/0182/0183 and consumed by their RPCs.
ALTER TABLE public.etax_submissions
  ADD COLUMN IF NOT EXISTS document_number TEXT,
  ADD COLUMN IF NOT EXISTS document_date DATE,
  ADD COLUMN IF NOT EXISTS net_amount NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS vat_amount NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS gross_amount NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,4) DEFAULT 0.0700,
  ADD COLUMN IF NOT EXISTS seller_tax_id TEXT,
  ADD COLUMN IF NOT EXISTS buyer_tax_id TEXT,
  ADD COLUMN IF NOT EXISTS buyer_name TEXT,
  ADD COLUMN IF NOT EXISTS rd_ref_no TEXT,
  ADD COLUMN IF NOT EXISTS rd_response_code TEXT,
  ADD COLUMN IF NOT EXISTS error_detail TEXT,
  ADD COLUMN IF NOT EXISTS xml_payload TEXT,
  ADD COLUMN IF NOT EXISTS pdf_error TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID;

-- The PDF worker contract uses downloading/downloaded while the partition
-- migration introduced processing/ready. Keep the union during compatibility
-- convergence so neither deployed worker generation is rejected.
ALTER TABLE public.etax_submissions
  DROP CONSTRAINT IF EXISTS etax_submissions_pdf_status_check;

ALTER TABLE public.etax_submissions
  ADD CONSTRAINT etax_submissions_pdf_status_check CHECK (
    pdf_status IS NULL OR pdf_status IN (
      'pending', 'processing', 'ready', 'downloading', 'downloaded', 'failed'
    )
  );

-- Receipt reversals carry a per-line explanation. The legacy ledger table had
-- only an entry-level description, while the RPC already published line detail.
ALTER TABLE public.journal_line
  ADD COLUMN IF NOT EXISTS description TEXT;

-- Field-purchase accounting is tenant-scoped. Derive org_id from the owning
-- installation project for existing rows and on every future insert/update.
ALTER TABLE public.field_purchase_request
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(org_id);

UPDATE public.field_purchase_request fpr
SET org_id = ip.org_id
FROM public.installation_projects ip
WHERE ip.id = fpr.project_id
  AND fpr.org_id IS DISTINCT FROM ip.org_id;

CREATE OR REPLACE FUNCTION public.fn_fpr_derive_org_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT ip.org_id
  INTO NEW.org_id
  FROM public.installation_projects ip
  WHERE ip.id = NEW.project_id;

  IF NEW.org_id IS NULL THEN
    RAISE EXCEPTION 'field purchase project % has no organization', NEW.project_id
      USING ERRCODE = '23502';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fpr_derive_org_id ON public.field_purchase_request;
CREATE TRIGGER trg_fpr_derive_org_id
  BEFORE INSERT OR UPDATE OF project_id ON public.field_purchase_request
  FOR EACH ROW EXECUTE FUNCTION public.fn_fpr_derive_org_id();

-- Correct the People & Culture helper to the canonical organization key and
-- canonical trial column.
CREATE OR REPLACE FUNCTION public.is_org_active(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    o.status = 'ACTIVE'
    AND (o.trial_ends_at IS NULL OR o.trial_ends_at > NOW()),
    FALSE
  )
  FROM public.organizations o
  WHERE o.org_id = p_org_id
$$;

COMMIT;
