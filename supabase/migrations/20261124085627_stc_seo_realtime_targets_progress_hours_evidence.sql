DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['stc_seo_targets','stc_seo_progress','stc_seo_hours','stc_seo_assets','stc_seo_periods']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',t);
    END IF;
  END LOOP;
END $$;
