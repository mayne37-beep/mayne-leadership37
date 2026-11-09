import { randomBytes } from 'node:crypto';
import { del } from '@vercel/blob';
import { blobSignupStore } from '../src/signup-studio/storage.js';

if (process.env.VERCEL_ENV === 'production' || !process.env.BLOB_READ_WRITE_TOKEN) process.exit(70);
const token = process.env.BLOB_READ_WRITE_TOKEN;
const scope = 'qa-' + randomBytes(16).toString('hex');
const store = blobSignupStore(token, scope);
const path = 'forced-race.json';
let stage = 71;
let failure;
try {
  await store.write(path, { count: 0 }, null);
  for (let iteration = 0; iteration < 5; iteration += 1) {
    stage = 72;
    const { event, etag } = await store.read(path);
    if (event.count !== iteration) throw new Error('The latest read was not visible');
    stage = 73;
    const outcomes = await Promise.allSettled([
      store.write(path, { count: iteration + 1, winner: 'first' }, etag),
      store.write(path, { count: iteration + 1, winner: 'second' }, etag),
    ]);
    const successes = outcomes.filter(result => result.status === 'fulfilled' && result.value).length;
    if (successes === 2) { stage = 74; throw new Error('Two writes accepted the same ETag'); }
    if (successes === 0) { stage = 75; throw new Error('Both writes failed'); }
    if (outcomes.some(result => result.status === 'rejected')) { stage = 76; throw new Error('Unexpected conflict response'); }
  }
  stage = 77;
  if ((await store.read(path)).event.count !== 5) throw new Error('Final read inconsistent');
  console.log('Five forced private storage compare-and-swap races passed');
} catch (error) {
  failure = stage;
  console.log('Storage check stage', stage, error.constructor.name);
}
try { await del('sign-up-studio/v1/' + scope + '/' + path, { token }); }
catch { failure ||= 78; }
if (failure) process.exit(failure);
