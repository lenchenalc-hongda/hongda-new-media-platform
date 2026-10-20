-- HongdaOS commercial quotation archive V2 (additive; DO NOT apply directly to Production).
-- Immutable quote snapshots, per-number revisions, and a private PDF bucket.
-- Server route uses verified Supabase identity and service role; anon/authenticated
-- have no direct write access. Download URLs must be short-lived and scoped.
BEGIN;

CREATE TABLE public.commercial_quotation_archives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  owner_profile_id uuid NOT NULL,
  document_no text NOT NULL CHECK (length(btrim(document_no)) BETWEEN 1 AND 80),
  version integer NOT NULL CHECK (version BETWEEN 1 AND 1000000),
  source_archive_id uuid,
  buyer_name text NOT NULL CHECK (length(btrim(buyer_name)) BETWEEN 1 AND 300),
  buyer_customer_reference_id uuid,
  salesperson_name text NOT NULL,
  project_name text NOT NULL DEFAULT '',
  document_date date NOT NULL,
  market text NOT NULL CHECK (market IN ('domestic','export')),
  language text NOT NULL CHECK (language IN ('zh','en')),
  currency text NOT NULL CHECK (currency IN ('CNY','USD','EUR')),
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  pdf_storage_path text NOT NULL UNIQUE,
  pdf_sha256 text NOT NULL CHECK (pdf_sha256 ~ '^[0-9a-f]{64}$'),
  pdf_size_bytes integer NOT NULL CHECK (pdf_size_bytes BETWEEN 100 AND 10485760),
  archived_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_commercial_quotation_org_id_id UNIQUE (id,org_id),
  CONSTRAINT uq_commercial_quotation_version UNIQUE (org_id,document_no,version),
  CONSTRAINT fk_commercial_quotation_owner_org FOREIGN KEY (owner_profile_id,org_id)
    REFERENCES public.profiles(id,org_id),
  CONSTRAINT fk_commercial_quotation_source_org FOREIGN KEY (source_archive_id,org_id)
    REFERENCES public.commercial_quotation_archives(id,org_id)
);

CREATE INDEX idx_commercial_quote_org_date
 ON public.commercial_quotation_archives (org_id,archived_at DESC);
CREATE INDEX idx_commercial_quote_owner_date
 ON public.commercial_quotation_archives (org_id,owner_profile_id,archived_at DESC);
CREATE INDEX idx_commercial_quote_customer
 ON public.commercial_quotation_archives (org_id,buyer_name);
CREATE INDEX idx_commercial_quote_number
 ON public.commercial_quotation_archives (org_id,document_no);

ALTER TABLE public.commercial_quotation_archives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_quotation_archives FORCE ROW LEVEL SECURITY;

-- RLS is defense-in-depth. App API must still resolve active profiles and role.
CREATE POLICY commercial_quotation_archive_read ON public.commercial_quotation_archives
 FOR SELECT TO authenticated USING (
   EXISTS (
     SELECT 1 FROM public.profiles p
     WHERE p.user_id = auth.uid() AND p.org_id = commercial_quotation_archives.org_id
       AND p.is_active = true
       AND (
         p.id = commercial_quotation_archives.owner_profile_id
         OR p.role IN ('admin','manager')
       )
   )
 );
GRANT SELECT ON public.commercial_quotation_archives TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.commercial_quotation_archives FROM anon, authenticated;

-- NEVER expose this bucket publicly. No client write grants or public object policies.
INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES ('hongda-commercial-pdfs','hongda-commercial-pdfs',false,10485760,ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

COMMIT;
