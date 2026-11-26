CREATE OR REPLACE FUNCTION stc_private.audit_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

  -- A removed task is no longer actionable. Preserve its audit events and
  -- generate one distinct deletion notice to the original assignee.
  IF event_kind = 'deleted' THEN
    DELETE FROM public.stc_notifications
      WHERE task_id = new.id AND kind <> 'deleted';
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
  ELSIF event_kind = 'deleted' THEN
    INSERT INTO public.stc_notifications(recipient_id,task_id,kind,task_title,actor_name)
    VALUES (old.assignee_id,new.id,'deleted',old.title,actor_label);
  ELSIF event_kind IN ('assigned','approved','changes_requested','updated') THEN
    INSERT INTO public.stc_notifications(recipient_id,task_id,kind,task_title,actor_name)
    VALUES (new.assignee_id,new.id,event_kind,new.title,actor_label);
  END IF;
  RETURN new;
END;
$function$;

-- Reconcile stale notices left by deletions and already-reviewed submissions.
DELETE FROM public.stc_notifications AS n
USING public.stc_tasks AS t
WHERE n.task_id=t.id
  AND (
    (t.deleted_at IS NOT NULL AND n.kind<>'deleted')
    OR (t.status <> 'waiting_review' AND n.kind='waiting_review')
  );
