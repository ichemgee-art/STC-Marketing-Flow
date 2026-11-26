-- STC Marketing Flow: reversible soft removal and workflow notifications.
alter table public.stc_tasks
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.stc_members(id);

alter table public.stc_notifications
  add column if not exists task_title text not null default '',
  add column if not exists actor_name text not null default '';

grant update (deleted_at, deleted_by) on public.stc_tasks to authenticated;
grant select on public.stc_archive_rows to authenticated;

drop policy if exists stc_task_read on public.stc_tasks;
create policy stc_task_read on public.stc_tasks for select to authenticated
using (
  stc_private.is_member() and
  (stc_private.is_manager() or (assignee_id = (select auth.uid()) and deleted_at is null))
);

create policy stc_archive_member_read on public.stc_archive_rows
for select to authenticated using (
  exists (
    select 1 from public.stc_members m
    where m.id = (select auth.uid()) and m.active and m.role = 'member'
      and (
        lower(btrim(coalesce(stc_archive_rows.mapped->>'owner_label',''))) = lower(btrim(m.display_name))
        or (m.display_name = 'Gerges' and lower(btrim(coalesce(stc_archive_rows.mapped->>'owner_label',''))) = 'girgis')
      )
  )
);

create or replace function stc_private.guard_task() returns trigger
language plpgsql set search_path = '' as $function$
begin
 if not exists (select 1 from public.stc_members where id = new.assignee_id and active) then
   raise exception 'Inactive or invalid assignee';
 end if;
 if tg_op = 'INSERT' then
   if new.status <> 'todo' then raise exception 'New tasks must start To Do'; end if;
   new.created_by = auth.uid();
   new.created_at = now(); new.updated_at = now(); new.version = 1;
   return new;
 end if;
 if new.id is distinct from old.id or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
   raise exception 'Immutable task fields';
 end if;
 if old.deleted_at is not null then raise exception 'Removed tasks cannot be changed'; end if;
 if new.deleted_at is distinct from old.deleted_at then
   if not stc_private.is_manager() or new.deleted_at is null or new.deleted_by is distinct from auth.uid() then
     raise exception 'Only a manager can remove tasks';
   end if;
   if (to_jsonb(new) - 'deleted_at' - 'deleted_by' - 'updated_at' - 'version') is distinct from
      (to_jsonb(old) - 'deleted_at' - 'deleted_by' - 'updated_at' - 'version') then
     raise exception 'Removal must be a separate operation';
   end if;
   new.version = old.version + 1; new.updated_at = clock_timestamp();
   return new;
 end if;
 if new.deleted_by is distinct from old.deleted_by or new.deleted_at is not null then
   raise exception 'Invalid removal metadata';
 end if;
 if not stc_private.is_manager() and (
   new.title <> old.title or new.description <> old.description or
   new.assignee_id <> old.assignee_id or new.due_date is distinct from old.due_date or
   new.priority <> old.priority or new.review_note <> old.review_note
 ) then
   raise exception 'Only a manager can edit assignment and review fields';
 end if;
 if old.status = 'approved' then raise exception 'Approved tasks are immutable'; end if;
 if old.status = 'waiting_review' and
    (not stc_private.is_manager() or new.status not in ('waiting_review','approved','changes_requested')) then
   raise exception 'Submission is locked during review';
 end if;
 if new.status is distinct from old.status then
   if new.status in ('approved','changes_requested') then
     if not stc_private.is_manager() or old.status <> 'waiting_review' then
       raise exception 'Manager review required';
     end if;
     if new.status = 'changes_requested' and length(trim(new.review_note)) = 0 then
       raise exception 'Explain requested changes';
     end if;
   elsif old.status = 'waiting_review' then
     raise exception 'Submission awaits manager review';
   end if;
   if new.status = 'waiting_review' and length(trim(new.submission_note)) = 0 then
     raise exception 'Submission note required';
   end if;
   if new.status = 'tomorrow' then
     new.planned_for = ((now() at time zone 'Africa/Cairo')::date + 1);
   end if;
 end if;
 new.version = old.version + 1;
 new.updated_at = clock_timestamp();
 return new;
end;
$function$;

create or replace function stc_private.audit_task() returns trigger
language plpgsql security definer set search_path = '' as $function$
declare event_kind text; actor_label text;
begin
 if auth.uid() is null then raise exception 'Authenticated actor required'; end if;
 select display_name into actor_label from public.stc_members where id = auth.uid();
 actor_label := coalesce(actor_label,'Team member');
 if tg_op = 'INSERT' then
   event_kind = 'assigned';
 elsif new.deleted_at is not null and old.deleted_at is null then
   event_kind = 'deleted';
 elsif new.assignee_id <> old.assignee_id then
   event_kind = 'reassigned';
 elsif new.status is distinct from old.status then
   event_kind = new.status;
 else
   event_kind = 'updated';
 end if;
 insert into public.stc_events(task_id,actor_id,action,details)
 values(new.id,auth.uid(),event_kind,jsonb_build_object(
    'before',case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    'after',to_jsonb(new)
 ));
 if event_kind = 'waiting_review' then
   insert into public.stc_notifications(recipient_id,task_id,kind,task_title,actor_name)
   select id,new.id,'waiting_review',new.title,actor_label
   from public.stc_members where role='manager' and active;
 elsif event_kind = 'reassigned' then
   insert into public.stc_notifications(recipient_id,task_id,kind,task_title,actor_name)
   values(old.assignee_id,new.id,'unassigned',old.title,actor_label),
         (new.assignee_id,new.id,'assigned',new.title,actor_label);
 elsif event_kind = 'deleted' then
   insert into public.stc_notifications(recipient_id,task_id,kind,task_title,actor_name)
   values(old.assignee_id,new.id,'deleted',old.title,actor_label);
 elsif event_kind in ('assigned','approved','changes_requested','updated') then
   insert into public.stc_notifications(recipient_id,task_id,kind,task_title,actor_name)
   values(new.assignee_id,new.id,event_kind,new.title,actor_label);
 end if;
 return new;
end;
$function$;

create index if not exists stc_tasks_visible_assignee on public.stc_tasks (assignee_id,updated_at desc) where deleted_at is null;
