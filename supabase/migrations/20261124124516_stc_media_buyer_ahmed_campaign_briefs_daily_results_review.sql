-- STC Marketing Flow: professional media buying workflow.
-- Accounts remain linked through stc_members, with no passwords stored.
CREATE TABLE IF NOT EXISTS public.stc_media_profiles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]{1,80}$'),
 display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 120),
 member_id uuid UNIQUE REFERENCES public.stc_members(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.stc_media_profiles ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON public.stc_media_profiles TO authenticated;
DROP POLICY IF EXISTS stc_media_profile_read ON public.stc_media_profiles;
CREATE POLICY stc_media_profile_read ON public.stc_media_profiles FOR SELECT TO authenticated
 USING ((SELECT stc_private.is_manager()) OR member_id=(SELECT auth.uid()));
DROP POLICY IF EXISTS stc_media_profile_manager_write ON public.stc_media_profiles;
CREATE POLICY stc_media_profile_manager_write ON public.stc_media_profiles FOR ALL TO authenticated
 USING ((SELECT stc_private.is_manager()))
 WITH CHECK ((SELECT stc_private.is_manager()));

CREATE TABLE IF NOT EXISTS public.stc_media_campaigns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 profile_id uuid NOT NULL REFERENCES public.stc_media_profiles(id) ON DELETE RESTRICT,
 title text NOT NULL CHECK(length(trim(title)) BETWEEN 3 AND 180),
 brand text NOT NULL DEFAULT 'STC' CHECK(brand IN ('STC','iChem','Other')),
 platform text NOT NULL DEFAULT 'Meta' CHECK(platform IN ('Meta','Google','TikTok','LinkedIn','Other')),
 post_label text NOT NULL CHECK(length(trim(post_label)) BETWEEN 3 AND 250),
 post_url text NOT NULL DEFAULT '' CHECK(length(post_url) <= 2000 AND (post_url='' OR post_url ~* '^https?://[^[:space:]]+$')),
 objective text NOT NULL CHECK(objective IN ('awareness','engagement','messages','leads','traffic','sales','other')),
 goal_notes text NOT NULL DEFAULT '' CHECK(length(goal_notes)<=3000),
 target_results integer CHECK(target_results IS NULL OR target_results >= 0),
 daily_budget numeric(14,2) NOT NULL CHECK(daily_budget > 0 AND daily_budget <= 100000000),
 currency text NOT NULL DEFAULT 'EGP' CHECK(currency IN ('EGP','USD','EUR','SAR','AED')),
 start_date date NOT NULL,
 end_date date NOT NULL,
 status text NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','active','paused','completed','cancelled')),
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=4000),
 created_by uuid NOT NULL REFERENCES public.stc_members(id) DEFAULT auth.uid(),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(end_date >= start_date AND end_date <= start_date + 365)
);
CREATE INDEX IF NOT EXISTS stc_media_campaign_profile_dates ON public.stc_media_campaigns(profile_id,start_date DESC);
CREATE INDEX IF NOT EXISTS stc_media_campaign_status ON public.stc_media_campaigns(status);
ALTER TABLE public.stc_media_campaigns ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON public.stc_media_campaigns TO authenticated;
DROP POLICY IF EXISTS stc_media_campaign_read ON public.stc_media_campaigns;
CREATE POLICY stc_media_campaign_read ON public.stc_media_campaigns FOR SELECT TO authenticated
 USING (
  (SELECT stc_private.is_manager())
  OR EXISTS(SELECT 1 FROM public.stc_media_profiles p WHERE p.id=profile_id AND p.member_id=(SELECT auth.uid()))
 );
DROP POLICY IF EXISTS stc_media_campaign_create ON public.stc_media_campaigns;
CREATE POLICY stc_media_campaign_create ON public.stc_media_campaigns FOR INSERT TO authenticated
 WITH CHECK ((SELECT stc_private.is_manager()) AND created_by=(SELECT auth.uid()));
