CREATE OR REPLACE FUNCTION stc_private.audit_task()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  event_kind text;
  actor_label text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authenticated actor required';
  END IF;
  SELECT display_name INTO actor_label FROM public.stc_members WHERE id=auth.uid();
  actor_label := coalesce(actor_label,'Team member');

  IF tg_op='INSERT' THEN
    event_kind := 'assigned';
  ELSIF new.deleted_at IS NOT NULL AND old.deleted_at IS NULL THEN
    event_kind := 'deleted';
  ELSIF new.assignee_id <> old.assignee_id THEN
    event_kind := 'reassigned';
  ELSIF new.status IS DISTINCT FROM old.status THEN
    event_kind := new.status;
  ELSE
    event_kind := 'updated';
  END IF;

  INSERT INTO public.stc_events(task_id,actor_id,action,details)
  VALUES (new.id,auth.uid(),event_kind,jsonb_build_object(
    'before',case when tg_op='UPDATE' then to_jsonb(old) else null end,
    'after',to_jsonb(new)
  ));

  -- Remove every notice when its task is removed; retain the audit event only.
  IF event_kind = 'deleted' THEN
    DELETE FROM public.stc_notifications WHERE task_id = new.id;
    RETURN new;
  -- Once a submission has been resolved, it is no longer in Nardine's
  -- waiting-for-review queue, even when the task remains active.
  ELSIF tg_op = 'UPDATE' AND old.status = 'waiting_review'
       AND new.status IS DISTINCT FROM old.status THEN
    DELETE FROM public.stc_notifications
      WHERE task_id = new.id AND kind = 'waiting_review';
  END IF;

  IF event_kind = 'waiting_review' THEN
    INSERT INTO public.stc_notifications(recipient_id,task_id,kind,task_title,actor_name)
    SELECT id,new.id,'waiting_review',new.title,actor_label
    FROM public.stc_members WHERE role='manager' AND active;
  ELSIF event_kind = 'reassigned' THEN
    INSERT INTO public.stc_notifications(recipient_id,task_id,kind,task_title,actor_name)
    VALUES (old.assignee_id,new.id,'unassigned',old.title,actor_label),
           (new.assignee_id,new.id,'assigned',new.title,actor_label);
  ELSIF event_kind IN ('assigned','approved','changes_requested','updated') THEN
    INSERT INTO public.stc_notifications(recipient_id,task_id,kind,task_title,actor_name)
    VALUES (new.assignee_id,new.id,event_kind,new.title,actor_label);
  END IF;
  RETURN new;
END;
$function$;
CREATE OR REPLACE FUNCTION stc_private.scheduled_digest(as_of_time timestamp with time zone DEFAULT now())
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare today date=(as_of_time at time zone 'Africa/Cairo')::date;
begin
 insert into public.stc_notifications(recipient_id,task_id,kind,dedupe_key)
 select t.assignee_id,t.id,case when t.due_date<today then 'overdue' else 'due_today' end,t.id::text||':'||today::text||':deadline'
 from public.stc_tasks t join public.stc_members m on m.id=t.assignee_id and m.active
 where t.deleted_at is null and t.due_date<=today and t.status<>'approved' on conflict(dedupe_key) do nothing;
 if extract(hour from as_of_time at time zone 'Africa/Cairo')>=18 then
  insert into public.stc_daily_reports(report_date,summary)
  select today,coalesce(jsonb_agg(r),'[]'::jsonb) from (
   select m.id,m.display_name,
    count(t.id) filter(where t.status='approved') approved,
    count(t.id) filter(where t.status='waiting_review') waiting_review,
    count(t.id) filter(where t.status='in_progress') in_progress,
    count(t.id) filter(where t.status='tomorrow') tomorrow,
    count(t.id) filter(where t.due_date<today and t.status<>'approved') overdue
   from public.stc_members m left join public.stc_tasks t on t.assignee_id=m.id and t.deleted_at is null
   where m.active group by m.id,m.display_name
  ) r on conflict(report_date) do nothing;
 end if;
end; $function$;
DELETE FROM public.stc_notifications n USING public.stc_tasks t WHERE n.task_id=t.id AND t.deleted_at IS NOT NULL;
