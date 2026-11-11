import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const owner = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const firstRevision = '00000000-0000-4000-8000-000000000003';
const nextRevision = '00000000-0000-4000-8000-000000000004';
const deck = { format: 'word-cloud-studio', version: 1, slides: [{ question: 'First' }, { question: 'Second' }] };

test('website projects belong to one account and can be updated only at the expected revision', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create schema auth;
      create role anon;
      create role authenticated;
      create table auth.users (id uuid primary key);
      create function auth.jwt() returns jsonb language sql stable as $$
        select current_setting('request.jwt.claims', true)::jsonb
      $$;
      create function auth.uid() returns uuid language sql stable as $$
        select (auth.jwt() ->> 'sub')::uuid
      $$;
      grant usage on schema auth to authenticated;
    `);
    await db.query('insert into auth.users values ($1), ($2)', [owner, other]);
    const migrations = new URL('../supabase/migrations/', import.meta.url);
    const migration = (await readdir(migrations)).find(name => name.endsWith('_classroom_response_saved_projects.sql'));
    await db.exec(await readFile(new URL(migration, migrations), 'utf8'));

    const signIn = async (id, isAnonymous = false) => {
      await db.exec('set role authenticated');
      await db.query("select set_config('request.jwt.claims', $1, false)", [
        JSON.stringify({ sub: id, is_anonymous: isAnonymous }),
      ]);
    };
    const insert = (id, name) => db.query(`
      insert into public.crs_saved_projects (user_id, id, name, project, revision)
      values ($1, 'activity-id', $2, $3, $4) returning slide_count
    `, [id, name, deck, firstRevision]);
    const list = () => db.query('select name, project from public.crs_saved_projects');

    await signIn(owner);
    assert.deepEqual((await insert(owner, 'Owner project')).rows, [{ slide_count: 2 }]);
    assert.deepEqual((await list()).rows, [{ name: 'Owner project', project: deck }]);

    await signIn(other);
    assert.deepEqual((await list()).rows, []);
    await assert.rejects(insert(owner, 'Cross-account insert'), { code: '42501' });
    assert.deepEqual((await db.query('delete from public.crs_saved_projects where user_id = $1 returning id', [owner])).rows, []);
    await insert(other, 'Other project');
    assert.deepEqual((await list()).rows, [{ name: 'Other project', project: deck }]);

    await signIn(owner, true);
    assert.deepEqual((await list()).rows, []);
    await db.exec('set role anon');
    await assert.rejects(list(), { code: '42501' });

    await signIn(owner);
    const rename = (name, expected) => db.query(`
      update public.crs_saved_projects set name = $1, revision = $2
      where user_id = $3 and id = 'activity-id' and revision = $4 returning name
    `, [name, nextRevision, owner, expected]);
    assert.deepEqual((await rename('Renamed project', firstRevision)).rows, [{ name: 'Renamed project' }]);
    assert.deepEqual((await rename('Stale edit', firstRevision)).rows, []);
    assert.deepEqual((await list()).rows, [{ name: 'Renamed project', project: deck }]);
  } finally {
    await db.close();
  }
});
