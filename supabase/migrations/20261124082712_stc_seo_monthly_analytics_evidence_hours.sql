create table if not exists public.stc_seo_profiles (
 id uuid primary key default gen_random_uuid(),
 slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
 display_name text not null,
 brand text not null,
 site_url text not null,
 member_id uuid unique references public.stc_members(id) on delete set null,
 created_at timestamptz not null default now()
);
create table if not exists public.stc_seo_periods (
 id uuid primary key default gen_random_uuid(),
 profile_id uuid not null references public.stc_seo_profiles(id) on delete cascade,
 source_sheet text not null,
 source_filename text not null,
 source_sha256 text not null,
 label text not null,
 month_key text not null,
 period_kind text not null default 'month' check (period_kind in ('month','quarter')),
 cells jsonb not null default '{}'::jsonb,
 links jsonb not null default '{}'::jsonb,
 comments jsonb not null default '{}'::jsonb,
 image_count int not null default 0,
 imported_at timestamptz not null default now(),
 unique(profile_id,source_sheet)
);
create table if not exists public.stc_seo_assets (
 id uuid primary key default gen_random_uuid(),
 period_id uuid not null references public.stc_seo_periods(id) on delete cascade,
 position_index int not null,
 anchor_row int not null default 0,
 anchor_col int not null default 0,
 filename text not null,
 object_path text not null,
 mime_type text not null,
 size_bytes bigint not null,
 created_at timestamptz not null default now(),
 unique(period_id,position_index)
);
create table if not exists public.stc_seo_hours (
 id uuid primary key default gen_random_uuid(),
 profile_id uuid not null references public.stc_seo_profiles(id) on delete cascade,
 work_date date not null,
 start_minutes int not null check (start_minutes between 0 and 1439),
 end_minutes int not null check (end_minutes between 1 and 1440 and end_minutes>start_minutes),
 activities text not null check (length(btrim(activities)) between 2 and 3000),
 created_by uuid not null default auth.uid() references public.stc_members(id),
 created_at timestamptz not null default now()
);
create index if not exists stc_seo_periods_date on public.stc_seo_periods(profile_id,month_key desc);
create index if not exists stc_seo_assets_period on public.stc_seo_assets(period_id,position_index);
create index if not exists stc_seo_hours_person_date on public.stc_seo_hours(profile_id,work_date desc);
-- Deployment-specific SEO profiles are provisioned separately.

alter table public.stc_seo_profiles enable row level security;
alter table public.stc_seo_periods enable row level security;
alter table public.stc_seo_assets enable row level security;
alter table public.stc_seo_hours enable row level security;
grant select,insert,update,delete on public.stc_seo_profiles,public.stc_seo_periods,public.stc_seo_assets,public.stc_seo_hours to authenticated;

create policy stc_seo_profiles_read on public.stc_seo_profiles for select to authenticated
using ((select stc_private.is_manager()) or member_id=(select auth.uid()));
create policy stc_seo_profiles_manage on public.stc_seo_profiles for all to authenticated
using ((select stc_private.is_manager())) with check ((select stc_private.is_manager()));

create policy stc_seo_periods_read on public.stc_seo_periods for select to authenticated
using (exists(select 1 from public.stc_seo_profiles p where p.id=profile_id and
((select stc_private.is_manager()) or p.member_id=(select auth.uid()))));
create policy stc_seo_periods_manage on public.stc_seo_periods for all to authenticated
using ((select stc_private.is_manager())) with check ((select stc_private.is_manager()));

create policy stc_seo_assets_read on public.stc_seo_assets for select to authenticated
using (exists(select 1 from public.stc_seo_periods e join public.stc_seo_profiles p on p.id=e.profile_id where e.id=period_id and
((select stc_private.is_manager()) or p.member_id=(select auth.uid()))));
create policy stc_seo_assets_manage on public.stc_seo_assets for all to authenticated
using ((select stc_private.is_manager())) with check ((select stc_private.is_manager()));

create policy stc_seo_hours_read on public.stc_seo_hours for select to authenticated
using (exists(select 1 from public.stc_seo_profiles p where p.id=profile_id and
((select stc_private.is_manager()) or p.member_id=(select auth.uid()))));
create policy stc_seo_hours_create on public.stc_seo_hours for insert to authenticated
with check (exists(select 1 from public.stc_seo_profiles p where p.id=profile_id
and ((select stc_private.is_manager()) or p.member_id=(select auth.uid()))) and created_by=(select auth.uid()));
create policy stc_seo_hours_manage on public.stc_seo_hours for delete to authenticated
using ((select stc_private.is_manager()) or created_by=(select auth.uid()));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('stc-seo-evidence','stc-seo-evidence',false,10485760,array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;
create policy stc_seo_evidence_read on storage.objects for select to authenticated
using (
  bucket_id='stc-seo-evidence' and exists (
     select 1 from public.stc_seo_profiles p where p.slug=(storage.foldername(name))[1]
       and ((select stc_private.is_manager()) or p.member_id=(select auth.uid()))
  )
);
create policy stc_seo_evidence_insert on storage.objects for insert to authenticated
with check(bucket_id='stc-seo-evidence' and (select stc_private.is_manager()));
create policy stc_seo_evidence_update on storage.objects for update to authenticated
using (bucket_id='stc-seo-evidence' and (select stc_private.is_manager()))
with check(bucket_id='stc-seo-evidence' and (select stc_private.is_manager()));
create policy stc_seo_evidence_delete on storage.objects for delete to authenticated
using (bucket_id='stc-seo-evidence' and (select stc_private.is_manager()));
