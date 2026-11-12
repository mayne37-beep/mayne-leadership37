import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../../api/live-classroom.js';
import { activityPath, attendanceCsv } from '../../src/live-classroom/shared.js';

const origin = 'https://meeting-test.mayneleadership.com';
const daily = 'https://sample.daily.co';
const auth = {
  organizer: 'Bearer organizer-instructor-test-abc',
  other: 'Bearer another-instructor-test-abcd',
  student: 'Bearer enrolled-student-test-abcdef',
};
const ids = {
  [auth.organizer]: '8de7c892-2df6-4fee-b218-6dcb685d8a11',
  [auth.other]: '8de7c892-2df6-4fee-b218-6dcb685d8a12',
  [auth.student]: '8de7c892-2df6-4fee-b218-6dcb685d8a13',
};

async function call(action, data = {}, authorization, headers = {}) {
  let status;
  let body;
  const req = {
    method: 'POST',
    headers: { host: new URL(origin).host, origin, 'content-type': 'application/json', authorization, ...headers },
    body: { action, ...data },
  };
  const res = {
    setHeader() {},
    status(value) { status = value; return this; },
    json(value) { body = value; },
  };
  await handler(req, res);
  return { status, body };
}

test('a Daily key discovers the domain and only the organizer can manage private rooms', async t => {
  const env = {
    DAILY_API_KEY: 'sample-server-key', DAILY_ROOM_ORIGIN: '', LIVE_CLASSROOM_SIGNING_KEY: 'sample-signature-key',
    DAILY_RECORDING_ENABLED: 'true',
  };
  const oldEnv = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  t.after(() => {
    for (const [key, value] of Object.entries(oldEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  delete process.env.DAILY_API_KEY;
  const pending = await call('status');
  assert.equal(pending.body.configured, false);
  assert.equal(pending.body.setup, 'daily-key-missing');
  assert.equal((await call('create')).status, 503);
  Object.assign(process.env, env);
  assert.equal((await call('status')).body.configured, true);
  process.env.DAILY_ROOM_ORIGIN = daily + '/old-room';
  assert.equal((await call('status')).body.configured, true);

  const rooms = new Map();
  const tokens = [];
  let createCount = 0;
  let domainLookups = 0;
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const address = new URL(url);
    if (address.hostname.endsWith('.supabase.co')) {
      const id = ids[options.headers.Authorization];
      if (!id) return Response.json({}, { status: 401 });
      if (address.pathname.endsWith('/user')) return Response.json({ id });
      return Response.json(id === ids[auth.student] ? [] : [{ user_id: id }]);
    }
    assert.equal(options.headers.Authorization, 'Bearer sample-server-key');
    const path = address.pathname;
    if (path === '/v1/') {
      assert.equal(options.method, 'GET');
      domainLookups++;
      if (domainLookups === 1) return Response.json({}, { status: 429 });
      return Response.json({ domain_name: 'sample', config: {} });
    }
    if (path === '/v1/rooms') {
      const { name, privacy, properties } = JSON.parse(options.body);
      if (rooms.has(name)) return Response.json({}, { status: 400 });
      createCount++;
      const row = { name, privacy, url: daily + '/' + name, config: properties };
      rooms.set(name, row);
      return Response.json(row);
    }
    if (path === '/v1/meeting-tokens') {
      const { properties } = JSON.parse(options.body);
      assert.ok(rooms.has(properties.room_name));
      tokens.push(properties);
      return Response.json({ token: 'token-' + tokens.length });
    }
    const name = path.split('/').at(-1);
    if (!rooms.has(name)) return Response.json({}, { status: 404 });
    const row = rooms.get(name);
    if (options.method === 'DELETE') {
      rooms.delete(name);
      return Response.json({ deleted: true, name });
    }
    if (options.method === 'POST') Object.assign(row.config, JSON.parse(options.body).properties);
    return Response.json(row);
  });

  const nonce = 'b'.repeat(32);
  assert.equal((await call('create', { title: 'Class', nonce })).status, 401);
  assert.equal((await call('create', { title: 'Class', nonce }, auth.student)).status, 403);
  assert.equal((await call('create', { title: 'Class', nonce }, auth.organizer, { origin: 'https://different.example' })).status, 403);
  assert.equal(domainLookups, 0);
  const firstTry = await call('create', { title: 'Leadership Workshop', nonce }, auth.organizer);
  assert.equal(firstTry.status, 429);
  assert.equal(createCount, 0);
  const created = await call('create', { title: 'Leadership Workshop', nonce }, auth.organizer);
  assert.equal(created.status, 200);
  const { body: entry } = created;
  assert.equal(entry.url, daily + '/' + entry.room);
  assert.equal(rooms.get(entry.room).privacy, 'private');
  assert.equal(rooms.get(entry.room).config.enable_knocking, true);
  assert.equal(rooms.get(entry.room).config.enable_recording, 'cloud');
  const retried = await call('create', { title: 'Leadership Workshop', nonce }, auth.organizer);
  assert.equal(retried.body.room, entry.room);
  assert.equal(createCount, 1);

  const input = { invite: entry.invite, nonce };
  const guest = await call('inspect', { invite: entry.invite });
  assert.equal(guest.status, 200);
  assert.equal(guest.body.title, 'Leadership Workshop');
  assert.equal(guest.body.url, entry.url);
  assert.equal(guest.body.token, undefined);
  const corrupt = entry.invite.slice(0, -1) + (entry.invite.endsWith('a') ? 'b' : 'a');
  assert.equal((await call('inspect', { invite: corrupt })).status, 404);
  assert.equal((await call('host', input)).status, 401);
  assert.equal((await call('host', input, auth.other)).status, 403);
  assert.equal((await call('host', input, auth.organizer)).body.token, 'token-1');
  assert.deepEqual(tokens[0], { room_name: entry.room, exp: entry.end, is_owner: true });

  const locked = await call('lock', { ...input, locked: true }, auth.organizer);
  assert.equal(locked.body.locked, true);
  const round = 'a'.repeat(32);
  const breakout = await call('breakouts-open', { ...input, round, count: 2, minutes: 10 }, auth.organizer);
  assert.equal(breakout.status, 200);
  assert.equal(breakout.body.groups.length, 2);
  assert.equal(new Set(breakout.body.groups.map(group => group.url)).size, 2);
  assert.equal(tokens.filter(token => token.is_owner).length, 3);
  assert.equal(tokens.filter(token => token.room_name === entry.room && !token.is_owner).length, 1);
  const ended = await call('end', { ...input, round, count: 2 }, auth.organizer);
  assert.equal(ended.body.ended, true);
  assert.equal(rooms.size, 0);
  assert.equal((await call('host', input, auth.organizer)).status, 410);
  assert.equal(domainLookups, 2);
});

test('scheduled rooms set the provider start time and cannot be opened early', async t => {
  const env = { DAILY_API_KEY: 'sample', DAILY_ROOM_ORIGIN: daily, LIVE_CLASSROOM_SIGNING_KEY: 'sample' };
  const oldEnv = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  t.after(() => {
    for (const [key, value] of Object.entries(oldEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  Object.assign(process.env, env);
  const start = Math.floor(Date.now() / 1000) + 3600;
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    if (url.includes('/auth/v1/user')) return Response.json({ id: ids[auth.organizer] });
    if (url.includes('/rest/v1/ml360_admins')) return Response.json([{ user_id: ids[auth.organizer] }]);
    const { name, privacy, properties } = JSON.parse(options.body);
    assert.equal(properties.nbf, start);
    assert.equal(properties.exp, start + 5400);
    return Response.json({ name, privacy, url: daily + '/' + name, config: properties });
  });
  const nonce = 'c'.repeat(32);
  const result = await call('create', { nonce, start, title: 'Scheduled class', duration: 90 }, auth.organizer);
  assert.equal(result.status, 200);
  assert.equal((await call('host', { invite: result.body.invite, nonce }, auth.organizer)).status, 409);
});

test('activity links use the current website and attendance cells escape formulas', () => {
  assert.equal(activityPath('012345', origin), '/word-cloud-respond.html?code=012345');
  assert.equal(activityPath('123 4567', origin), '/word-cloud-respond.html?code=1234567');
  assert.equal(activityPath(origin + '/word-cloud-respond.html?code=123%204567', origin), '/word-cloud-respond.html?code=1234567');
  assert.equal(activityPath('https://mayneleadership.com/word-cloud-respond.html?code=1234567', 'https://www.mayneleadership.com'), '/word-cloud-respond.html?code=1234567');
  assert.equal(activityPath('ab12cd', origin), '');
  assert.equal(activityPath('https://different.example/word-cloud-respond.html?code=1234567', origin), '');
  assert.match(attendanceCsv([{ name: '=1+1', room: 'Main', joined: 0, left: 60000 }]), /"'=1\+1"/);
});
