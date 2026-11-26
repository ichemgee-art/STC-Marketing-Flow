alter table public.stc_members add column if not exists shared_team boolean not null default false;
create table stc_private.team_memberships(shared_id uuid not null references public.stc_members(id), assignee_id uuid not null references public.stc_members(id), primary key(shared_id,assignee_id), check(shared_id<>assignee_id));
alter table stc_private.team_memberships enable row level security;
revoke all on stc_private.team_memberships from public,anon,authenticated;
create function stc_private.can_access_team_member(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from stc_private.team_memberships l join public.stc_members s on s.id=l.shared_id join public.stc_members a on a.id=l.assignee_id where l.shared_id=(select auth.uid()) and l.assignee_id=target and s.active and s.shared_team and s.role='member' and a.active and not a.shared_team and a.role='member');
$$;
revoke all on function stc_private.can_access_team_member(uuid) from public,anon;
grant execute on function stc_private.can_access_team_member(uuid) to authenticated;
create policy stc_shared_members_read on public.stc_members for select to authenticated using (stc_private.can_access_team_member(id));
create policy stc_shared_task_read on public.stc_tasks for select to authenticated using (deleted_at is null and stc_private.can_access_team_member(assignee_id));
create policy stc_shared_task_update on public.stc_tasks for update to authenticated using (deleted_at is null and stc_private.can_access_team_member(assignee_id)) with check (deleted_at is null and stc_private.can_access_team_member(assignee_id));
create policy stc_shared_notice_read on public.stc_notifications for select to authenticated using (stc_private.can_access_team_member(recipient_id));
create policy stc_shared_notice_update on public.stc_notifications for update to authenticated using (stc_private.can_access_team_member(recipient_id)) with check (stc_private.can_access_team_member(recipient_id));
alter table public.stc_tasks drop constraint stc_tasks_report_category_check;
alter table public.stc_tasks add constraint stc_tasks_report_category_check check(report_category in ('design','ai_image','ai_video','video','caption','content','datasheet','photo','other'));
alter table public.stc_tasks add column text_deliverables jsonb not null default '[]'::jsonb;
grant update(text_deliverables) on public.stc_tasks to authenticated;
create function stc_private.guard_text_deliverables() returns trigger language plpgsql set search_path='' as $$
declare item jsonb; filled integer:=0;
begin
 if exists(select 1 from public.stc_members where id=new.assignee_id and shared_team) then raise exception 'Assign work to an individual team member';end if;
 if jsonb_typeof(new.text_deliverables)<>'array' then raise exception 'Text deliverables must be an array';end if;
 if jsonb_array_length(new.text_deliverables)>200 then raise exception 'Maximum 200 text deliverables';end if;
 for item in select value from jsonb_array_elements(new.text_deliverables) loop
  if jsonb_typeof(item)<>'string' or length(item#>>'{}')>20000 then raise exception 'Invalid text deliverable';end if;
  if length(btrim(item#>>'{}'))>0 then filled:=filled+1;end if;
 end loop;
 if tg_op='UPDATE' then
  if new.text_deliverables is distinct from old.text_deliverables and (new.report_category is null or new.report_category not in ('caption','content')) then raise exception 'Text fields require Caption or Content';end if;
  if new.status='waiting_review' and old.status is distinct from new.status and new.report_category in ('caption','content') then
   if filled=0 or filled<>jsonb_array_length(new.text_deliverables) then raise exception 'Complete all text boxes before submitting';end if;
   new.actual_quantity=filled;
  end if;
 end if;
 return new;
end;$$;
revoke all on function stc_private.guard_text_deliverables() from public,anon,authenticated;
create trigger a_stc_text_deliverable_guard before insert or update on public.stc_tasks for each row execute function stc_private.guard_text_deliverables();