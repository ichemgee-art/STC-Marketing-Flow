-- Run only AFTER verifying pg_cron is available and the migration passed hosted checks.
-- Hourly at minute 5. EOD snapshot is taken on the first run at/after 18:00 Cairo.
-- Inspect before activation: select * from cron.job; do not duplicate an existing job.
select cron.schedule('stc-marketing-digest','5 * * * *','select stc_private.scheduled_digest()');
-- Reversible disable: select cron.unschedule('stc-marketing-digest');
