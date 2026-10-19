import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const db=new PGlite();
const admin='11111111-1111-4111-8111-111111111111',learner='22222222-2222-4222-8222-222222222222',cycle='33333333-3333-4333-8333-333333333333',invitation='44444444-4444-4444-8444-444444444444';
const migration=await readFile(new URL('../../supabase/migrations/20261019121104_consolidate_360_backend.sql',import.meta.url),'utf8');
const optimization=await readFile(new URL('../../supabase/migrations/20261019122331_optimize_360_consolidation.sql',import.meta.url),'utf8');
const rows=async sql=>(await db.query(sql)).rows;
async function as(role,id,fn){await db.exec(`set role ${role};`);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);try{return await fn();}finally{await db.exec('reset role;');await db.exec("select set_config('request.jwt.claim.sub','',false);");}}
test('consolidation restores the application schema with RLS and protected wrappers',async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);grant usage on schema auth to anon,authenticated,service_role;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create table public.calendar_events(id uuid);create schema ml_authoring;create table ml_authoring.courses(id uuid);create schema storage;create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;alter table storage.objects enable row level security;create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;`);
 await db.exec(migration);
 await db.exec(optimization);
 await db.query('insert into auth.users values($1),($2)',[admin,learner]);await db.query('insert into public.ml360_admins(user_id) values($1)',[admin]);
 await db.query("insert into public.ml360_cycles(id,participant_name,participant_email,created_by) values($1,'Fictional migration check','migration-check@example.invalid',$2)",[cycle,admin]);
 await db.query("insert into public.ml360_invitations(id,cycle_id,role,token_hash,expires_at) values($1,$2,'Self','sample-hash','2099-01-01')",[invitation,cycle]);
 const tables=await rows("select relname,relrowsecurity from pg_class where relname in ('ml360_admins','ml360_cycles','ml360_invitations','ml360_responses','ml_smart_goals')");assert.equal(tables.length,5);assert(tables.every(t=>t.relrowsecurity));
 const wrappers=await rows("select proname,prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname like 'ml360_%'");assert(wrappers.every(f=>!f.prosecdef));
});
test('anonymous and ordinary signed-in users cannot read assessment records or aggregate counts',async()=>{
 await as('anon',null,async()=>{await assert.rejects(rows('select * from public.ml360_cycles'),/permission denied/);await assert.rejects(rows(`select public.ml360_admin_report('${cycle}')`),/permission denied/);});
 await as('authenticated',learner,async()=>{assert.equal((await rows('select * from public.ml360_cycles')).length,0);assert.equal((await rows('select * from public.ml360_admin_progress')).length,0);await assert.rejects(rows(`select public.ml360_admin_report('${cycle}')`),/not authorized/);await assert.rejects(rows('select * from public.ml360_responses'),/permission denied/);});
});
test('administrator access and the progress view preserve their existing contract',async()=>{
 await as('authenticated',admin,async()=>{assert.equal((await rows('select * from public.ml360_cycles')).length,1);const progress=(await rows('select * from public.ml360_admin_progress'))[0];assert.equal(progress.invitations,1);assert.equal(progress.completed,0);const result=(await db.query('select public.ml360_admin_report($1) as value',[cycle])).rows[0].value;assert.equal(result.counts.self_n,0);await assert.rejects(rows('select * from public.ml360_responses'),/permission denied/);});
});
test('only the service may redeem a valid invitation, and duplicate submissions remain rejected',async()=>{
 await as('authenticated',admin,()=>assert.rejects(db.query('select public.ml360_redeem_response($1,$2,$3)',['sample-hash',JSON.stringify(Array(48).fill(4)),'{}']),/permission denied/));
 await db.query("update public.ml360_cycles set status='open' where id=$1",[cycle]);
 await as('service_role',null,async()=>{const call=async ratings=>(await db.query('select public.ml360_redeem_response($1,$2,$3) as value',['sample-hash',JSON.stringify(ratings),'{}'])).rows[0].value;assert.equal(await call([4]),'invalid_ratings');assert.equal(await call(Array(48).fill(4)),'ok');assert.equal(await call(Array(48).fill(4)),'used');});
 assert.equal((await rows('select * from public.ml360_responses')).length,1);
});
test('SMART goals remain scoped to their owner',async()=>{
 await as('authenticated',learner,async()=>{await db.query('insert into public.ml_smart_goals(user_id,goals) values($1,$2)',[learner,'[]']);assert.equal((await rows('select * from public.ml_smart_goals')).length,1);await assert.rejects(db.query('insert into public.ml_smart_goals(user_id,goals) values($1,$2)',[admin,'[]']),/row-level security/);});
 await as('authenticated',admin,async()=>assert.equal((await rows('select * from public.ml_smart_goals')).length,0));
});
test('media writes require the existing administrator and user-folder boundary',async()=>{
 await as('authenticated',admin,async()=>{await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['leadership-challenge',admin+'/sample.png']);await assert.rejects(db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['leadership-challenge',learner+'/sample.png']),/row-level security/);});
 await as('authenticated',learner,async()=>{assert.equal((await rows('select * from storage.objects')).length,0);await assert.rejects(db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['leadership-challenge',learner+'/sample.png']),/row-level security/);});
});
test('the migration refuses to overwrite existing 360 tables',async()=>{await assert.rejects(db.exec(migration),/360 tables already exist/);await db.close();});
