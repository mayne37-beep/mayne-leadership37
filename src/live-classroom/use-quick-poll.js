import { useEffect, useMemo, useRef, useState } from 'react';
import { newNonce } from './client.js';
import { countPoll, createQuickPoll, currentSharedPoll, pollIdPattern, readBallot, savePollBallot } from './quick-poll.js';

const retryMs = 1800;
const maxAttempts = 3;

export function useQuickPoll({ callRef, call, organizer, participants, localPoll, sync, send }) {
  const hosted = useRef(null);
  const pending = useRef(null);
  const operating = useRef(null);
  const [results, setResults] = useState(null);
  const [sending, setSending] = useState(false);
  const [accepted, setAccepted] = useState(null);
  const [ballotDraft, setBallotDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const remote = useMemo(() => organizer ? null : currentSharedPoll(participants), [organizer, participants]);
  const visible = call ? organizer ? localPoll : remote?.poll : null;

  function clearPending() {
    clearTimeout(pending.current?.timer);
    pending.current = null;
  }

  useEffect(() => {
    hosted.current = null;
    operating.current = null;
    setResults(null);
    setAccepted(null);
    setSending(false);
    setBusy(false);
    setError('');
    return clearPending;
  }, [call]);

  useEffect(() => {
    clearPending();
    setSending(false);
    setAccepted(null);
    setError('');
    return clearPending;
  }, [visible?.id, remote?.organizer]);

  async function manage(operation) {
    if (!call || !organizer || operating.current) return false;
    const active = {};
    operating.current = active;
    setBusy(true);
    setError('');
    try {
      await operation();
      return callRef.current === call && operating.current === active;
    }
    catch (error) {
      if (operating.current === active) setError(error?.message || 'Could not update the poll. Try again.');
      return false;
    }
    finally {
      if (operating.current === active) {
        operating.current = null;
        setBusy(false);
      }
    }
  }

  function launch(draft) {
    if (hosted.current?.poll.open) return false;
    return manage(async () => {
      const poll = createQuickPoll(draft, newNonce(), Date.now());
      const previous = hosted.current;
      const next = { poll, ballots: new Map() };
      hosted.current = next;
      setResults(countPoll(poll, next.ballots));
      try { await sync({ quickPoll: poll }, call); }
      catch (error) {
        if (hosted.current === next) {
          hosted.current = previous;
          setResults(previous ? countPoll(previous.poll, previous.ballots) : null);
        }
        throw error;
      }
    });
  }

  function close() {
    const current = hosted.current;
    if (!current?.poll.open) return false;
    return manage(async () => {
      const poll = current.poll;
      current.poll = { ...poll, open: false };
      try { await sync({ quickPoll: current.poll }, call); }
      catch (error) { current.poll = poll; throw error; }
    });
  }

  function share() {
    const current = hosted.current;
    if (!current || current.poll.open || current.poll.results) return false;
    return manage(async () => {
      const next = { ...current.poll, results: countPoll(current.poll, current.ballots) };
      await sync({ quickPoll: next }, call);
      current.poll = next;
    });
  }

  function newPoll() {
    if (hosted.current?.poll.open) return false;
    const previous = hosted.current;
    return manage(async () => {
      await sync({ quickPoll: null }, call);
      if (hosted.current === previous) {
        hosted.current = null;
        setResults(null);
      }
    });
  }

  function sendMessage(type, fields, to) {
    try { return send(type, fields, to, call); } catch { return false; }
  }

  function submit(values) {
    if (!visible?.open || !remote?.organizer || pending.current || accepted?.id === visible.id) return;
    const ballot = readBallot(visible, values);
    if (!ballot) { setError('Enter a response before submitting.'); return; }
    setError('');
    setSending(true);
    const request = { id: visible.id, requestId: newNonce(), timer: undefined };
    pending.current = request;
    let attempts = 0;
    function attempt() {
      if (pending.current !== request) return;
      if (attempts >= maxAttempts) {
        clearPending();
        setSending(false);
        setError('Your response could not be confirmed. Try submitting again.');
        return;
      }
      attempts++;
      request.timer = setTimeout(attempt, retryMs);
      sendMessage('poll-ballot', { id: request.id, requestId: request.requestId, ballot }, remote.organizer);
    }
    attempt();
  }

  function receive(message, sender) {
    if (!call || callRef.current !== call) return;
    if (message.type === 'poll-ballot' && organizer && !sender.local) {
      const current = hosted.current;
      if (!current || message.id !== current.poll.id || typeof message.requestId !== 'string' ||
          !pollIdPattern.test(message.requestId)) return;
      const { saved, changed } = savePollBallot(current.poll, current.ballots, sender, message.ballot);
      if (changed) setResults(countPoll(current.poll, current.ballots));
      sendMessage('poll-receipt', { id: message.id, requestId: message.requestId, saved }, sender.session_id);
    }
    if (message.type === 'poll-receipt' && sender.owner && sender.session_id === remote?.organizer) {
      const request = pending.current;
      if (!request || message.id !== request.id || message.requestId !== request.requestId) return;
      clearPending();
      setSending(false);
      if (message.saved === true) setAccepted({ id: request.id, organizer: sender.session_id });
      else setError('This poll has closed. Your response was not counted.');
    }
  }

  function updateBallot(values) {
    setBallotDraft({ call, id: visible.id, organizer: remote?.organizer, values });
  }

  const answered = Boolean(accepted && accepted.id === visible?.id && accepted.organizer === remote?.organizer);
  const ballot = ballotDraft && ballotDraft.call === call && ballotDraft.id === visible?.id &&
    ballotDraft.organizer === remote?.organizer ? ballotDraft.values : undefined;
  return { poll: visible, results, launch, close, share, newPoll, submit, receive, answered, ballot, updateBallot, sending, busy, error };
}
