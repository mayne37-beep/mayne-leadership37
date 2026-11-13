import { cleanText } from './shared.js';

export const pollTypes = [
  { id: 'choice', label: 'Multiple choice' },
  { id: 'ranking', label: 'Ranking' },
  { id: 'thumbs', label: 'Thumbs up / down', question: 'Do you agree?', options: ['Thumbs up', 'Thumbs down'], symbols: ['👍', '👎'] },
  { id: 'check', label: 'Check mark / X', question: 'Are you ready to continue?', options: ['Yes', 'No'], symbols: ['✓', '✕'] },
  { id: 'words', label: 'Word cloud' },
];

export const questionLimit = 180;
export const optionLimit = 72;
export const maxOptions = 8;
export const wordLimit = 32;
export const maxWords = 3;
const cloudLimit = 24;
export const pollIdPattern = /^[a-f0-9]{32}$/;
export const emptyPollDraft = { type: 'choice', question: '', options: ['', ''], multiple: false };

export const pollType = id => pollTypes.find(type => type.id === id);
const normalized = value => value.normalize('NFKC').toLowerCase();
const pollText = (value, limit) => cleanText(value, limit).replace(/[\uD800-\uDFFF]/gu, '\uFFFD');

export function createQuickPoll(draft, id, launchedAt) {
  const type = pollType(draft?.type);
  if (!type) throw new Error('Choose a poll type.');
  const question = pollText(draft.question, questionLimit) || type.question;
  if (!question) throw new Error('Enter a question.');
  let options = type.options ?? [];
  if (type.id === 'choice' || type.id === 'ranking') {
    options = Array.isArray(draft.options) ? draft.options.map(value => pollText(value, optionLimit)) : [];
    if (options.length < 2 || options.length > maxOptions || options.some(option => !option)) {
      throw new Error('Enter 2 to 8 answer options.');
    }
    if (new Set(options.map(normalized)).size !== options.length) throw new Error('Each option needs a different label.');
  }
  return { id, launchedAt, type: type.id, question, options, multiple: type.id === 'choice' && draft.multiple === true, open: true };
}

export function readSharedPoll(value) {
  if (typeof value?.id !== 'string' || !pollIdPattern.test(value.id) || !Number.isSafeInteger(value.launchedAt) ||
      typeof value.open !== 'boolean') return null;
  let poll;
  try { poll = createQuickPoll(value, value.id, value.launchedAt); }
  catch { return null; }
  poll.open = value.open;
  const results = value.results;
  if (poll.open || !Number.isSafeInteger(results?.count) || results.count < 0) return poll;
  const count = results.count;
  if (poll.type === 'words') {
    if (!Array.isArray(results.words) || results.words.length > cloudLimit ||
        !Number.isSafeInteger(results.totalWords) || results.totalWords < results.words.length ||
        results.words.some(entry => !Array.isArray(entry) || !pollText(entry[0], wordLimit) ||
          !Number.isSafeInteger(entry[1]) || entry[1] < 1 || entry[1] > count)) return poll;
    const words = results.words.map(([word, uses]) => [pollText(word, wordLimit), uses]);
    if (new Set(words.map(([word]) => normalized(word))).size !== words.length) return poll;
    poll.results = { count, totalWords: results.totalWords, words };
  } else {
    const values = results.values;
    const limit = poll.type === 'ranking' ? count * poll.options.length : count;
    if (!Array.isArray(values) || values.length !== poll.options.length ||
        values.some(value => !Number.isSafeInteger(value) || value < 0 || value > limit)) return poll;
    poll.results = { count, values };
  }
  return poll;
}

export function readBallot(poll, values) {
  if (!Array.isArray(values) || !values.length) return null;
  if (poll.type === 'words') {
    if (values.length > maxWords || values.some(value => typeof value !== 'string')) return null;
    const terms = new Map();
    for (const value of values) {
      const term = pollText(value, wordLimit).replace(/\s+/g, ' ');
      const key = normalized(term);
      if (key && !terms.has(key)) terms.set(key, term);
    }
    return terms.size ? Array.from(terms.values()) : null;
  }
  const size = poll.options.length;
  if (values.length > size || (poll.type === 'ranking' ? values.length !== size : !poll.multiple && values.length !== 1) ||
      values.some(value => !Number.isInteger(value) || value < 0 || value >= size) ||
      new Set(values).size !== values.length) return null;
  return [...values];
}

export function countPoll(poll, ballots) {
  const count = ballots.size;
  if (poll.type === 'words') {
    const terms = new Map();
    for (const ballot of ballots.values()) {
      for (const word of ballot) {
        const key = normalized(word);
        const entry = terms.get(key);
        if (entry) entry[1]++;
        else terms.set(key, [word, 1]);
      }
    }
    const words = Array.from(terms.values()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return { count, totalWords: words.length, words: words.slice(0, cloudLimit) };
  }
  const values = poll.options.map(() => 0);
  for (const ballot of ballots.values()) {
    ballot.forEach((option, rank) => { values[option] += poll.type === 'ranking' ? rank + 1 : 1; });
  }
  return { count, values };
}

export function savePollBallot(poll, ballots, participant, values) {
  const id = participant.user_id || participant.session_id;
  if (!id) return { saved: false, changed: false };
  if (ballots.has(id)) return { saved: true, changed: false };
  if (!poll.open) return { saved: false, changed: false };
  const ballot = readBallot(poll, values);
  if (!ballot) return { saved: false, changed: false };
  ballots.set(id, ballot);
  return { saved: true, changed: true };
}

export function currentSharedPoll(participants) {
  let current = null;
  for (const person of participants) {
    if (!person.owner || person.local) continue;
    const poll = readSharedPoll(person.userData?.quickPoll);
    if (poll && (!current || poll.launchedAt > current.poll.launchedAt ||
        (poll.launchedAt === current.poll.launchedAt && poll.id > current.poll.id))) {
      current = { poll, organizer: person.session_id };
    }
  }
  return current;
}
