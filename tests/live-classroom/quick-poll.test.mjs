import assert from 'node:assert/strict';
import test from 'node:test';
import { countPoll, createQuickPoll, currentSharedPoll, readBallot, readSharedPoll, savePollBallot } from '../../src/live-classroom/quick-poll.js';

const id = 'a'.repeat(32);
const time = 1710000000000;
const poll = (type, details = {}) => createQuickPoll({ type, question: 'Which approach?', ...details }, id, time);

test('quick binary questions work with a default prompt and choice labels must be distinct', () => {
  assert.equal(poll('thumbs', { question: '' }).question, 'Do you agree?');
  assert.deepEqual(poll('check', { question: '' }).options, ['Yes', 'No']);
  assert.throws(() => poll('choice', { options: [' Plan ', 'plan'] }), /different label/);
  assert.throws(() => poll('ranking', { options: ['Plan', ''] }), /answer options/);
  assert.throws(() => poll('words', { question: '' }), /question/);
});

test('one ballot per participant is counted, including retries and a rejoin with the same user ID', () => {
  const question = poll('choice', { options: ['A', 'B', 'C'], multiple: true });
  const ballots = new Map();
  assert.equal(savePollBallot(question, ballots, { session_id: 'a', user_id: 'student' }, [1, 2]).changed, true);
  assert.equal(savePollBallot(question, ballots, { session_id: 'b', user_id: 'student' }, [0]).changed, false);
  assert.equal(savePollBallot(question, ballots, { session_id: 'c' }, [0]).saved, true);
  assert.equal(savePollBallot(question, ballots, { session_id: 'd' }, [0, 0]).saved, false);
  assert.deepEqual(countPoll(question, ballots), { count: 2, values: [1, 1, 1] });
  question.open = false;
  assert.equal(savePollBallot(question, ballots, { session_id: 'd' }, [0]).saved, false);
  assert.equal(savePollBallot(question, ballots, { session_id: 'c' }, [0]).saved, true);
});

test('rankings require a complete order and keep exact sums for average-rank results', () => {
  const question = poll('ranking', { options: ['A', 'B', 'C'] });
  assert.equal(readBallot(question, [0, 1]), null);
  assert.equal(readBallot(question, [0, 1, 1]), null);
  const results = countPoll(question, new Map([['first', [1, 2, 0]], ['second', [2, 1, 0]]]));
  assert.deepEqual(results, { count: 2, values: [6, 3, 3] });
  assert.deepEqual(readSharedPoll({ ...question, open: false, results }).results, results);
  assert.equal(readSharedPoll({ ...question, results }).results, undefined);
});

test('word clouds combine repeated terms across ballots and keep shared results within the room data limit', () => {
  const question = poll('words');
  const a = readBallot(question, ['  Listen ', 'LISTEN', 'Ask   questions']);
  const b = readBallot(question, ['listen', 'Clarity', '']);
  assert.deepEqual(a, ['Listen', 'Ask questions']);
  assert.equal(readBallot(question, ['a'.repeat(31) + '\uD83D'])[0], 'a'.repeat(31) + '\uFFFD');
  assert.deepEqual(countPoll(question, new Map([['a', a], ['b', b]])), {
    count: 2, totalWords: 3, words: [['Listen', 2], ['Ask questions', 1], ['Clarity', 1]],
  });
  const ballots = new Map(Array.from({ length: 49 }, (_, i) => [
    String(i), readBallot(question, Array.from({ length: 3 }, (_, j) => i + '界'.repeat(28) + j)),
  ]));
  const results = countPoll(question, ballots);
  const shared = { ...question, open: false, results };
  assert.equal(results.totalWords, 147);
  assert.equal(results.words.length, 24);
  assert.ok(Buffer.byteLength(JSON.stringify({
    quickPoll: { ...shared, question: '界'.repeat(180) }, raised: false, cameraBackdrop: '#ffffff',
    presentation: { layout: 'weather', mirror: true, side: 'left' },
  })) < 4096);
  assert.deepEqual(readSharedPoll(shared).results, results);
});

test('only a current room owner can supply the poll to an attendee', () => {
  const question = poll('thumbs');
  const organizer = { owner: true, session_id: 'host', userData: { quickPoll: question } };
  const guest = { owner: false, session_id: 'guest', userData: { quickPoll: { ...question, launchedAt: time + 1 } } };
  assert.deepEqual(currentSharedPoll([guest, organizer]), { organizer: 'host', poll: question });
  assert.equal(currentSharedPoll([guest]), null);
  assert.equal(readSharedPoll({ ...question, id: 'invalid' }), null);
});
