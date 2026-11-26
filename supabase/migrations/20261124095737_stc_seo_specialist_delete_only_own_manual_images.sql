CREATE POLICY stc_seo_assets_owner_delete ON public.stc_seo_assets
 FOR DELETE TO authenticated USING (
  origin='manual' AND uploaded_by=(SELECT auth.uid()) AND
  EXISTS (
   SELECT 1 FROM public.stc_seo_periods period
   JOIN public.stc_seo_profiles profile ON profile.id=period.profile_id
   WHERE period.id=stc_seo_assets.period_id
   AND profile.member_id=(SELECT auth.uid())
  )
 );
CREATE POLICY stc_seo_evidence_owner_delete ON storage.objects
 FOR DELETE TO authenticated USING (
  bucket_id='stc-seo-evidence'
  AND EXISTS (
   SELECT 1 FROM public.stc_seo_assets asset
   JOIN public.stc_seo_periods period ON period.id=asset.period_id
   JOIN public.stc_seo_profiles profile ON profile.id=period.profile_id
   WHERE asset.object_path=storage.objects.name
   AND asset.origin='manual'
   AND asset.uploaded_by=(SELECT auth.uid())
   AND profile.member_id=(SELECT auth.uid())
  )
 );
