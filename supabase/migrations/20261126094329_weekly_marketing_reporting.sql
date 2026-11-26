alter table public.stc_tasks add column if not exists report_brand text check(report_brand in ('stc','ichem')), add column if not exists report_category text check(report_category in ('design','ai_image','ai_video','video','caption','datasheet','photo','other')), add column if not exists requested_quantity integer check(requested_quantity between 1 and 1000000), add column if not exists actual_quantity integer check(actual_quantity between 0 and 1000000);
alter table public.stc_media_briefs add column if not exists report_brand text check(report_brand in ('stc','ichem'));
CREATE OR REPLACE FUNCTION stc_private.guard_task()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
 IF NOT stc_private.is_manager() AND (new.report_brand is distinct from old.report_brand or new.report_category is distinct from old.report_category or new.requested_quantity is distinct from old.requested_quantity or (new.actual_quantity is distinct from old.actual_quantity and new.status<>'waiting_review')) THEN RAISE EXCEPTION 'Invalid reporting metadata change'; END IF;
 IF old.status='approved' THEN
  IF NOT stc_private.is_manager() OR (to_jsonb(new)-'report_brand'-'report_category'-'requested_quantity'-'actual_quantity'-'version'-'updated_at') IS DISTINCT FROM (to_jsonb(old)-'report_brand'-'report_category'-'requested_quantity'-'actual_quantity'-'version'-'updated_at') THEN RAISE EXCEPTION 'Approved tasks are immutable'; END IF;
  new.version=old.version+1;new.updated_at=clock_timestamp();return new;
 END IF;
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
$function$
;
create table public.stc_deliverable_usage(
 id uuid primary key default gen_random_uuid(),task_id uuid not null references public.stc_tasks(id), quantity integer not null check(quantity between 1 and 1000000), state text not null check(state in ('published','used','scheduled','not_used','cancelled')), activity_date date not null, note text not null default '' check(length(note)<=3000), created_at timestamptz not null default now()
);
alter table public.stc_deliverable_usage enable row level security;
revoke all on public.stc_deliverable_usage from anon,authenticated;
grant select,insert,update,delete on public.stc_deliverable_usage to authenticated;
create policy manager_usage on public.stc_deliverable_usage for all to authenticated using ((select stc_private.is_manager())) with check ((select stc_private.is_manager()));
create function stc_private.guard_deliverable_usage() returns trigger language plpgsql security definer set search_path='' as $$
declare cap integer; current_total bigint;
begin
 select actual_quantity into cap from public.stc_tasks where id=new.task_id and status='approved' and deleted_at is null and report_brand is not null for update;
 if not found or cap is null then raise exception 'Classify and approve the task with an actual quantity first'; end if;
 if tg_op='UPDATE' and new.task_id<>old.task_id then raise exception 'Task identity cannot change';end if;
 select coalesce(sum(quantity),0) into current_total from public.stc_deliverable_usage where task_id=new.task_id and id<>new.id;
 if current_total+new.quantity>cap then raise exception 'Usage exceeds completed quantity'; end if;
 return new;
end;$$;
revoke all on function stc_private.guard_deliverable_usage() from public,anon,authenticated;
create trigger stc_usage_guard before insert or update on public.stc_deliverable_usage for each row execute function stc_private.guard_deliverable_usage();
create table public.stc_weekly_report_snapshots(id uuid primary key default gen_random_uuid(),brand text not null check(brand in ('stc','ichem')),period_start date not null,period_end date not null check(period_end>=period_start),payload jsonb not null check(jsonb_typeof(payload)='object'),created_by uuid not null default auth.uid() references public.stc_members(id),created_at timestamptz not null default now());
alter table public.stc_weekly_report_snapshots enable row level security;
revoke all on public.stc_weekly_report_snapshots from anon,authenticated;
grant select,insert on public.stc_weekly_report_snapshots to authenticated;
create policy manager_report_read on public.stc_weekly_report_snapshots for select to authenticated using ((select stc_private.is_manager()));
create policy manager_report_insert on public.stc_weekly_report_snapshots for insert to authenticated with check ((select stc_private.is_manager()) and created_by=(select auth.uid()));
