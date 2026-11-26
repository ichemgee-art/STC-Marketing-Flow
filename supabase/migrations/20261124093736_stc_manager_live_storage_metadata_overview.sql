CREATE OR REPLACE FUNCTION public.stc_manager_storage_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE overview jsonb;
BEGIN
  -- This function runs as a privileged DB owner so the manager can see
  -- metadata for all private buckets, never file contents or signed URLs.
  IF auth.uid() IS NULL OR NOT stc_private.is_manager() THEN
    RAISE EXCEPTION 'STC manager access required' USING ERRCODE = '42501';
  END IF;
  WITH live_objects AS (
    SELECT
      o.id, o.bucket_id, o.name, o.created_at, o.updated_at,
      CASE WHEN (o.metadata ->> 'size') ~ '^[0-9]{1,18}$'
           THEN (o.metadata ->> 'size')::bigint ELSE 0::bigint END AS byte_size,
      coalesce(nullif(o.metadata ->> 'mimetype',''), 'application/octet-stream') AS mime_type
    FROM storage.objects o
    WHERE coalesce(o.is_delete_marker,false) = false
      AND o.archived_at IS NULL
      AND o.name <> '.emptyFolderPlaceholder'
  ),
  bucket_totals AS (
    SELECT b.id AS bucket_id, b.name AS bucket_name, b.public AS is_public,
      count(o.id)::integer AS file_count,
      coalesce(sum(o.byte_size),0)::bigint AS total_bytes,
      max(o.created_at) AS latest_file_at
    FROM storage.buckets b
    LEFT JOIN live_objects o ON o.bucket_id = b.id
    GROUP BY b.id, b.name, b.public
  ),
  newest AS (
    SELECT bucket_id, name, created_at, updated_at, byte_size, mime_type
    FROM live_objects ORDER BY created_at DESC, name DESC LIMIT 60
  )
  SELECT jsonb_build_object(
    'measured_at',clock_timestamp(),
    'total_bytes',(SELECT coalesce(sum(total_bytes),0)::bigint FROM bucket_totals),
    'total_files',(SELECT coalesce(sum(file_count),0)::integer FROM bucket_totals),
    'buckets',coalesce(
      (SELECT jsonb_agg(jsonb_build_object(
        'id',bucket_id,'name',bucket_name,'public',is_public,
        'file_count',file_count,'total_bytes',total_bytes,
        'latest_file_at',latest_file_at
      ) ORDER BY total_bytes DESC,bucket_name) FROM bucket_totals),
      '[]'::jsonb
    ),
    'recent',coalesce(
      (SELECT jsonb_agg(jsonb_build_object(
        'bucket_id',bucket_id,'name',name,'size_bytes',byte_size,
        'mime_type',mime_type,'created_at',created_at,'updated_at',updated_at
      ) ORDER BY created_at DESC,name DESC) FROM newest),
      '[]'::jsonb
    )
  ) INTO overview;
  RETURN overview;
END;
$function$;

REVOKE ALL ON FUNCTION public.stc_manager_storage_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stc_manager_storage_overview() TO authenticated;
COMMENT ON FUNCTION public.stc_manager_storage_overview() IS
'Manager-only live current Storage objects: bucket sizes, counts, last 60 file metadata. Not GB-hour usage/billing; no file contents/URLs.';
