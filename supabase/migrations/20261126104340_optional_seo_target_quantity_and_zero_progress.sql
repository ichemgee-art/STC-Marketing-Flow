alter table public.stc_seo_targets alter column target_count drop not null;
alter table public.stc_seo_progress drop constraint stc_seo_progress_done_count_check;
alter table public.stc_seo_progress add constraint stc_seo_progress_done_count_check check(done_count between 0 and 1000000);
create or replace function stc_private.guard_seo_progress_edit() returns trigger language plpgsql security definer set search_path='' as $$
declare cap integer; cadence_value text; total bigint;
begin
 if tg_op='UPDATE' then
  if new.id is distinct from old.id or new.target_id is distinct from old.target_id or new.work_date is distinct from old.work_date or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then raise exception 'Achievement identity cannot be changed'; end if;
  new.version=old.version+1;
 end if;
 select coalesce(t.target_count,1),t.cadence into cap,cadence_value from public.stc_seo_targets t where t.id=new.target_id for update;
 if not found then raise exception 'Target not found'; end if;
 if tg_op='UPDATE' and new.done_count<=old.done_count then return new; end if;
 if new.done_count=0 then return new; end if;
 select coalesce(sum(p.done_count),0) into total from public.stc_seo_progress p where p.target_id=new.target_id and p.id<>new.id and (cadence_value='monthly' or p.work_date=new.work_date);
 if total+new.done_count>cap then raise exception 'Achievement exceeds target limit' using errcode='23514'; end if;
 return new;
end; $$;
