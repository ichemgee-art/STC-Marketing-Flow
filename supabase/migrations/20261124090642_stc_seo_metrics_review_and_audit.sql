CREATE TABLE IF NOT EXISTS public.stc_seo_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.stc_seo_profiles(id) ON DELETE CASCADE,
  month_key text NOT NULL CHECK (month_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  metric_key text NOT NULL CHECK (metric_key IN ('organic_traffic','impressions','ctr','average_position','ranking_keywords','referring_domains','backlinks','ga4_tracking','ai_responses','top_keywords')),
  target_value numeric(16,2) CHECK (target_value IS NULL OR (target_value >= 0 AND target_value <= 1000000000000)),
  actual_value numeric(16,2) CHECK (actual_value IS NULL OR (actual_value >= 0 AND actual_value <= 1000000000000)),
  note text NOT NULL DEFAULT '' CHECK (length(note)<=3000),
  review_note text NOT NULL DEFAULT '' CHECK (length(review_note)<=3000),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_review','approved','changes_requested')),
  updated_by uuid REFERENCES public.stc_members(id),
  reviewed_by uuid REFERENCES public.stc_members(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(profile_id,month_key,metric_key),
  CHECK (metric_key <> 'ctr' OR ((target_value IS NULL OR target_value<=100) AND (actual_value IS NULL OR actual_value<=100)))
);
CREATE INDEX IF NOT EXISTS stc_seo_metrics_profile_month ON public.stc_seo_metrics(profile_id,month_key);
ALTER TABLE public.stc_seo_metrics ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.stc_seo_metrics TO authenticated;

CREATE POLICY stc_seo_metric_read ON public.stc_seo_metrics FOR SELECT TO authenticated
 USING (EXISTS(SELECT 1 FROM public.stc_seo_profiles p WHERE p.id=profile_id
   AND ((SELECT stc_private.is_manager()) OR p.member_id=(SELECT auth.uid()))));
CREATE POLICY stc_seo_metric_manager_create ON public.stc_seo_metrics FOR INSERT TO authenticated
 WITH CHECK ((SELECT stc_private.is_manager()));
CREATE POLICY stc_seo_metric_team_update ON public.stc_seo_metrics FOR UPDATE TO authenticated
 USING (EXISTS(SELECT 1 FROM public.stc_seo_profiles p WHERE p.id=profile_id
   AND ((SELECT stc_private.is_manager()) OR p.member_id=(SELECT auth.uid()))))
 WITH CHECK (EXISTS(SELECT 1 FROM public.stc_seo_profiles p WHERE p.id=profile_id
   AND ((SELECT stc_private.is_manager()) OR p.member_id=(SELECT auth.uid()))));

CREATE OR REPLACE FUNCTION stc_private.guard_seo_metric() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $fn$
DECLARE is_mgr boolean := stc_private.is_manager();
DECLARE owner_id uuid;
BEGIN
  SELECT member_id INTO owner_id FROM public.stc_seo_profiles WHERE id=old.profile_id;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.profile_id IS DISTINCT FROM OLD.profile_id OR
     NEW.month_key IS DISTINCT FROM OLD.month_key OR NEW.metric_key IS DISTINCT FROM OLD.metric_key THEN
    RAISE EXCEPTION 'Metric identity is immutable';
  END IF;
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Login required'; END IF;
  IF is_mgr THEN
    IF NEW.actual_value IS DISTINCT FROM OLD.actual_value OR NEW.note IS DISTINCT FROM OLD.note THEN
      RAISE EXCEPTION 'Only the assigned specialist can enter the SEO result';
    END IF;
    IF NEW.target_value IS DISTINCT FROM OLD.target_value AND
       OLD.status IN ('pending_review','approved') THEN
      RAISE EXCEPTION 'Do not change a submitted or approved target';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF OLD.status <> 'pending_review' OR NEW.status NOT IN ('approved','changes_requested') OR OLD.actual_value IS NULL THEN
        RAISE EXCEPTION 'Only a submitted SEO result can be reviewed';
      END IF;
      NEW.reviewed_by := auth.uid();
    ELSIF NEW.review_note IS DISTINCT FROM OLD.review_note OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by THEN
      RAISE EXCEPTION 'Review feedback requires a review decision';
    END IF;
  ELSIF owner_id=auth.uid() THEN
    IF NEW.target_value IS DISTINCT FROM OLD.target_value OR
       NEW.review_note IS DISTINCT FROM OLD.review_note OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by THEN
      RAISE EXCEPTION 'Target and review decisions belong to the manager';
    END IF;
    IF OLD.status='approved' OR OLD.status='pending_review' THEN
      RAISE EXCEPTION 'This result is already submitted for review';
    END IF;
    IF NEW.status <> 'pending_review' OR NEW.actual_value IS NULL THEN
      RAISE EXCEPTION 'Enter an actual SEO result and submit it for review';
    END IF;
    NEW.reviewed_by := NULL;
  ELSE
    RAISE EXCEPTION 'Not authorized for this specialist';
  END IF;
  NEW.updated_by:=auth.uid();
  NEW.updated_at:=clock_timestamp();
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER stc_seo_metric_guard BEFORE UPDATE ON public.stc_seo_metrics
 FOR EACH ROW EXECUTE FUNCTION stc_private.guard_seo_metric();

CREATE TABLE IF NOT EXISTS public.stc_seo_metric_events(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 metric_id uuid NOT NULL REFERENCES public.stc_seo_metrics(id) ON DELETE CASCADE,
 actor_id uuid REFERENCES public.stc_members(id),
 action text NOT NULL,
 before_data jsonb,
 after_data jsonb NOT NULL,
 happened_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.stc_seo_metric_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.stc_seo_metric_events TO authenticated;
CREATE POLICY stc_seo_metric_event_read ON public.stc_seo_metric_events FOR SELECT TO authenticated
 USING (EXISTS (SELECT 1 FROM public.stc_seo_metrics k
  JOIN public.stc_seo_profiles p ON p.id=k.profile_id WHERE k.id=metric_id
  AND ((SELECT stc_private.is_manager()) OR p.member_id=(SELECT auth.uid()))));
CREATE OR REPLACE FUNCTION stc_private.audit_seo_metric() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 INSERT INTO public.stc_seo_metric_events(metric_id,actor_id,action,before_data,after_data)
 VALUES (new.id,auth.uid(),
  CASE WHEN new.status IS DISTINCT FROM old.status THEN new.status
       WHEN new.target_value IS DISTINCT FROM old.target_value THEN 'target_changed'
       ELSE 'result_updated' END,
  to_jsonb(old),to_jsonb(new));
 RETURN new;
END;
$fn$;
CREATE TRIGGER stc_seo_metric_audit AFTER UPDATE ON public.stc_seo_metrics
 FOR EACH ROW EXECUTE FUNCTION stc_private.audit_seo_metric();

CREATE OR REPLACE FUNCTION stc_private.seed_seo_month_metrics() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 IF new.period_kind='month' AND new.month_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
  INSERT INTO public.stc_seo_metrics(profile_id,month_key,metric_key)
  SELECT new.profile_id,new.month_key,key FROM
    unnest(ARRAY['organic_traffic','impressions','ctr','average_position','ranking_keywords',
      'referring_domains','backlinks','ga4_tracking','ai_responses','top_keywords']) AS key
  ON CONFLICT(profile_id,month_key,metric_key) DO NOTHING;
 END IF;
 RETURN new;
END;
$fn$;
CREATE TRIGGER stc_seo_month_metric_seed AFTER INSERT ON public.stc_seo_periods
 FOR EACH ROW EXECUTE FUNCTION stc_private.seed_seo_month_metrics();

INSERT INTO public.stc_seo_metrics(profile_id,month_key,metric_key)
SELECT DISTINCT e.profile_id,e.month_key,k.key
FROM public.stc_seo_periods e CROSS JOIN
  unnest(ARRAY['organic_traffic','impressions','ctr','average_position','ranking_keywords',
     'referring_domains','backlinks','ga4_tracking','ai_responses','top_keywords']) AS k(key)
WHERE e.period_kind='month' AND e.month_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
ON CONFLICT(profile_id,month_key,metric_key) DO NOTHING;

DO $block$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='stc_seo_metrics') THEN
 ALTER PUBLICATION supabase_realtime ADD TABLE public.stc_seo_metrics;
 END IF;
END $block$;
