create function stc_private.is_retired_team_login() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from stc_private.team_memberships l where l.assignee_id=(select auth.uid()));
$$;
revoke all on function stc_private.is_retired_team_login() from public,anon;
grant execute on function stc_private.is_retired_team_login() to authenticated;
create or replace function stc_private.is_member() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.stc_members where id=auth.uid() and active) and not stc_private.is_retired_team_login();
$$;
create or replace function stc_private.can_view_storage() returns boolean language sql stable security definer set search_path='' as $$
 select stc_private.is_member() and exists(select 1 from public.stc_members m where m.id=auth.uid() and m.active and (m.role='manager' or exists(select 1 from stc_private.storage_viewers v where v.member_id=m.id)));
$$;
-- Block previously issued access tokens without making historical assignees inactive.
do $pol$ declare t record; begin
 for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and c.relrowsecurity and left(c.relname,4)='stc_' loop
 execute format('create policy stc_retired_login_block on public.%I as restrictive for all to authenticated using (not (select stc_private.is_retired_team_login())) with check (not (select stc_private.is_retired_team_login()))',t.relname);
 end loop;
end $pol$;
create policy stc_retired_login_storage_block on storage.objects as restrictive for all to authenticated using (left(bucket_id,4)<>'stc-' or not (select stc_private.is_retired_team_login())) with check (left(bucket_id,4)<>'stc-' or not (select stc_private.is_retired_team_login()));