-- STC Media Buying v2: Nardine provides a simple brief; Ahmed submits five optional answers.
-- Legacy stc_media_campaigns and stc_media_results are deliberately retained unchanged.
CREATE TABLE IF NOT EXISTS public.stc_media_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.stc_media_profiles(id) ON DELETE RESTRICT,
  post_url text NOT NULL CHECK (length(post_url) BETWEEN 10 AND 2000 AND post_url ~* '^https?://[^[:space:]]+$'),
  goal text NOT NULL CHECK (length(trim(goal)) BETWEEN 1 AND 2500),
  instructions text NOT NULL DEFAULT '' CHECK (length(instructions) <= 4000),
  created_by uuid NOT NULL REFERENCES public.stc_members(id) DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid REFERENCES public.stc_members(id),
  version integer NOT NULL DEFAULT 1 CHECK(version > 0)
);
CREATE INDEX IF NOT EXISTS stc_media_briefs_profile_created ON public.stc_media_briefs(profile_id,created_at DESC) WHERE deleted_at IS NULL;
ALTER TABLE public.stc_media_briefs ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON public.stc_media_briefs TO authenticated;
DROP POLICY IF EXISTS stc_media_briefs_read ON public.stc_media_briefs;
CREATE POLICY stc_media_briefs_read ON public.stc_media_briefs FOR SELECT TO authenticated
 USING(
  (SELECT stc_private.is_manager()) OR
  (deleted_at IS NULL AND EXISTS(
    SELECT 1 FROM public.stc_media_profiles p
    WHERE p.id=profile_id AND p.member_id=(SELECT auth.uid())
  ))
 );
DROP POLICY IF EXISTS stc_media_briefs_insert ON public.stc_media_briefs;
CREATE POLICY stc_media_briefs_insert ON public.stc_media_briefs FOR INSERT TO authenticated
 WITH CHECK((SELECT stc_private.is_manager()) AND created_by=(SELECT auth.uid())
   AND deleted_at IS NULL AND deleted_by IS NULL);
DROP POLICY IF EXISTS stc_media_briefs_update ON public.stc_media_briefs;
CREATE POLICY stc_media_briefs_update ON public.stc_media_briefs FOR UPDATE TO authenticated
 USING((SELECT stc_private.is_manager())) WITH CHECK((SELECT stc_private.is_manager()));

CREATE OR REPLACE FUNCTION stc_private.guard_media_brief()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
BEGIN
 IF NOT stc_private.is_manager() OR auth.uid() IS NULL THEN
  RAISE EXCEPTION 'Only an active manager may change a campaign brief';
 END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.created_by IS DISTINCT FROM auth.uid() OR NEW.deleted_at IS NOT NULL OR NEW.deleted_by IS NOT NULL THEN
   RAISE EXCEPTION 'Invalid campaign brief creator';
  END IF;
  NEW.version:=1;
 ELSE
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.profile_id IS DISTINCT FROM OLD.profile_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR OLD.deleted_at IS NOT NULL THEN
   RAISE EXCEPTION 'Campaign identity is immutable and deleted campaigns cannot be edited';
  END IF;
  IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
   IF NEW.deleted_at IS NULL OR NEW.deleted_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Invalid campaign deletion';
   END IF;
  ELSIF NEW.deleted_by IS DISTINCT FROM OLD.deleted_by THEN
   RAISE EXCEPTION 'Invalid deletion attribution';
  END IF;
  NEW.updated_at:=clock_timestamp();
  NEW.version:=OLD.version+1;
 END IF;
 RETURN NEW;
END
$fn$;
DROP TRIGGER IF EXISTS stc_media_briefs_guard ON public.stc_media_briefs;
CREATE TRIGGER stc_media_briefs_guard BEFORE INSERT OR UPDATE ON public.stc_media_briefs
 FOR EACH ROW EXECUTE FUNCTION stc_private.guard_media_brief();

CREATE TABLE IF NOT EXISTS public.stc_media_submissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 brief_id uuid NOT NULL UNIQUE REFERENCES public.stc_media_briefs(id) ON DELETE RESTRICT,
 campaign_post text NOT NULL DEFAULT '' CHECK(length(campaign_post)<=2000),
 campaign_goal text NOT NULL DEFAULT '' CHECK(length(campaign_goal)<=2500),
 daily_budget numeric(14,2) CHECK (daily_budget IS NULL OR (daily_budget>=0 AND daily_budget<=100000000)),
 currency text NOT NULL DEFAULT 'EGP' CHECK(currency IN ('EGP','USD','EUR','SAR','AED','OTHER')),
 start_date date,
 end_date date,
 results text NOT NULL DEFAULT '' CHECK(length(results)<=4000),
 note text NOT NULL DEFAULT '' CHECK(length(note)<=4000),
 status text NOT NULL DEFAULT 'pending_review' CHECK(status IN ('pending_review','approved','changes_requested')),
 review_note text NOT NULL DEFAULT '' CHECK(length(review_note)<=3000),
 submitted_by uuid NOT NULL REFERENCES public.stc_members(id) DEFAULT auth.uid(),
 reviewed_by uuid REFERENCES public.stc_members(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT stc_media_valid_period CHECK (start_date IS NULL OR end_date IS NULL OR end_date>=start_date)
);
CREATE INDEX IF NOT EXISTS stc_media_submission_pending ON public.stc_media_submissions(status,created_at DESC) WHERE status='pending_review';
ALTER TABLE public.stc_media_submissions ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON public.stc_media_submissions TO authenticated;

