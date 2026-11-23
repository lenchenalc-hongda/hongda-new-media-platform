-- Ephemeral mirror of the existing QA private-object proof lookup. This is a
-- test fixture only and is not a production or QA installation artifact.
CREATE OR REPLACE FUNCTION public.wos_qa_get_storage_object_for_proof(p_path text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $wos$
DECLARE
  object storage.objects%ROWTYPE;
BEGIN
  IF p_path IS NULL
    OR length(p_path) > 600
    OR p_path NOT LIKE 'organizations/%/wos/production-order/%/images/%'
  THEN
    RAISE EXCEPTION 'INVALID_STORAGE_PATH' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO object
  FROM storage.objects
  WHERE bucket_id = 'wos-private'
    AND name = p_path
    AND is_delete_marker = false
    AND archived_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'STORAGE_OBJECT_NOT_FOUND' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object(
    'id', object.id,
    'ownerId', object.owner_id,
    'version', object.version,
    'updatedAt', object.updated_at,
    'mimeType', object.metadata->>'mimetype',
    'byteSize', object.metadata->>'size'
  );
END
$wos$;

REVOKE ALL ON FUNCTION public.wos_qa_get_storage_object_for_proof(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wos_qa_get_storage_object_for_proof(text)
  TO service_role;