DROP POLICY IF EXISTS stc_media_campaign_update ON public.stc_media_campaigns;
CREATE POLICY stc_media_campaign_update ON public.stc_media_campaigns FOR UPDATE TO authenticated
 USING ((SELECT stc_private.is_manager()))
 WITH CHECK ((SELECT stc_private.is_manager()));

CREATE TABLE IF NOT EXISTS public.stc_media_results (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 campaign_id uuid NOT NULL REFERENCES public.stc_media_campaigns(id) ON DELETE RESTRICT,
 report_date date NOT NULL,
 amount_spent numeric(14,2) NOT NULL DEFAULT 0 CHECK(amount_spent>=0 AND amount_spent<=100000000),
 impressions integer NOT NULL DEFAULT 0 CHECK(impressions>=0),
 reach integer NOT NULL DEFAULT 0 CHECK(reach>=0),
 clicks integer NOT NULL DEFAULT 0 CHECK(clicks>=0),
 results_count integer NOT NULL DEFAULT 0 CHECK(results_count>=0),
 result_label text NOT NULL DEFAULT 'Results' CHECK(length(result_label)<=100),
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=4000),
 status text NOT NULL DEFAULT 'pending_review' CHECK(status IN ('pending_review','approved','changes_requested')),
 review_note text NOT NULL DEFAULT '' CHECK(length(review_note)<=3000),
 submitted_by uuid NOT NULL REFERENCES public.stc_members(id) DEFAULT auth.uid(),
 reviewed_by uuid REFERENCES public.stc_members(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(campaign_id,report_date)
);
CREATE INDEX IF NOT EXISTS stc_media_results_campaign_date ON public.stc_media_results(campaign_id,report_date DESC);
CREATE INDEX IF NOT EXISTS stc_media_results_pending ON public.stc_media_results(status) WHERE status='pending_review';
ALTER TABLE public.stc_media_results ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON public.stc_media_results TO authenticated;
DROP POLICY IF EXISTS stc_media_results_read ON public.stc_media_results;
CREATE POLICY stc_media_results_read ON public.stc_media_results FOR SELECT TO authenticated
 USING (
 (SELECT stc_private.is_manager())
 OR EXISTS(
  SELECT 1 FROM public.stc_media_campaigns c
  JOIN public.stc_media_profiles p ON p.id=c.profile_id
  WHERE c.id=campaign_id AND p.member_id=(SELECT auth.uid())
 )
 );
DROP POLICY IF EXISTS stc_media_results_create ON public.stc_media_results;
CREATE POLICY stc_media_results_create ON public.stc_media_results FOR INSERT TO authenticated
 WITH CHECK (
  NOT (SELECT stc_private.is_manager())
  AND submitted_by=(SELECT auth.uid())
  AND status='pending_review' AND reviewed_by IS NULL AND review_note=''
  AND EXISTS(
   SELECT 1 FROM public.stc_media_campaigns c JOIN public.stc_media_profiles p ON p.id=c.profile_id
   WHERE c.id=campaign_id AND p.member_id=(SELECT auth.uid()) AND c.status IN ('active','paused','completed')
     AND report_date BETWEEN c.start_date AND c.end_date
  )
 );
DROP POLICY IF EXISTS stc_media_results_update ON public.stc_media_results;
CREATE POLICY stc_media_results_update ON public.stc_media_results FOR UPDATE TO authenticated
 USING (
  (SELECT stc_private.is_manager())
  OR (submitted_by=(SELECT auth.uid()) AND status='changes_requested'
    AND EXISTS(
     SELECT 1 FROM public.stc_media_campaigns c JOIN public.stc_media_profiles p ON p.id=c.profile_id
     WHERE c.id=campaign_id AND p.member_id=(SELECT auth.uid())
    ))
 )
 WITH CHECK (
  (SELECT stc_private.is_manager())
  OR (submitted_by=(SELECT auth.uid()) AND status='pending_review'
    AND EXISTS(
     SELECT 1 FROM public.stc_media_campaigns c JOIN public.stc_media_profiles p ON p.id=c.profile_id
     WHERE c.id=campaign_id AND p.member_id=(SELECT auth.uid())
    ))
 );

