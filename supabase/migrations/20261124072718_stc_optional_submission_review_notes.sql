CREATE OR REPLACE FUNCTION stc_private.guard_task()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $fn$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.stc_members WHERE id=new.assignee_id AND active) THEN
   RAISE EXCEPTION 'Inactive or invalid assignee';
 END IF;
 IF tg_op='INSERT' THEN
   IF new.status <> 'todo' THEN RAISE EXCEPTION 'New tasks must start To Do'; END IF;
   new.created_by=auth.uid(); new.created_at=now(); new.updated_at=now(); new.version=1;
   RETURN new;
 END IF;
 IF new.id IS DISTINCT FROM old.id OR new.created_by IS DISTINCT FROM old.created_by OR new.created_at IS DISTINCT FROM old.created_at THEN
   RAISE EXCEPTION 'Immutable task fields';
 END IF;
 IF old.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Removed tasks cannot be changed'; END IF;
 IF new.deleted_at IS DISTINCT FROM old.deleted_at THEN
   IF NOT stc_private.is_manager() OR new.deleted_at IS NULL OR new.deleted_by IS DISTINCT FROM auth.uid() THEN
     RAISE EXCEPTION 'Only a manager can remove tasks';
   END IF;
   IF (to_jsonb(new) - 'deleted_at' - 'deleted_by' - 'updated_at' - 'version') IS DISTINCT FROM
      (to_jsonb(old) - 'deleted_at' - 'deleted_by' - 'updated_at' - 'version') THEN
      RAISE EXCEPTION 'Removal must be a separate operation';
   END IF;
   new.version=old.version+1; new.updated_at=clock_timestamp(); RETURN new;
 END IF;
 IF new.deleted_by IS DISTINCT FROM old.deleted_by OR new.deleted_at IS NOT NULL THEN
   RAISE EXCEPTION 'Invalid removal metadata';
 END IF;
 IF NOT stc_private.is_manager() AND (
   new.title<>old.title OR new.description<>old.description OR
   new.assignee_id<>old.assignee_id OR new.due_date IS DISTINCT FROM old.due_date OR
   new.priority<>old.priority OR new.review_note<>old.review_note
 ) THEN RAISE EXCEPTION 'Only a manager can edit assignment and review fields'; END IF;
 IF old.status='approved' THEN RAISE EXCEPTION 'Approved tasks are immutable'; END IF;
 IF old.status='waiting_review' AND
    (NOT stc_private.is_manager() OR new.status NOT IN ('waiting_review','approved','changes_requested')) THEN
    RAISE EXCEPTION 'Submission is locked during review';
 END IF;
 IF new.status IS DISTINCT FROM old.status THEN
   IF new.status IN ('approved','changes_requested') THEN
     IF NOT stc_private.is_manager() OR old.status<>'waiting_review' THEN
       RAISE EXCEPTION 'Manager review required';
     END IF;
   ELSIF old.status='waiting_review' THEN RAISE EXCEPTION 'Submission awaits manager review';
   END IF;
   IF new.status='tomorrow' THEN new.planned_for=((now() AT TIME ZONE 'Africa/Cairo')::date+1); END IF;
 END IF;
 new.version=old.version+1; new.updated_at=clock_timestamp(); RETURN new;
END;
$fn$;
