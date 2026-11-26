CREATE TABLE IF NOT EXISTS stc_private.storage_viewers(
 member_id uuid PRIMARY KEY REFERENCES public.stc_members(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON stc_private.storage_viewers FROM PUBLIC, anon, authenticated;
-- Deployment-specific storage viewer grants are provisioned privately; no real account IDs in this repository.

CREATE OR REPLACE FUNCTION stc_private.can_view_storage()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
 SELECT auth.uid() IS NOT NULL AND EXISTS(
   SELECT 1 FROM public.stc_members m
   WHERE m.id=auth.uid() AND m.active
     AND (m.role='manager'
       OR EXISTS(SELECT 1 FROM stc_private.storage_viewers v WHERE v.member_id=m.id))
 );
$fn$;
REVOKE ALL ON FUNCTION stc_private.can_view_storage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION stc_private.can_view_storage() TO authenticated;

CREATE OR REPLACE FUNCTION public.stc_can_view_storage()
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $fn$ SELECT stc_private.can_view_storage(); $fn$;
REVOKE ALL ON FUNCTION public.stc_can_view_storage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stc_can_view_storage() TO authenticated;

CREATE OR REPLACE FUNCTION public.stc_manager_storage_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE overview jsonb;
BEGIN
  -- This function runs as a privileged DB owner so authorized viewers can see
  -- metadata for all private buckets, never file contents or signed URLs.
  IF auth.uid() IS NULL OR NOT stc_private.can_view_storage() THEN
    RAISE EXCEPTION 'STC authorized storage viewer access required' USING ERRCODE = '42501';
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

DROP POLICY IF EXISTS stc_storage_viewers_read ON storage.objects;
CREATE POLICY stc_storage_viewers_read ON storage.objects FOR SELECT TO authenticated
 USING(
   bucket_id IN ('stc-history','stc-task-files','stc-seo-evidence','stc-seo-workbooks')
   AND (SELECT stc_private.can_view_storage())
 );