CREATE OR REPLACE FUNCTION stc_private.guard_media_result()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
DECLARE mgr boolean := stc_private.is_manager();
DECLARE assigned uuid;
DECLARE start_day date;
DECLARE end_day date;
BEGIN
 SELECT p.member_id,c.start_date,c.end_date INTO assigned,start_day,end_day
 FROM public.stc_media_campaigns c JOIN public.stc_media_profiles p ON p.id=c.profile_id
 WHERE c.id=NEW.campaign_id;
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
 IF assigned IS NULL OR start_day IS NULL THEN RAISE EXCEPTION 'Campaign assignment missing'; END IF;
 IF NEW.report_date < start_day OR NEW.report_date > end_day THEN
   RAISE EXCEPTION 'Report date is outside the campaign schedule';
 END IF;
 IF TG_OP='INSERT' THEN
  IF mgr OR assigned IS DISTINCT FROM auth.uid() OR NEW.submitted_by IS DISTINCT FROM auth.uid()
      OR NEW.status <> 'pending_review' OR NEW.reviewed_by IS NOT NULL OR NEW.review_note <> '' THEN
   RAISE EXCEPTION 'Only the assigned media buyer may submit an initial result';
  END IF;
 ELSE
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.campaign_id IS DISTINCT FROM OLD.campaign_id
     OR NEW.report_date IS DISTINCT FROM OLD.report_date OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
   RAISE EXCEPTION 'Media result identity is immutable';
  END IF;
  IF mgr THEN
   IF OLD.status <> 'pending_review' OR NEW.status NOT IN ('approved','changes_requested')
      OR NEW.amount_spent IS DISTINCT FROM OLD.amount_spent
      OR NEW.impressions IS DISTINCT FROM OLD.impressions OR NEW.reach IS DISTINCT FROM OLD.reach
      OR NEW.clicks IS DISTINCT FROM OLD.clicks OR NEW.results_count IS DISTINCT FROM OLD.results_count
      OR NEW.result_label IS DISTINCT FROM OLD.result_label OR NEW.notes IS DISTINCT FROM OLD.notes THEN
     RAISE EXCEPTION 'Manager may only review a pending submission';
   END IF;
   NEW.reviewed_by:=auth.uid();
  ELSIF assigned=auth.uid() THEN
   IF OLD.status<>'changes_requested' OR NEW.status<>'pending_review'
      OR NEW.review_note IS DISTINCT FROM OLD.review_note OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by THEN
    RAISE EXCEPTION 'Employee may only resubmit results that need changes';
   END IF;
  ELSE
   RAISE EXCEPTION 'Not allowed to change this campaign result';
  END IF;
 END IF;
 NEW.updated_at:=clock_timestamp();
 RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS stc_media_result_guard ON public.stc_media_results;
CREATE TRIGGER stc_media_result_guard BEFORE INSERT OR UPDATE ON public.stc_media_results
 FOR EACH ROW EXECUTE FUNCTION stc_private.guard_media_result();

CREATE OR REPLACE FUNCTION stc_private.touch_media_campaign()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
BEGIN
 NEW.id:=OLD.id;NEW.created_by:=OLD.created_by;NEW.created_at:=OLD.created_at;
 NEW.updated_at:=clock_timestamp();RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS stc_media_campaign_touch ON public.stc_media_campaigns;
CREATE TRIGGER stc_media_campaign_touch BEFORE UPDATE ON public.stc_media_campaigns
 FOR EACH ROW EXECUTE FUNCTION stc_private.touch_media_campaign();

-- Deployment-specific media profiles are provisioned separately.

DO $do$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime'
   AND schemaname='public' AND tablename='stc_media_campaigns') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.stc_media_campaigns;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime'
   AND schemaname='public' AND tablename='stc_media_results') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.stc_media_results;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime'
   AND schemaname='public' AND tablename='stc_media_profiles') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.stc_media_profiles;
 END IF;
END $do$;
