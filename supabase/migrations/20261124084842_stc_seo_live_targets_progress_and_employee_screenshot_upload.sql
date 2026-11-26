create table if not exists public.stc_seo_targets (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.stc_seo_profiles(id) on delete cascade,
  month_key text not null check (month_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  title text not null check (length(btrim(title)) between 2 and 180),
  details text not null default '',
  target_count integer not null check (target_count between 1 and 1000000),
  target_unit text not null default 'مهمة',
  cadence text not null default 'monthly' check (cadence in ('monthly','daily')),
  created_by uuid references public.stc_members(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists stc_seo_targets_profile_month on public.stc_seo_targets(profile_id,month_key);
alter table public.stc_seo_targets enable row level security;
grant select,insert,update,delete on public.stc_seo_targets to authenticated;
create policy stc_seo_target_view on public.stc_seo_targets for select to authenticated
using (exists(select 1 from public.stc_seo_profiles p where p.id=profile_id and
 ((select stc_private.is_manager()) or p.member_id=(select auth.uid()))));
create policy stc_seo_target_manager_insert on public.stc_seo_targets for insert to authenticated
with check ((select stc_private.is_manager()) and created_by=(select auth.uid()));
create policy stc_seo_target_manager_update on public.stc_seo_targets for update to authenticated
using ((select stc_private.is_manager())) with check ((select stc_private.is_manager()));
create policy stc_seo_target_manager_delete on public.stc_seo_targets for delete to authenticated
using ((select stc_private.is_manager()));

create table if not exists public.stc_seo_progress (
 id uuid primary key default gen_random_uuid(),
 target_id uuid not null references public.stc_seo_targets(id) on delete cascade,
 work_date date not null,
 done_count integer not null default 1 check (done_count between 1 and 1000000),
 note text not null default '' check (length(note)<=3000),
 created_by uuid not null references public.stc_members(id) default auth.uid(),
 created_at timestamptz not null default now()
);
create index if not exists stc_seo_progress_target_day on public.stc_seo_progress(target_id,work_date desc);
alter table public.stc_seo_progress enable row level security;
grant select,insert,delete on public.stc_seo_progress to authenticated;
create policy stc_seo_progress_view on public.stc_seo_progress for select to authenticated
using (exists (
 select 1 from public.stc_seo_targets t join public.stc_seo_profiles p on p.id=t.profile_id
 where t.id=target_id and ((select stc_private.is_manager()) or p.member_id=(select auth.uid()))
));
create policy stc_seo_progress_insert on public.stc_seo_progress for insert to authenticated
with check (created_by=(select auth.uid()) and exists (
 select 1 from public.stc_seo_targets t join public.stc_seo_profiles p on p.id=t.profile_id
 where t.id=target_id and ((select stc_private.is_manager()) or p.member_id=(select auth.uid()))
 and to_char(work_date,'YYYY-MM')=t.month_key
));
create policy stc_seo_progress_delete on public.stc_seo_progress for delete to authenticated
using ((select stc_private.is_manager()) or created_by=(select auth.uid()));

alter table public.stc_seo_assets
 add column if not exists target_id uuid references public.stc_seo_targets(id) on delete set null,
 add column if not exists uploaded_by uuid references public.stc_members(id),
 add column if not exists origin text not null default 'workbook' check (origin in ('workbook','manual'));

create policy stc_seo_assets_owner_insert on public.stc_seo_assets for insert to authenticated
with check (
  origin='manual' and uploaded_by=(select auth.uid()) and exists(
    select 1 from public.stc_seo_periods s join public.stc_seo_profiles p on p.id=s.profile_id
    where s.id=period_id and ((select stc_private.is_manager()) or p.member_id=(select auth.uid()))
      and (target_id is null or exists(select 1 from public.stc_seo_targets t
            where t.id=target_id and t.profile_id=p.id and t.month_key=s.month_key))
  )
);

create policy stc_seo_evidence_owner_upload on storage.objects for insert to authenticated
with check(
 bucket_id='stc-seo-evidence'
 and exists (select 1 from public.stc_seo_profiles p where p.slug=(storage.foldername(name))[1]
 and p.member_id=(select auth.uid()))
);
