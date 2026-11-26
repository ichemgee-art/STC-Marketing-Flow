-- Make the SEO role split effective in the database too, not just the UI.
DROP POLICY IF EXISTS stc_seo_progress_insert ON public.stc_seo_progress;
CREATE POLICY stc_seo_progress_insert ON public.stc_seo_progress
 FOR INSERT TO authenticated
 WITH CHECK (
   created_by=(SELECT auth.uid())
   AND EXISTS (
     SELECT 1 FROM public.stc_seo_targets t
     JOIN public.stc_seo_profiles p ON p.id=t.profile_id
     WHERE t.id=target_id
       AND p.member_id=(SELECT auth.uid())
       AND to_char(work_date, 'YYYY-MM')=t.month_key
   )
 );

DROP POLICY IF EXISTS stc_seo_hours_create ON public.stc_seo_hours;
CREATE POLICY stc_seo_hours_create ON public.stc_seo_hours
 FOR INSERT TO authenticated
 WITH CHECK (
   created_by=(SELECT auth.uid())
   AND EXISTS (
     SELECT 1 FROM public.stc_seo_profiles p
     WHERE p.id=profile_id AND p.member_id=(SELECT auth.uid())
   )
 );

-- The manager can review all reports but cannot impersonate a staff member
-- to erase their attendance records.
DROP POLICY IF EXISTS stc_seo_hours_manage ON public.stc_seo_hours;
CREATE POLICY stc_seo_hours_manage ON public.stc_seo_hours
 FOR DELETE TO authenticated
 USING (created_by=(SELECT auth.uid())
   AND EXISTS (SELECT 1 FROM public.stc_seo_profiles p
     WHERE p.id=profile_id AND p.member_id=(SELECT auth.uid())));

CREATE OR REPLACE FUNCTION stc_private.guard_seo_screenshot_entry() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $fn$
DECLARE owner_id uuid;
BEGIN
 IF new.origin <> 'manual' THEN RETURN new; END IF;
 SELECT p.member_id INTO owner_id
 FROM public.stc_seo_periods e
 JOIN public.stc_seo_profiles p ON p.id=e.profile_id
 WHERE e.id=new.period_id;
 IF auth.uid() IS NULL OR owner_id IS DISTINCT FROM auth.uid()
    OR new.uploaded_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the assigned SEO specialist can upload manual evidence';
 END IF;
 RETURN new;
END;
$fn$;
DROP TRIGGER IF EXISTS stc_seo_manual_screenshot_guard ON public.stc_seo_assets;
CREATE TRIGGER stc_seo_manual_screenshot_guard
 BEFORE INSERT ON public.stc_seo_assets
 FOR EACH ROW EXECUTE FUNCTION stc_private.guard_seo_screenshot_entry();
