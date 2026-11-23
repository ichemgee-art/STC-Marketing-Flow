-- Additive, namespaced schema. Run once only after inspecting target tables and backups.
create schema if not exists stc_private;
revoke all on schema stc_private from public;
grant usage on schema stc_private to authenticated;

create table public.stc_members (
 id uuid primary key references auth.users(id), display_name text not null check(length(display_name) between 1 and 120),
 role text not null default 'member' check(role in ('manager','member')), active boolean not null default true
);
alter table public.stc_members enable row level security;
-- Private lookup is necessary to avoid recursive member RLS. Membership is never user-editable.
create function stc_private.is_manager() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.stc_members where id=auth.uid() and role='manager' and active);
$$;
create function stc_private.is_member() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.stc_members where id=auth.uid() and active);
$$;
revoke all on function stc_private.is_manager(), stc_private.is_member() from public;
grant execute on function stc_private.is_manager(), stc_private.is_member() to authenticated;
create policy stc_member_read on public.stc_members for select to authenticated using(id=auth.uid() or stc_private.is_manager());

create table public.stc_tasks (
 id uuid primary key default gen_random_uuid(), title text not null check(length(trim(title)) between 1 and 300), description text not null default '',
 assignee_id uuid not null references public.stc_members(id), due_date date, planned_for date,
 priority text not null default 'normal' check(priority in ('low','normal','high')),
 status text not null default 'todo' check(status in ('todo','in_progress','tomorrow','waiting_review','changes_requested','approved')),
 submission_note text not null default '', review_note text not null default '',
 created_by uuid not null default auth.uid() references public.stc_members(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version integer not null default 1
);
create index stc_tasks_assignee on public.stc_tasks(assignee_id);
create index stc_tasks_status_due on public.stc_tasks(status,due_date);
alter table public.stc_tasks enable row level security;
create policy stc_task_read on public.stc_tasks for select to authenticated using(stc_private.is_member() and (assignee_id=auth.uid() or stc_private.is_manager()));
create policy stc_task_create on public.stc_tasks for insert to authenticated with check(stc_private.is_manager() and created_by=auth.uid() and status='todo');
create policy stc_task_update on public.stc_tasks for update to authenticated using(stc_private.is_member() and (assignee_id=auth.uid() or stc_private.is_manager())) with check(stc_private.is_member() and (assignee_id=auth.uid() or stc_private.is_manager()));

create function stc_private.guard_task() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.stc_members where id=new.assignee_id and active) then raise exception 'Inactive or invalid assignee'; end if;
 if tg_op='INSERT' then
   if new.status <> 'todo' then raise exception 'New tasks must start To Do'; end if;
   new.created_by=auth.uid(); new.created_at=now(); new.updated_at=now(); new.version=1;
   return new;
 end if;
 if new.id<>old.id or new.created_by<>old.created_by or new.created_at<>old.created_at then raise exception 'Immutable task fields'; end if;
 if not stc_private.is_manager() and (new.title<>old.title or new.description<>old.description or new.assignee_id<>old.assignee_id or new.due_date is distinct from old.due_date or new.priority<>old.priority or new.review_note<>old.review_note) then raise exception 'Only a manager can edit assignment and review fields'; end if;
 if old.status='approved' then raise exception 'Approved tasks are immutable'; end if;
 if old.status='waiting_review' and (not stc_private.is_manager() or new.status not in ('approved','changes_requested')) then raise exception 'Submission is locked during review'; end if;
 if new.status is distinct from old.status then
   if new.status in ('approved','changes_requested') then
     if not stc_private.is_manager() or old.status<>'waiting_review' then raise exception 'Manager review required'; end if;
     if new.status='changes_requested' and length(trim(new.review_note))=0 then raise exception 'Explain requested changes'; end if;
   elsif old.status='waiting_review' then raise exception 'Submission awaits manager review';
   end if;
   if new.status='waiting_review' and length(trim(new.submission_note))=0 then raise exception 'Submission note required'; end if;
   if new.status='tomorrow' then new.planned_for=((now() at time zone 'Africa/Cairo')::date+1); end if;
 end if;
 new.version=old.version+1; new.updated_at=clock_timestamp(); return new;
end; $$;
revoke all on function stc_private.guard_task() from public;
create trigger stc_task_guard before insert or update on public.stc_tasks for each row execute function stc_private.guard_task();