DROP POLICY IF EXISTS stc_media_submissions_read ON public.stc_media_submissions;
CREATE POLICY stc_media_submissions_read ON public.stc_media_submissions FOR SELECT TO authenticated
 USING ((SELECT stc_private.is_manager()) OR EXISTS(
  SELECT 1 FROM public.stc_media_briefs b
  JOIN public.stc_media_profiles p ON p.id=b.profile_id
  WHERE b.id=brief_id AND b.deleted_at IS NULL AND p.member_id=(SELECT auth.uid())
 ));
DROP POLICY IF EXISTS stc_media_submissions_insert ON public.stc_media_submissions;
CREATE POLICY stc_media_submissions_insert ON public.stc_media_submissions FOR INSERT TO authenticated
 WITH CHECK(
  NOT (SELECT stc_private.is_manager()) AND submitted_by=(SELECT auth.uid())
  AND status='pending_review' AND reviewed_by IS NULL AND review_note=''
  AND EXISTS(
   SELECT 1 FROM public.stc_media_briefs b
   JOIN public.stc_media_profiles p ON p.id=b.profile_id
   WHERE b.id=brief_id AND b.deleted_at IS NULL AND p.member_id=(SELECT auth.uid())
  )
 );
DROP POLICY IF EXISTS stc_media_submissions_update ON public.stc_media_submissions;
CREATE POLICY stc_media_submissions_update ON public.stc_media_submissions FOR UPDATE TO authenticated
 USING(
  (SELECT stc_private.is_manager()) OR
  (submitted_by=(SELECT auth.uid()) AND status='changes_requested' AND EXISTS(
   SELECT 1 FROM public.stc_media_briefs b
   JOIN public.stc_media_profiles p ON p.id=b.profile_id
   WHERE b.id=brief_id AND b.deleted_at IS NULL AND p.member_id=(SELECT auth.uid())
  ))
 )
 WITH CHECK(
  (SELECT stc_private.is_manager()) OR
  (submitted_by=(SELECT auth.uid()) AND status='pending_review' AND EXISTS(
   SELECT 1 FROM public.stc_media_briefs b
   JOIN public.stc_media_profiles p ON p.id=b.profile_id
   WHERE b.id=brief_id AND b.deleted_at IS NULL AND p.member_id=(SELECT auth.uid())
  ))
 );

CREATE OR REPLACE FUNCTION stc_private.guard_media_submission()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
DECLARE owner_id uuid;
DECLARE deleted timestamptz;
DECLARE mgr boolean:=stc_private.is_manager();
BEGIN
 SELECT p.member_id,b.deleted_at INTO owner_id,deleted FROM public.stc_media_briefs b
 JOIN public.stc_media_profiles p ON p.id=b.profile_id
 WHERE b.id=NEW.brief_id;
 IF auth.uid() IS NULL OR owner_id IS NULL OR deleted IS NOT NULL THEN
  RAISE EXCEPTION 'Campaign is unavailable';
 END IF;
 IF TG_OP='INSERT' THEN
  IF mgr OR owner_id IS DISTINCT FROM auth.uid() OR NEW.submitted_by IS DISTINCT FROM auth.uid()
   OR NEW.status<>'pending_review' OR NEW.review_note<>'' OR NEW.reviewed_by IS NOT NULL THEN
   RAISE EXCEPTION 'Only Ahmed can submit a campaign report';
  END IF;
 ELSE
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.brief_id IS DISTINCT FROM OLD.brief_id
   OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
   RAISE EXCEPTION 'Campaign report identity cannot be changed';
  END IF;
  IF mgr THEN
   IF OLD.status<>'pending_review' OR NEW.status NOT IN ('approved','changes_requested')
    OR NEW.campaign_post IS DISTINCT FROM OLD.campaign_post
    OR NEW.campaign_goal IS DISTINCT FROM OLD.campaign_goal
    OR NEW.daily_budget IS DISTINCT FROM OLD.daily_budget
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.start_date IS DISTINCT FROM OLD.start_date
    OR NEW.end_date IS DISTINCT FROM OLD.end_date
    OR NEW.results IS DISTINCT FROM OLD.results
    OR NEW.note IS DISTINCT FROM OLD.note THEN
    RAISE EXCEPTION 'Manager may only review a submitted report';
   END IF;
   IF NEW.status='changes_requested' AND trim(NEW.review_note)='' THEN
    RAISE EXCEPTION 'Review feedback is required for requested changes';
   END IF;
   NEW.reviewed_by:=auth.uid();
  ELSIF owner_id=auth.uid() THEN
   IF OLD.status<>'changes_requested' OR NEW.status<>'pending_review'
    OR NEW.review_note<>'' OR NEW.reviewed_by IS NOT NULL THEN
    RAISE EXCEPTION 'Only a returned report can be resubmitted';
   END IF;
  ELSE
   RAISE EXCEPTION 'Not authorized to update this report';
  END IF;
  NEW.updated_at:=clock_timestamp();
 END IF;
 RETURN NEW;
END
$fn$;
DROP TRIGGER IF EXISTS stc_media_submission_guard ON public.stc_media_submissions;
CREATE TRIGGER stc_media_submission_guard BEFORE INSERT OR UPDATE ON public.stc_media_submissions
 FOR EACH ROW EXECUTE FUNCTION stc_private.guard_media_submission();

DO $do$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_publication_tables
  WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='stc_media_briefs') THEN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.stc_media_briefs;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_publication_tables
  WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='stc_media_submissions') THEN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.stc_media_submissions;
 END IF;
END
$do$;
