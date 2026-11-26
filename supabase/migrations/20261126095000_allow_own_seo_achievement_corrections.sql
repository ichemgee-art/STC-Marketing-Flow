alter table public.stc_seo_progress add column if not exists version integer not null default 1;
grant update (done_count,note) on public.stc_seo_progress to authenticated;
create policy stc_seo_progress_update_own on public.stc_seo_progress for update to authenticated
using (created_by=(select auth.uid()) and exists(select 1 from public.stc_seo_targets t join public.stc_seo_profiles p on p.id=t.profile_id where t.id=stc_seo_progress.target_id and p.member_id=(select auth.uid())))
with check (created_by=(select auth.uid()) and exists(select 1 from public.stc_seo_targets t join public.stc_seo_profiles p on p.id=t.profile_id where t.id=stc_seo_progress.target_id and p.member_id=(select auth.uid())));
create or replace function stc_private.guard_seo_progress_edit() returns trigger language plpgsql security definer set search_path='' as $$
declare cap integer; cadence_value text; total bigint;
begin
 if tg_op='UPDATE' then
  if new.id is distinct from old.id or new.target_id is distinct from old.target_id or new.work_date is distinct from old.work_date or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then raise exception 'Achievement identity cannot be changed'; end if;
  new.version=old.version+1;
 end if;
 if tg_op='UPDATE' then
  if new.done_count<=old.done_count then return new; end if;
 end if;
 select t.target_count,t.cadence into cap,cadence_value from public.stc_seo_targets t where t.id=new.target_id for update;
 if not found then raise exception 'Target not found'; end if;
 select coalesce(sum(p.done_count),0) into total from public.stc_seo_progress p where p.target_id=new.target_id and p.id<>new.id and (cadence_value='monthly' or p.work_date=new.work_date);
 if total+new.done_count>cap then raise exception 'Achievement exceeds target limit' using errcode='23514'; end if;
 return new;
end; $$;
revoke all on function stc_private.guard_seo_progress_edit() from public,anon,authenticated;
create trigger stc_seo_progress_guard before insert or update on public.stc_seo_progress for each row execute function stc_private.guard_seo_progress_edit();