create table public.stc_comments(id uuid primary key default gen_random_uuid(), task_id uuid not null references public.stc_tasks(id), author_id uuid not null default auth.uid() references public.stc_members(id), body text not null check(length(trim(body)) between 1 and 10000), created_at timestamptz not null default now());
create table public.stc_attachments(id uuid primary key default gen_random_uuid(), task_id uuid not null references public.stc_tasks(id), uploader_id uuid not null default auth.uid() references public.stc_members(id), object_path text not null unique, filename text not null, size bigint not null check(size between 0 and 26214400), created_at timestamptz not null default now());
create table public.stc_events(id uuid primary key default gen_random_uuid(),task_id uuid not null references public.stc_tasks(id), actor_id uuid not null references public.stc_members(id),action text not null,details jsonb not null,created_at timestamptz not null default now());
create table public.stc_notifications(id uuid primary key default gen_random_uuid(), recipient_id uuid not null references public.stc_members(id), task_id uuid not null references public.stc_tasks(id),kind text not null,created_at timestamptz not null default now(),read_at timestamptz);
create index stc_notifications_recipient on public.stc_notifications(recipient_id,created_at);
alter table public.stc_notifications add column dedupe_key text unique;
create index stc_comments_task on public.stc_comments(task_id);
create index stc_attachments_task on public.stc_attachments(task_id);
create index stc_events_task on public.stc_events(task_id);
alter table public.stc_comments enable row level security;
alter table public.stc_attachments enable row level security;
alter table public.stc_events enable row level security;
alter table public.stc_notifications enable row level security;
create policy stc_comment_read on public.stc_comments for select to authenticated using(exists(select 1 from public.stc_tasks t where t.id=task_id));
create policy stc_comment_insert on public.stc_comments for insert to authenticated with check(author_id=auth.uid() and exists(select 1 from public.stc_tasks t where t.id=task_id and t.status<>'approved'));
create policy stc_attachment_read on public.stc_attachments for select to authenticated using(exists(select 1 from public.stc_tasks t where t.id=task_id));
create policy stc_attachment_insert on public.stc_attachments for insert to authenticated with check(uploader_id=auth.uid() and split_part(object_path,'/',1)=task_id::text and split_part(object_path,'/',2)=auth.uid()::text and exists(select 1 from public.stc_tasks t where t.id=task_id and t.status<>'approved') and exists(select 1 from storage.objects o where o.bucket_id='stc-task-files' and o.name=object_path));
create policy stc_event_read on public.stc_events for select to authenticated using(exists(select 1 from public.stc_tasks t where t.id=task_id));
create policy stc_notification_read on public.stc_notifications for select to authenticated using(recipient_id=auth.uid() and stc_private.is_member());
create policy stc_notification_update on public.stc_notifications for update to authenticated using(recipient_id=auth.uid() and stc_private.is_member()) with check(recipient_id=auth.uid() and stc_private.is_member());

-- Private trigger needs elevated INSERT on immutable audit and recipient-scoped notifications.
create function stc_private.audit_task() returns trigger language plpgsql security definer set search_path='' as $$
declare event_kind text;
begin
 if auth.uid() is null then raise exception 'Authenticated actor required'; end if;
 event_kind=case when tg_op='INSERT' then 'assigned' when new.status is distinct from old.status then new.status when new.assignee_id<>old.assignee_id then 'assigned' else 'updated' end;
 insert into public.stc_events(task_id,actor_id,action,details) values(new.id,auth.uid(),event_kind,jsonb_build_object('before',case when tg_op='UPDATE' then to_jsonb(old) else null end,'after',to_jsonb(new)));
 if event_kind='waiting_review' then
   insert into public.stc_notifications(recipient_id,task_id,kind) select id,new.id,event_kind from public.stc_members where role='manager' and active;
 elsif event_kind in ('assigned','approved','changes_requested') then
   insert into public.stc_notifications(recipient_id,task_id,kind) values(new.assignee_id,new.id,event_kind);
 end if;
 return new;
end; $$;
revoke all on function stc_private.audit_task() from public;
create trigger stc_task_audit after insert or update on public.stc_tasks for each row execute function stc_private.audit_task();

