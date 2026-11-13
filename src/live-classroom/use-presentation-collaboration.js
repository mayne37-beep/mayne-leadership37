import { useEffect, useRef, useState } from 'react';
import { newNonce } from './client.js';
import { annotationModes, annotationSnapshot, changeMarks, maxMarks, presentationId, readAnnotationSnapshot, readSlideCommand } from './annotations.js';
import { canParticipate, participantCanSend } from './meeting-roles.js';
import { participantName } from './use-call.js';
import { screenTrack } from './presentation-stream.js';

export function usePresentationCollaboration({ call, local, shared, participants, localData, file, sync, send, notify }) {
  const [localBoard, setLocalBoard] = useState(null);
  const [remoteBoard, setRemoteBoard] = useState(null);
  const [requests, setRequests] = useState([]);
  const [requested, setRequested] = useState('');
  const hosted = useRef(null);
  const remote = useRef(null);
  const snapshot = useRef(null);
  const requestTimes = useRef(new Map());
  const broadcast = useRef(null);
  const localId = local?.session_id;
  const sharedId = shared?.session_id;
  const canShare = participantCanSend(local, 'screenVideo');
  const trackId = local?.screen ? screenTrack(call)?.id : '';
  const room = call?.participants();
  const shareId = shared?.local ? localData.presentationId : shared?.userData?.presentationId;
  const own = Boolean(shared?.local);
  const page = file.status === 'live' ? file.deck.page : -1;
  const pages = file.status === 'live' ? file.deck.count : 0;
  const visible = own ? (canShare ? localBoard : null) : (remoteBoard?.id === shareId ? remoteBoard : null);
  const eligible = participants.filter(person => !person.local && canParticipate(person));
  const controllerId = localBoard?.controller;
  const controller = controllerId && room?.[controllerId];
  const controllerActive = Boolean(controller && canParticipate(controller));
  const controlling = Boolean(visible?.pages && visible.controller && visible.controller === localId && canParticipate(local));

  function post(type, fields, recipient = '*') {
    try { return send(type, fields, recipient, call); } catch { return false; }
  }

  function publish(current, recipient) {
    for (const part of annotationSnapshot(current)) post('presentation-board', part, recipient);
  }

  function commit(patch) {
    const session = hosted.current;
    if (!session) return;
    const next = { ...session.board, ...patch, revision: session.board.revision + 1 };
    session.board = next;
    setLocalBoard(next);
    if (broadcast.current !== null) return;
    broadcast.current = setTimeout(() => {
      broadcast.current = null;
      if (hosted.current === session && currentPresenter()) publish(session.board);
    }, 75);
  }

  function currentPresenter() {
    const person = call?.participants().local;
    return Boolean(person && person.session_id === localId && person.screen && participantCanSend(person, 'screenVideo') &&
      screenTrack(call)?.id === hosted.current?.trackId);
  }

  useEffect(() => () => {
    clearTimeout(broadcast.current);
    broadcast.current = null;
    hosted.current = null;
    remote.current = null;
    snapshot.current = null;
    requestTimes.current.clear();
    setLocalBoard(null);
    setRemoteBoard(null);
    setRequests([]);
    setRequested('');
  }, [call]);

  useEffect(() => {
    if (!call || !trackId || !canShare) return;
    const id = newNonce();
    const initial = { id, revision: 0, pageVersion: 0, mode: 'off', page, pages, controller: '', controlKey: '', marks: [] };
    const session = { trackId, board: initial, marksByPage: new Map() };
    hosted.current = session;
    sync({ presentationId: id }, call).catch(() => {
      if (hosted.current === session) {
        hosted.current = null;
        setLocalBoard(null);
        notify('Presentation tools could not connect. Restart the share to try again.');
      }
    }).then(() => {
      if (hosted.current === session) setLocalBoard(session.board);
    });
    return () => {
      clearTimeout(broadcast.current);
      broadcast.current = null;
      hosted.current = null;
      requestTimes.current.clear();
      setLocalBoard(null);
      setRequests([]);
      sync({ presentationId: null }, call).catch(() => {});
    };
  }, [call, trackId, localId, canShare]);

  useEffect(() => {
    const session = hosted.current;
    const current = session?.board;
    if (!current || (current.page === page && current.pages === pages)) return;
    commit({ page, pages, pageVersion: current.pageVersion + 1, marks: session.marksByPage.get(page) ?? [] });
  }, [trackId, page, pages]);

  useEffect(() => {
    if (!call || own || !presentationId(shareId) || !sharedId) return;
    const request = () => {
      const revision = remote.current?.id === shareId ? remote.current.revision : -1;
      post('presentation-sync', { id: shareId, revision }, sharedId);
    };
    request();
    const retry = setTimeout(() => { if (remote.current?.id !== shareId) request(); }, 1200);
    const check = setInterval(request, 9000);
    return () => {
      clearTimeout(retry);
      clearInterval(check);
    };
  }, [call, own, shareId, sharedId]);

  useEffect(() => {
    const current = hosted.current?.board;
    if (!current?.controller) return;
    if (!controllerActive) {
      commit({ controller: '', controlKey: '' });
      notify('Slide control returned to you.');
    }
  }, [controllerId, controllerActive]);

  function edit(action) {
    if (!visible || visible.mode === 'off') return;
    if (own && currentPresenter()) {
      if (action.kind === 'add' && visible.marks.length >= maxMarks) {
        notify('Clear or erase a mark to add another.');
        return;
      }
      const marks = changeMarks(hosted.current.board.marks, action, localId, true);
      if (marks !== hosted.current.board.marks) {
        hosted.current.marksByPage.set(visible.page, marks);
        commit({ marks });
      }
    } else if (visible.mode === 'everyone' && canParticipate(local)) {
      if (action.kind === 'add' && visible.marks.length >= maxMarks) {
        notify('Erase one of your marks or ask the presenter to clear the page.');
        return;
      }
      if (!post('presentation-mark', { id: visible.id, page: visible.page, pageVersion: visible.pageVersion, action }, sharedId)) {
        notify('The mark could not be sent. Try again.');
      }
    }
  }

  function setMode(mode) {
    if (own && currentPresenter() && annotationModes.includes(mode)) commit({ mode });
  }

  function giveControl(id) {
    const current = hosted.current?.board;
    const person = call?.participants()[id];
    if (!currentPresenter() || !current?.pages || !person || person.local || !canParticipate(person)) return;
    commit({ controller: id, controlKey: newNonce() });
    setRequests([]);
    notify(participantName(person) + ' can now advance the slides.');
  }

  function takeBack() {
    if (currentPresenter() && hosted.current?.board.controller) commit({ controller: '', controlKey: '' });
  }

  function requestControl() {
    if (!visible?.pages || !canParticipate(local) || own || visible.controller || requested === visible.id) return;
    if (post('presentation-request', { id: visible.id }, sharedId)) setRequested(visible.id);
  }

  function declineControl(id) {
    const current = hosted.current?.board;
    if (!currentPresenter() || !current) return;
    setRequests(previous => previous.filter(request => request.id !== id));
    post('presentation-declined', { id: current.id }, id);
  }

  function goTo(target) {
    if (!controlling || !visible) return;
    post('presentation-page', { id: visible.id, page: visible.page, pageVersion: visible.pageVersion, target, controlKey: visible.controlKey }, sharedId);
  }

  function releaseControl() {
    if (controlling && visible) post('presentation-release', { id: visible.id, controlKey: visible.controlKey }, sharedId);
  }

  useEffect(() => {
    if (!requested) return;
    if (controlling || visible?.controller) {
      setRequested('');
      return;
    }
    const timeout = setTimeout(() => setRequested(''), 12000);
    return () => clearTimeout(timeout);
  }, [requested, controlling, visible?.controller]);

  function receive(message, sender) {
    if (typeof message.type !== 'string' || !message.type.startsWith('presentation-')) return false;
    if (!call || !local || sender.local) return true;
    const id = sender.session_id;
    if (message.type === 'presentation-board' || message.type === 'presentation-declined') {
      if (id !== sharedId || own || !sender.screen || !participantCanSend(sender, 'screenVideo') ||
          !presentationId(shareId) || sender.userData?.presentationId !== shareId) return true;
      if (message.type === 'presentation-declined') {
        if (message.id === requested) {
          setRequested('');
          notify('The presenter declined your request.');
        }
        return true;
      }
      const part = readAnnotationSnapshot(message, shareId);
      if (!part || (remote.current?.id === shareId && remote.current.revision >= part.state.revision)) return true;
      const partial = snapshot.current;
      if (partial?.state.id === shareId && partial.state.revision > part.state.revision) return true;
      if (partial?.state.id !== shareId || partial.state.revision !== part.state.revision) {
        snapshot.current = { state: part.state, count: part.count, parts: new Map() };
      }
      const current = snapshot.current;
      if (current.count !== part.count) return true;
      current.parts.set(part.index, part.marks);
      if (current.parts.size === current.count) {
        const marks = Array.from({ length: current.count }, (_, index) => current.parts.get(index)).flat();
        snapshot.current = null;
        remote.current = { ...current.state, marks };
        setRemoteBoard(remote.current);
      }
      return true;
    }
    const current = hosted.current?.board;
    if (!currentPresenter() || !current || message.id !== current.id) return true;
    if (message.type === 'presentation-sync') {
      const key = 'sync:' + id;
      if (Date.now() - (requestTimes.current.get(key) ?? 0) >= 500) {
        requestTimes.current.set(key, Date.now());
        if (message.revision !== current.revision) publish(current, id);
      }
      return true;
    }
    if (!canParticipate(sender)) return true;
    if (message.type === 'presentation-mark' && current.mode === 'everyone' && message.page === current.page &&
        message.pageVersion === current.pageVersion && message.action && typeof message.action === 'object') {
      const marks = changeMarks(current.marks, message.action, id, false);
      if (marks !== current.marks) {
        hosted.current.marksByPage.set(current.page, marks);
        commit({ marks });
      }
    }
    if (message.type === 'presentation-request' && current.pages && !current.controller) {
      const key = 'control:' + id;
      if (Date.now() - (requestTimes.current.get(key) ?? 0) < 3000) return true;
      requestTimes.current.set(key, Date.now());
      setRequests(previous => previous.some(request => request.id === id) ? previous :
        [...previous, { id, name: participantName(sender) }]);
    }
    if (message.type === 'presentation-release' && current.controller === id && current.controlKey === message.controlKey) takeBack();
    if (message.type === 'presentation-page') {
      const next = readSlideCommand(current, message, id);
      if (next !== null && file.status === 'live' && file.goTo(next)) {
        commit({ page: next, pageVersion: current.pageVersion + 1, marks: hosted.current.marksByPage.get(next) ?? [] });
      }
    }
    return true;
  }

  return {
    board: visible, localBoard, own, localId, controller: controllerActive ? controller : null, controlling,
    requests: requests.filter(request => eligible.some(person => person.session_id === request.id)),
    participants: eligible, requested: Boolean(shareId && requested === shareId),
    edit, setMode, giveControl, takeBack, requestControl, declineControl, goTo, releaseControl, receive,
  };
}
