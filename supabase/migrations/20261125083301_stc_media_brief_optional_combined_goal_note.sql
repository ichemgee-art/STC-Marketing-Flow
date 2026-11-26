ALTER TABLE public.stc_media_briefs ALTER COLUMN goal SET DEFAULT '';
ALTER TABLE public.stc_media_briefs DROP CONSTRAINT IF EXISTS stc_media_briefs_goal_check;
ALTER TABLE public.stc_media_briefs ADD CONSTRAINT stc_media_briefs_goal_check CHECK(length(goal)<=2500);
COMMENT ON COLUMN public.stc_media_briefs.instructions IS 'Optional combined campaign goal, instructions, application/platform and manager notes';
COMMENT ON COLUMN public.stc_media_briefs.goal IS 'Legacy compatibility field; v2 manager form stores its single optional goal/note in instructions';