create table public.stc_import_batches(id uuid primary key default gen_random_uuid(),source_sha256 text not null unique check(source_sha256 ~ '^[a-f0-9]{64}$'),source_name text not null,manifest jsonb not null,original_path text not null,expected_rows integer not null check(expected_rows>=0),created_by uuid not null default auth.uid() references public.stc_members(id),created_at timestamptz not null default now());
create table public.stc_archive_rows(id uuid primary key default gen_random_uuid(),batch_id uuid not null references public.stc_import_batches(id),sheet text not null,row_number integer not null check(row_number>0),cells jsonb not null,mapped jsonb not null,fingerprint text not null,unique(batch_id,sheet,row_number));
create table public.stc_legacy_links(archive_row_id uuid primary key references public.stc_archive_rows(id),task_id uuid not null references public.stc_tasks(id),decision_note text not null check(length(trim(decision_note))>0),created_by uuid not null default auth.uid() references public.stc_members(id),created_at timestamptz not null default now());
create index stc_archive_batch on public.stc_archive_rows(batch_id);
create index stc_archive_fingerprint on public.stc_archive_rows(fingerprint);
alter table public.stc_import_batches enable row level security;
alter table public.stc_archive_rows enable row level security;
alter table public.stc_legacy_links enable row level security;
create policy stc_batches_read on public.stc_import_batches for select to authenticated using(stc_private.is_manager());
create policy stc_batches_insert on public.stc_import_batches for insert to authenticated with check(stc_private.is_manager() and created_by=auth.uid());
create policy stc_archive_read on public.stc_archive_rows for select to authenticated using(stc_private.is_manager());
create policy stc_archive_insert on public.stc_archive_rows for insert to authenticated with check(stc_private.is_manager());
create policy stc_links_read on public.stc_legacy_links for select to authenticated using(stc_private.is_manager());
create policy stc_links_insert on public.stc_legacy_links for insert to authenticated with check(stc_private.is_manager() and created_by=auth.uid());

