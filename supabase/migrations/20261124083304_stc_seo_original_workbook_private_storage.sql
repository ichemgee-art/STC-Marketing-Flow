insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('stc-seo-workbooks','stc-seo-workbooks',false,5242880,array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/octet-stream'])
on conflict(id) do nothing;
create policy stc_seo_originals_manager_read on storage.objects for select to authenticated
using(bucket_id='stc-seo-workbooks' and (select stc_private.is_manager()));
create policy stc_seo_originals_manager_insert on storage.objects for insert to authenticated
with check(bucket_id='stc-seo-workbooks' and (select stc_private.is_manager()));
create policy stc_seo_originals_manager_delete on storage.objects for delete to authenticated
using(bucket_id='stc-seo-workbooks' and (select stc_private.is_manager()));
