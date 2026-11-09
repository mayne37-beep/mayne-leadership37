import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { del } from '@vercel/blob';
import { createSignupService } from '../src/signup-studio/service.js';
import { blobSignupStore } from '../src/signup-studio/storage.js';

if (process.env.VERCEL_ENV === 'production') process.exit(10);
const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) process.exit(11);
const random = size => randomBytes(size).toString('hex');
const scope = 'qa-' + random(16);
const workspaceKey = random(32);
const id = random(16);
const slot = random(16);
const namespace = createHash('sha256').update('signup-studio:organizer:' + workspaceKey).digest('hex').slice(0, 32);
const service = createSignupService(blobSignupStore(token, scope), random(32));
const admin = (action, payload) => service({ action, payload, workspaceKey, authorized: true });
const guest = (action, payload) => service({ action, payload });
let stage = 12;
let failure;
try {
  const draft = await admin('save', { id, revision: 0, details: {
    title: 'Synthetic storage QA', description: '', theme: 'general', bannerLabel: '', location: '', zone: '',
    slots: [{ id: slot, label: 'Synthetic slot', capacity: 1, date: '', start: '', end: '', detail: '' }],
  } });
  stage = 13;
  assert.equal((await admin('list', {})).sheets[0].id, id);
  stage = 14;
  const { invite } = await admin('publish', { id, revision: draft.revision });
  stage = 51;
  assert.equal((await guest('view', { invite })).status, 'open');
  stage = 15;
  const proofs = [random(32), random(32)];
  const result = await Promise.allSettled(proofs.map(proof => guest('reserve', { invite, proof, name: 'Synthetic guest', slots: [slot] })));
  const wins = result.filter(outcome => outcome.status === 'fulfilled').length;
  const losing = result.find(outcome => outcome.status === 'rejected')?.reason;
  if (wins === 2) { stage = 52; throw new Error('Both reservations were accepted'); }
  if (wins === 0) {
    stage = losing?.status === 404 ? 53 : losing?.status === 409 ? 54 : losing?.name === 'BlobPreconditionFailedError' ? 55 : 56;
    throw new Error('Neither reservation was accepted');
  }
  if (losing?.status !== 409) {
    stage = losing?.name === 'BlobUnknownError' ? 57 : losing?.name === 'BlobPreconditionFailedError' ? 58 :
      /precondition|412|etag/i.test(losing?.message) ? 59 : losing?.status === 404 ? 60 : 61;
    throw new Error('Unexpected response for the second reservation');
  }
  stage = 16;
  const view = await guest('view', { invite });
  assert.equal(view.slots[0].remaining, 0);
  assert.equal(view.reservation, null);
  const winner = result.findIndex(outcome => outcome.status === 'fulfilled');
  stage = 17;
  const canceled = await guest('cancel', { invite, proof: proofs[winner] });
  assert.equal(canceled.slots[0].remaining, 1);
  console.log('Sign-Up Studio private storage smoke passed');
} catch (error) {
  failure = stage;
  console.log('Storage check stage', stage, error.name);
}
try {
  await del('sign-up-studio/v1/' + scope + '/' + namespace + '/' + id + '.json', { token });
} catch (error) {
  failure ||= 18;
  console.log('Storage check cleanup', error.name);
}
if (failure) process.exit(failure);