-- Atomic import: replay of identical SHA is a no-op, conflicting SHA is a separate batch.
create function public.stc_import_archive(payload jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare batch uuid; n integer;
begin
 if not stc_private.is_manager() then raise exception 'Manager required'; end if;
 if (payload->>'format_version')::int<>1 or jsonb_typeof(payload->'rows')<>'array' then raise exception 'Invalid archive format'; end if;
 perform pg_advisory_xact_lock(hashtext(payload->>'source_sha256'));
 select id into batch from public.stc_import_batches where source_sha256=payload->>'source_sha256';
 if batch is not null then return batch; end if;
 if not exists(select 1 from storage.objects where bucket_id='stc-history' and name=(payload->>'source_sha256')||'/original.xlsx') then raise exception 'Original workbook must be archived first'; end if;
 n=jsonb_array_length(payload->'rows');
 insert into public.stc_import_batches(source_sha256,source_name,manifest,original_path,expected_rows) values(payload->>'source_sha256',payload->>'source_name',payload-'rows',(payload->>'source_sha256')||'/original.xlsx',n) returning id into batch;
 insert into public.stc_archive_rows(batch_id,sheet,row_number,cells,mapped,fingerprint) select batch,r->>'sheet',(r->>'row_number')::int,r->'cells',r->'mapped',r->>'fingerprint' from jsonb_array_elements(payload->'rows') r;
 if (select count(*) from public.stc_archive_rows where batch_id=batch)<>n then raise exception 'Reconciliation failed'; end if;
 return batch;
end; $$;
revoke all on function public.stc_import_archive(jsonb) from public;
grant execute on function public.stc_import_archive(jsonb) to authenticated;

create function public.stc_promote_archive(source_row uuid,assignee uuid,new_title text,decision text) returns uuid language plpgsql security invoker set search_path='' as $$
declare original public.stc_archive_rows; task uuid;
begin
 if not stc_private.is_manager() then raise exception 'Manager required'; end if;
 perform pg_advisory_xact_lock(hashtext(source_row::text));
 select * into strict original from public.stc_archive_rows where id=source_row;
 select task_id into task from public.stc_legacy_links where archive_row_id=source_row;
 if task is not null then return task; end if;
 if length(trim(decision))=0 then raise exception 'Mapping decision required'; end if;
 insert into public.stc_tasks(title,description,assignee_id) values(new_title,'Historical continuation: '||original.sheet||' row '||original.row_number||E'\n'||original.cells::text,assignee) returning id into task;
 insert into public.stc_legacy_links(archive_row_id,task_id,decision_note) values(source_row,task,decision);
 return task;
end; $$;
revoke all on function public.stc_promote_archive(uuid,uuid,text,text) from public;
grant execute on function public.stc_promote_archive(uuid,uuid,text,text) to authenticated;

revoke all on public.stc_members,public.stc_tasks,public.stc_comments,public.stc_attachments,public.stc_events,public.stc_notifications,public.stc_import_batches,public.stc_archive_rows,public.stc_legacy_links from anon,authenticated;
grant select on public.stc_members,public.stc_tasks,public.stc_comments,public.stc_attachments,public.stc_events,public.stc_notifications,public.stc_import_batches,public.stc_archive_rows,public.stc_legacy_links to authenticated;
grant insert on public.stc_tasks,public.stc_comments,public.stc_attachments,public.stc_import_batches,public.stc_archive_rows,public.stc_legacy_links to authenticated;
grant update(title,description,assignee_id,due_date,planned_for,priority,status,submission_note,review_note) on public.stc_tasks to authenticated;
grant update(read_at) on public.stc_notifications to authenticated;

insert into storage.buckets(id,name,public,file_size_limit) values('stc-task-files','stc-task-files',false,26214400),('stc-history','stc-history',false,52428800);
create policy stc_files_read on storage.objects for select to authenticated using(bucket_id='stc-task-files' and exists(select 1 from public.stc_tasks where id::text=split_part(name,'/',1)));
create policy stc_files_insert on storage.objects for insert to authenticated with check(bucket_id='stc-task-files' and split_part(name,'/',2)=auth.uid()::text and exists(select 1 from public.stc_tasks where id::text=split_part(name,'/',1) and status<>'approved'));
-- Cleanup only unregistered uploads owned by caller; registered attachments remain immutable.
create policy stc_files_cleanup on storage.objects for delete to authenticated using(bucket_id='stc-task-files' and split_part(name,'/',2)=auth.uid()::text and not exists(select 1 from public.stc_attachments where object_path=name));
create policy stc_history_read on storage.objects for select to authenticated using(bucket_id='stc-history' and stc_private.is_manager());
create policy stc_history_insert on storage.objects for insert to authenticated with check(bucket_id='stc-history' and stc_private.is_manager());

create table public.stc_daily_reports(report_date date primary key,summary jsonb not null,created_at timestamptz not null default now());
alter table public.stc_daily_reports enable row level security;
revoke all on public.stc_daily_reports from public,anon,authenticated;
grant select on public.stc_daily_reports to authenticated;
create policy stc_report_read on public.stc_daily_reports for select to authenticated using(stc_private.is_manager());
-- Runs as the trusted scheduler owner, not as a browser RPC. No secrets needed.
create function stc_private.scheduled_digest(as_of_time timestamptz default now()) returns void language plpgsql security invoker set search_path='' as $$
declare today date=(as_of_time at time zone 'Africa/Cairo')::date;
begin
 insert into public.stc_notifications(recipient_id,task_id,kind,dedupe_key)
 select t.assignee_id,t.id,case when t.due_date<today then 'overdue' else 'due_today' end,t.id::text||':'||today::text||':deadline'
 from public.stc_tasks t join public.stc_members m on m.id=t.assignee_id and m.active
 where t.due_date<=today and t.status<>'approved' on conflict(dedupe_key) do nothing;
 if extract(hour from as_of_time at time zone 'Africa/Cairo')>=18 then
  insert into public.stc_daily_reports(report_date,summary)
  select today,coalesce(jsonb_agg(r),'[]'::jsonb) from (
   select m.id,m.display_name,
    count(t.id) filter(where t.status='approved') approved,
    count(t.id) filter(where t.status='waiting_review') waiting_review,
    count(t.id) filter(where t.status='in_progress') in_progress,
    count(t.id) filter(where t.status='tomorrow') tomorrow,
    count(t.id) filter(where t.due_date<today and t.status<>'approved') overdue
   from public.stc_members m left join public.stc_tasks t on t.assignee_id=m.id
   where m.active group by m.id,m.display_name
  ) r on conflict(report_date) do nothing;
 end if;
end; $$;
revoke all on function stc_private.scheduled_digest(timestamptz) from public,anon,authenticated;

-- Add only our tables to existing publication; no replacement or DROP of existing schema/data.
alter publication supabase_realtime add table public.stc_tasks, public.stc_notifications,public.stc_comments,public.stc_attachments;
