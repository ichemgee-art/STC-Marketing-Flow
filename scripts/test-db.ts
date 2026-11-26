// Real Postgres engine with Supabase auth/storage stand-ins. Never touches hosted data.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
async function main() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth; create schema storage;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth,storage to authenticated;
 grant execute on function auth.uid() to authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,created_at timestamptz default now(),updated_at timestamptz default now(),metadata jsonb,is_delete_marker boolean default false,archived_at timestamptz);
 create function storage.foldername(name text) returns text[] language sql immutable as $folder$ select (string_to_array(name,'/'))[1:cardinality(string_to_array(name,'/'))-1] $folder$;
 grant execute on function storage.foldername(text) to authenticated;
 create publication supabase_realtime;
 alter table storage.objects enable row level security; grant select,insert,delete on storage.objects to authenticated;`);
  let paths: string[];
  try {
    paths = readdirSync("supabase/migrations")
      .filter((x) => x.endsWith(".sql"))
      .sort()
      .map((x) => "supabase/migrations/" + x);
  } catch {
    paths = ["supabase/schema.sql"];
  }
  for (const file of paths) {
    const sql = readFileSync(file, "utf8");
    try { await db.exec(sql); } catch (error) { throw new Error("Migration failed: "+file,{cause:error}); }
  }
  const manager = "00000000-0000-0000-0000-000000000001",
    a = "00000000-0000-0000-0000-000000000002",
    b = "00000000-0000-0000-0000-000000000003";
  await db.exec(
    `insert into auth.users values('${manager}'),('${a}'),('${b}'); insert into public.stc_members values('${manager}','Manager','manager',true),('${a}','A','member',true),('${b}','B','member',true);`,
  );
  async function asUser(id: string) {
    await db.exec(
      `reset role; set role authenticated; select set_config('request.jwt.claim.sub','${id}',false);`,
    );
  }
  async function denied(sql: string) {
    await assert.rejects(db.exec(sql));
  }
  await asUser(manager);
  const task = (
    await db.query<{ id: string }>(
      `insert into public.stc_tasks(title,assignee_id,due_date) values('Test','${a}','2026-11-01') returning id`,
    )
  ).rows[0].id;
  await asUser(b);
  assert.equal(
    (await db.query(`select * from public.stc_tasks`)).rows.length,
    0,
  );
  await denied(
    `insert into public.stc_comments(task_id,body) values('${task}','snoop')`,
  );
  await denied(
    `insert into storage.objects(bucket_id,name) values('stc-task-files','${task}/${b}/snoop')`,
  );
  await asUser(a);
  await denied(`select stc_private.scheduled_digest()`);
  assert.equal(
    (await db.query(`select * from public.stc_tasks`)).rows.length,
    1,
  );
  await denied(`update public.stc_members set role='manager' where id='${a}'`);
  await denied(
    `update public.stc_tasks set assignee_id='${b}' where id='${task}'`,
  );
  await denied(
    `update public.stc_tasks set due_date='2026-12-01' where id='${task}'`,
  );
  await denied(
    `update public.stc_tasks set status='approved' where id='${task}'`,
  );
  await db.exec(
    `update public.stc_tasks set status='tomorrow' where id='${task}'`,
  );
  assert.equal(
    (
      await db.query<{ due_date: string }>(
        `select due_date::text from public.stc_tasks`,
      )
    ).rows[0].due_date,
    "2026-11-01",
  );
  // Notes became optional in the Nov 24 workflow migration.
  await db.exec(`update public.stc_tasks set status='waiting_review' where id='${task}'`);
  await denied(
    `update public.stc_tasks set submission_note='changed' where id='${task}'`,
  );
  await asUser(manager);
  await db.exec(`update public.stc_tasks set status='changes_requested' where id='${task}'`);
  await asUser(a);
  await db.exec(
    `update public.stc_tasks set status='waiting_review',submission_note='Fixed' where id='${task}'`,
  );
  await asUser(manager);
  await db.exec(
    `update public.stc_tasks set status='approved',review_note='Approved' where id='${task}'`,
  );
  await asUser(a);
  await denied(`update public.stc_tasks set status='todo' where id='${task}'`);
  await denied(
    `insert into public.stc_events(task_id,actor_id,action,details) values('${task}','${a}','fake','{}')`,
  );
  await denied(`delete from public.stc_tasks where id='${task}'`);
  assert.ok(
    (await db.query(`select * from public.stc_notifications`)).rows.length > 0,
  );
  await denied(`update public.stc_notifications set kind='fake'`);
  await db.exec(`update public.stc_notifications set read_at=now()`);
  await asUser(b);
  assert.equal(
    (await db.query(`select * from public.stc_notifications`)).rows.length,
    0,
  );
  await denied(`select public.stc_import_archive('{}')`);
  await asUser(manager);
  const sha = "a".repeat(64);
  await db.exec(
    `insert into storage.objects(bucket_id,name) values('stc-history','${sha}/original.xlsx')`,
  );
  const payload = {
    format_version: 1,
    source_sha256: sha,
    source_name: "fixture.xlsx",
    sheets: [{ name: "Tasks" }],
    rows: [
      {
        sheet: "Tasks",
        row_number: 4,
        cells: { C4: { value: "Original" } },
        mapped: { title: "Original", source_status: "Done" },
        fingerprint: "test",
      },
    ],
  };
  const batch = (
    await db.query<{ id: string }>(
      "select public.stc_import_archive($1::jsonb) id",
      [JSON.stringify(payload)],
    )
  ).rows[0].id;
  const replay = (
    await db.query<{ id: string }>(
      "select public.stc_import_archive($1::jsonb) id",
      [JSON.stringify(payload)],
    )
  ).rows[0].id;
  assert.equal(batch, replay);
  assert.equal(
    (await db.query("select * from public.stc_archive_rows")).rows.length,
    1,
  );
  await denied(`delete from public.stc_archive_rows`);
  const source = (
    await db.query<{ id: string }>("select id from public.stc_archive_rows")
  ).rows[0].id;
  const promoted = (
    await db.query<{ id: string }>(
      "select public.stc_promote_archive($1,$2,$3,$4) id",
      [source, a, "Continued", "Verified duplicate decision"],
    )
  ).rows[0].id;
  assert.equal(
    (
      await db.query<{ status: string }>(
        "select status from public.stc_tasks where id=$1",
        [promoted],
      )
    ).rows[0].status,
    "todo",
  );
  assert.equal(
    (await db.query("select * from public.stc_legacy_links")).rows.length,
    1,
  );
  // Atomic rollback on duplicate source coordinates.
  const bad = {
    ...payload,
    source_sha256: "b".repeat(64),
    rows: [payload.rows[0], payload.rows[0]],
  };
  await db.exec(
    `insert into storage.objects(bucket_id,name) values('stc-history','${bad.source_sha256}/original.xlsx')`,
  );
  await assert.rejects(
    db.query("select public.stc_import_archive($1::jsonb)", [
      JSON.stringify(bad),
    ]),
  );
  assert.equal(
    (await db.query("select * from public.stc_import_batches")).rows.length,
    1,
  );
  await asUser(a);
  assert.equal(
    (await db.query("select * from public.stc_archive_rows")).rows.length,
    0,
  );
  await db.exec("reset role");
  await asUser(manager);
  await db.exec(
    `update public.stc_tasks set due_date='2026-11-01' where id='${promoted}'`,
  );
  await db.exec("reset role");
  await db.exec(
    "select stc_private.scheduled_digest('2026-11-23T19:00:00+02:00')",
  );
  const notifications = (
    await db.query("select * from public.stc_notifications")
  ).rows.length;
  await db.exec(
    "select stc_private.scheduled_digest('2026-11-23T20:00:00+02:00')",
  );
  assert.equal(
    (await db.query("select * from public.stc_notifications")).rows.length,
    notifications,
  );
  assert.equal(
    (await db.query("select * from public.stc_daily_reports")).rows.length,
    1,
  );
  // New migrations must work on a fresh database with synthetic accounts.
  await db.exec("reset role");
  const profile=(await db.query<{id:string}>(`insert into public.stc_seo_profiles(slug,display_name,brand,site_url,member_id) values('qa-seo','QA SEO','STC','https://example.com','${a}') returning id`)).rows[0].id;
  await asUser(manager);
  const target=(await db.query<{id:string}>(`insert into public.stc_seo_targets(profile_id,month_key,title,target_count) values('${profile}','2026-11','QA target',1) returning id`)).rows[0].id;
  await db.exec(`update public.stc_seo_targets set target_count=null where id='${target}'`);
  await asUser(a);
  const progress=(await db.query<{id:string}>(`insert into public.stc_seo_progress(target_id,work_date,done_count,note) values('${target}','2026-11-23',1,'Test') returning id`)).rows[0].id;
  await db.exec(`update public.stc_seo_progress set done_count=0 where id='${progress}'`);
  assert.equal((await db.query<{done_count:number}>(`select done_count from public.stc_seo_progress where id='${progress}'`)).rows[0].done_count,0);
  await asUser(b);
  assert.equal((await db.query(`update public.stc_seo_progress set done_count=1 where id='${progress}' returning id`)).rows.length,0);
  await asUser(manager);
  assert.equal((await db.query(`select id from public.stc_seo_progress where id='${progress}'`)).rows.length,1);
  const snapshot=(await db.query<{id:string}>(`insert into public.stc_weekly_report_snapshots(brand,period_start,period_end,payload) values('stc','2026-11-20','2026-11-26','{}') returning id`)).rows[0].id;
  await asUser(a);
  assert.equal((await db.query(`delete from public.stc_weekly_report_snapshots where id='${snapshot}' returning id`)).rows.length,0);
  await asUser(manager);
  assert.equal((await db.query(`delete from public.stc_weekly_report_snapshots where id='${snapshot}' returning id`)).rows.length,1);
  await db.exec("reset role");
  await db.exec(`update public.stc_members set active=false where id='${a}'`);
  await asUser(a);
  assert.equal(
    (await db.query("select * from public.stc_tasks")).rows.length,
    0,
  );
  // Shared workspace: use synthetic identities, never production account IDs.
  await db.exec("reset role");
  const shared="00000000-0000-0000-0000-000000000004";
  const outsider="00000000-0000-0000-0000-000000000005";
  await db.exec(`insert into auth.users values('${shared}'),('${outsider}'); insert into public.stc_members(id,display_name,role,active,shared_team) values('${shared}','Team','member',true,true),('${outsider}','Outside','member',true,false); insert into stc_private.team_memberships values('${shared}','${b}');`);
  await asUser(manager);
  const copy=(await db.query<{id:string}>(`insert into public.stc_tasks(title,assignee_id,report_brand,report_category,requested_quantity) values('Caption','${b}','stc','caption',2) returning id`)).rows[0].id;
  const privateTask=(await db.query<{id:string}>(`insert into public.stc_tasks(title,assignee_id) values('Outside','${outsider}') returning id`)).rows[0].id;
  await asUser(shared);
  assert.equal((await db.query(`select id from public.stc_tasks where id='${privateTask}'`)).rows.length,0);
  assert.equal((await db.query(`select id from public.stc_members`)).rows.length,2);
  assert.equal((await db.query(`select id from public.stc_notifications where task_id='${copy}' and kind='assigned'`)).rows.length,1);
  await denied(`update public.stc_tasks set status='waiting_review' where id='${copy}'`);
  await db.exec(`update public.stc_tasks set text_deliverables='["One","Two"]' where id='${copy}'`);
  await db.exec(`update public.stc_tasks set status='waiting_review' where id='${copy}'`);
  assert.equal((await db.query<{actual_quantity:number}>(`select actual_quantity from public.stc_tasks where id='${copy}'`)).rows[0].actual_quantity,2);
  await denied(`update public.stc_tasks set status='approved' where id='${copy}'`);
  await asUser(manager);
  await db.exec(`update public.stc_tasks set status='approved' where id='${copy}'`);
  await asUser(shared);
  assert.equal((await db.query(`select id from public.stc_notifications where task_id='${copy}' and kind='approved'`)).rows.length,1);
  // Historical member identity remains assignable, but old access tokens are denied.
  await asUser(b);
  assert.equal((await db.query("select id from public.stc_members")).rows.length,0);
  assert.equal((await db.query("select id from public.stc_tasks")).rows.length,0);
  assert.equal((await db.query("select id from public.stc_notifications")).rows.length,0);
  await asUser(shared);
  assert.equal((await db.query(`select id from public.stc_tasks where id='${copy}'`)).rows.length,1);
  await asUser(manager);
  assert.equal((await db.query(`select id from public.stc_members where id='${b}' and active`)).rows.length,1);
  await db.close();
  console.log(
    "PASS: Postgres schema, RLS isolation, role escalation, workflow, deadline preservation, immutable audit, storage authorization, replay-safe atomic import, provenance, deactivated member.",
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
