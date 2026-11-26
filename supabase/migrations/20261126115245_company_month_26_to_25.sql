drop policy if exists stc_seo_progress_insert on public.stc_seo_progress;
create policy stc_seo_progress_insert on public.stc_seo_progress for insert to authenticated with check (
 created_by=(select auth.uid()) and exists (
 select 1 from public.stc_seo_targets t join public.stc_seo_profiles p on p.id=t.profile_id
 where t.id=target_id and p.member_id=(select auth.uid())
 and work_date >= ((t.month_key||'-01')::date - interval '1 month' + interval '25 days')::date
 and work_date <= (t.month_key||'-25')::date
 ));
create or replace function stc_private.guard_seo_progress_edit() returns trigger language plpgsql security definer set search_path='' as $$
declare cap integer; cadence_value text; total bigint; target_month text; first_day date; last_day date;
begin
 if tg_op='UPDATE' then
  if new.id is distinct from old.id or new.target_id is distinct from old.target_id or new.work_date is distinct from old.work_date or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then raise exception 'Achievement identity cannot be changed'; end if;
  new.version=old.version+1;
 end if;
 select coalesce(t.target_count,1),t.cadence,t.month_key into cap,cadence_value,target_month from public.stc_seo_targets t where t.id=new.target_id for update;
 if not found then raise exception 'Target not found'; end if;
 first_day:=((target_month||'-01')::date - interval '1 month' + interval '25 days')::date;
 last_day:=(target_month||'-25')::date;
 if tg_op='INSERT' and (new.work_date<first_day or new.work_date>last_day) then raise exception 'Work date outside company month' using errcode='23514';end if;
 if tg_op='UPDATE' and new.done_count<=old.done_count then return new; end if;
 if new.done_count=0 then return new; end if;
 -- Keep historical out-of-cycle records editable without consuming a new cycle quota.
 select coalesce(sum(p.done_count),0) into total from public.stc_seo_progress p where p.target_id=new.target_id and p.id<>new.id and
 (case when cadence_value='daily' or new.work_date<first_day or new.work_date>last_day then p.work_date=new.work_date else p.work_date between first_day and last_day end);
 if total+new.done_count>cap then raise exception 'Achievement exceeds target limit' using errcode='23514'; end if;
 return new;
end; $$;