ALTER TABLE public.stc_seo_metrics
 ADD COLUMN IF NOT EXISTS before_value numeric(16,2),
 ADD COLUMN IF NOT EXISTS after_value numeric(16,2);
DO $ensure$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.stc_seo_metrics'::regclass AND conname='stc_seo_before_after_valid') THEN
  ALTER TABLE public.stc_seo_metrics ADD CONSTRAINT stc_seo_before_after_valid CHECK(
    (before_value IS NULL OR (before_value >= 0 AND before_value <= 1000000000000))
    AND (after_value IS NULL OR (after_value >= 0 AND after_value <= 1000000000000))
    AND (metric_key <> 'ctr' OR
      ((before_value IS NULL OR before_value<=100) AND (after_value IS NULL OR after_value<=100)))
  );
 END IF;
END $ensure$;

-- Preserve the legacy target_value / actual_value columns untouched, but
-- the new metric workflow exclusively uses specialist-entered before/after values.
CREATE OR REPLACE FUNCTION stc_private.guard_seo_metric()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $fn$
DECLARE
  is_mgr boolean := stc_private.is_manager();
  owner_id uuid;
BEGIN
 SELECT member_id INTO owner_id FROM public.stc_seo_profiles WHERE id=OLD.profile_id;
 IF NEW.id IS DISTINCT FROM OLD.id
  OR NEW.profile_id IS DISTINCT FROM OLD.profile_id
  OR NEW.month_key IS DISTINCT FROM OLD.month_key
  OR NEW.metric_key IS DISTINCT FROM OLD.metric_key THEN
   RAISE EXCEPTION 'Metric identity is immutable';
 END IF;
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Login required'; END IF;

 -- These legacy values no longer represent a target. Only the new columns
 -- are writable, and only by the SEO specialist who owns this profile.
 IF NEW.target_value IS DISTINCT FROM OLD.target_value
    OR NEW.actual_value IS DISTINCT FROM OLD.actual_value THEN
  RAISE EXCEPTION 'Legacy KPI target/result columns are read-only';
 END IF;

 IF is_mgr THEN
   IF NEW.before_value IS DISTINCT FROM OLD.before_value
      OR NEW.after_value IS DISTINCT FROM OLD.after_value
      OR NEW.note IS DISTINCT FROM OLD.note THEN
     RAISE EXCEPTION 'Only the SEO specialist can enter before and after values';
   END IF;

   IF NEW.status IS DISTINCT FROM OLD.status THEN
     IF OLD.status <> 'pending_review'
        OR NEW.status NOT IN ('approved','changes_requested')
        OR OLD.before_value IS NULL OR OLD.after_value IS NULL THEN
       RAISE EXCEPTION 'Only a complete submitted SEO comparison can be reviewed';
     END IF;
     NEW.reviewed_by := auth.uid();
   ELSIF NEW.review_note IS DISTINCT FROM OLD.review_note
       OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by THEN
     RAISE EXCEPTION 'Review feedback requires an approval or changes-requested decision';
   END IF;
 ELSIF owner_id = auth.uid() THEN
   IF NEW.review_note IS DISTINCT FROM OLD.review_note
      OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by THEN
      RAISE EXCEPTION 'Review feedback belongs to the manager';
   END IF;
   IF OLD.status IN ('approved','pending_review') THEN
     RAISE EXCEPTION 'This SEO comparison is already submitted for review';
   END IF;
   IF NEW.status <> 'pending_review'
      OR NEW.before_value IS NULL OR NEW.after_value IS NULL THEN
     RAISE EXCEPTION 'Enter both before and after values and submit for review';
   END IF;
   NEW.reviewed_by := NULL;
 ELSE
   RAISE EXCEPTION 'Not authorized for this SEO profile';
 END IF;
 NEW.updated_by := auth.uid();
 NEW.updated_at := clock_timestamp();
 RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION stc_private.audit_seo_metric()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 INSERT INTO public.stc_seo_metric_events(metric_id,actor_id,action,before_data,after_data)
 VALUES (new.id,auth.uid(),
  CASE WHEN new.status IS DISTINCT FROM old.status THEN new.status
       WHEN new.before_value IS DISTINCT FROM old.before_value
          OR new.after_value IS DISTINCT FROM old.after_value THEN 'comparison_updated'
       ELSE 'updated' END,
  to_jsonb(old),to_jsonb(new));
 RETURN new;
END;
$fn$;

DROP POLICY IF EXISTS stc_seo_metric_manager_create ON public.stc_seo_metrics;
CREATE POLICY stc_seo_metric_manager_create ON public.stc_seo_metrics
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT stc_private.is_manager())
    AND before_value IS NULL AND after_value IS NULL
    AND target_value IS NULL AND actual_value IS NULL
    AND status='draft'
  );
