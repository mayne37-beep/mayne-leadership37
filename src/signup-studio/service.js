import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { bookingAlert, emailAddress, EMAIL_RETRY_MS, reservationNotice, reservationUrl } from './mail.js';

const ADMIN = new Set(['list', 'get', 'save', 'publish', 'close', 'archive', 'restore', 'add', 'move', 'remove', 'retry-email']);
const PARTICIPANT = new Set(['view', 'reserve', 'change', 'cancel']);
const ID = /^[a-f0-9]{32}$/;
const KEY = /^[a-f0-9]{64}$/;
const INVITE = /^[a-f0-9]{96}$/;
const MANAGE = /^([a-f0-9]{32})\.([a-f0-9]{64})$/;
const THEMES = new Set(['general', 'coaching', 'baking', 'volunteer', 'sports', 'celebration']);
const MAX_SLOTS = 100;
const MAX_RESERVATIONS = 2000;
const MAIL_BATCH_SIZE = 50;
const MAIL_QUEUE_LIMIT = 2500;
const CONFLICT = 'This sheet changed in another tab. Reload the saved sheet before making further edits.';

export class SignupError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const fail = (status, message) => { throw new SignupError(status, message); };
const hash = value => createHash('sha256').update(value).digest('hex');
const newId = () => randomUUID().replaceAll('-', '');
const matches = (rule, value) => typeof value === 'string' && rule.test(value);

function readText(value, max, label, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) {
    fail(400, required ? `Enter ${label} (up to ${max} characters).` : `Keep ${label} under ${max} characters.`);
  }
  return value.trim();
}

function readEmail(value, label, required = false) {
  if (!required && (value === undefined || value === '')) return '';
  const address = emailAddress(value);
  if (!address) fail(400, 'Enter a valid ' + label + ' email address.');
  return address;
}

function contactSettings(value = { collectEmail: false }) {
  if (!value || typeof value.collectEmail !== 'boolean') fail(400, 'Choose valid email settings.');
  return { collectEmail: value.collectEmail, organizerEmail: readEmail(value.organizerEmail, 'organizer') };
}

function eventDetails(value) {
  if (!value || !Array.isArray(value.slots) || value.slots.length > MAX_SLOTS) {
    fail(400, `Add up to ${MAX_SLOTS} slots per sheet.`);
  }
  const seen = new Set();
  const slots = value.slots.map(slot => {
    if (!slot || !matches(ID, slot.id) || seen.has(slot.id)) fail(400, 'Each slot needs a unique ID.');
    seen.add(slot.id);
    const date = slot.date;
    const start = slot.start;
    const end = slot.end;
    const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
    if (date !== '' && (!matches(/^20\d\d-\d\d-\d\d$/, date) ||
      !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) {
      fail(400, 'Choose a valid date for each dated slot.');
    }
    if ((start !== '' && !matches(time, start)) || (end !== '' && !matches(time, end)) ||
      (!date && (start || end)) || (end && (!start || end <= start))) {
      fail(400, 'Set a date for timed slots and choose an end time after the start.');
    }
    if (!Number.isInteger(slot.capacity) || slot.capacity < 1 || slot.capacity > 200) {
      fail(400, 'Slot capacity must be between 1 and 200.');
    }
    return {
      id: slot.id, label: readText(slot.label, 120, 'a slot name', true), date, start, end,
      capacity: slot.capacity, detail: readText(slot.detail, 400, 'slot instructions'),
    };
  });
  if (!THEMES.has(value.theme)) fail(400, 'Choose an available banner theme.');
  return {
    title: readText(value.title, 120, 'an event title', true),
    description: readText(value.description, 2000, 'event instructions'),
    location: readText(value.location, 160, 'the location'),
    zone: readText(value.zone, 60, 'the time zone label'),
    bannerLabel: readText(value.bannerLabel, 60, 'the banner label'),
    theme: value.theme,
    slots,
  };
}

function counts(event, except) {
  const filled = new Map();
  for (const reservation of event.reservations) {
    if (reservation.cancelled || reservation === except) continue;
    for (const slot of reservation.slots) filled.set(slot, (filled.get(slot) || 0) + 1);
  }
  return filled;
}

function capacitySlots(event) {
  const filled = counts(event);
  return event.details.slots.map(slot => ({ ...slot, remaining: slot.capacity - (filled.get(slot.id) || 0) }));
}

function validateChoices(event, selection, except) {
  if (!Array.isArray(selection) || !selection.length || selection.length > MAX_SLOTS ||
      new Set(selection).size !== selection.length) fail(400, 'Select at least one slot.');
  const filled = counts(event, except);
  for (const id of selection) {
    const slot = event.details.slots.find(item => item.id === id);
    if (!slot) fail(409, 'A selected slot changed. Refresh the sheet to choose again.');
    if ((filled.get(id) || 0) >= slot.capacity) fail(409, 'A selected slot is full. Refresh availability and choose again.');
  }
}

function visibleReservation(reservation) {
  return reservation && {
    id: reservation.id, name: reservation.name, slots: reservation.slots, cancelled: !!reservation.cancelled,
  };
}

const mailQueue = event => event.mailOutbox || [];
const mailCount = batches => batches.reduce((total, batch) => total + batch.messages.length, 0);

function affectedReservations(event, details) {
  const current = event.details;
  const eventChanged = ['title', 'description', 'location', 'zone'].some(field => current[field] !== details[field]);
  const updatedSlots = new Map(details.slots.map(slot => [slot.id, slot]));
  const changedSlots = new Set(current.slots.filter(slot => {
    const next = updatedSlots.get(slot.id);
    return next && ['label', 'date', 'start', 'end', 'detail'].some(field => slot[field] !== next[field]);
  }).map(slot => slot.id));
  return event.reservations.filter(r => !r.cancelled && r.email && (eventChanged || r.slots.some(id => changedSlots.has(id))));
}

function summary(event) {
  return {
    id: event.id, title: event.details.title, status: event.status, updated: event.updated,
    slots: event.details.slots.length, bookings: [...counts(event).values()].reduce((total, count) => total + count, 0),
    theme: event.details.theme,
  };
}

export function createSignupService(store, secret, mailer = null) {
  const stamp = ref => createHmac('sha256', secret).update('signup-studio:invitation:' + ref).digest('hex').slice(0, 32);
  const manageStamp = (ref, id) => createHmac('sha256', secret).update('signup-studio:reservation:' + ref + ':' + id).digest('hex');

  function eventPath(workspace, id) {
    return workspace + '/' + id + '.json';
  }

  function invitePath(invite) {
    if (!matches(INVITE, invite)) fail(404, 'This invitation is unavailable.');
    const ref = invite.slice(0, 64);
    if (!timingSafeEqual(Buffer.from(stamp(ref), 'hex'), Buffer.from(invite.slice(64), 'hex'))) {
      fail(404, 'This invitation is unavailable.');
    }
    return eventPath(ref.slice(0, 32), ref.slice(32));
  }

  function organizerSheet(event, workspace) {
    const ref = workspace + event.id;
    return {
      ...summary(event), revision: event.revision, details: { ...event.details, slots: capacitySlots(event) },
      invite: event.published && event.status !== 'archived' ? ref + stamp(ref) : '',
      reservations: event.reservations.filter(r => !r.cancelled).map(r => ({ ...visibleReservation(r), email: r.email || '' })),
      contact: event.contact || contactSettings(),
      emailReady: !!mailer,
      pendingEmails: mailCount(mailQueue(event)),
      missedEmails: event.missedEmails || 0,
    };
  }

  function participantSheet(event, reservation) {
    return {
      ...event.details, slots: capacitySlots(event), status: event.status,
      collectEmail: !!event.contact?.collectEmail,
      emailReady: !!mailer,
      reservation: reservation ? { ...visibleReservation(reservation), hasEmail: !!reservation.email } : null,
    };
  }

  async function read(path) {
    const current = await store.read(path);
    if (!current) fail(404, 'This sign-up sheet is unavailable.');
    return current;
  }

  async function change(path, edit) {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const { event, etag } = await read(path);
      const { value, write = true } = edit(event);
      if (!write || await store.write(path, event, etag)) return value;
    }
    fail(409, 'This sheet is busy. Try your last action again.');
  }

  function guestMail(ref, event, reservation, type) {
    if (!mailer || !reservation.email) return null;
    const link = type === 'archived' ? '' :
      reservationUrl(ref + stamp(ref), reservation.id + '.' + manageStamp(ref, reservation.id));
    return reservationNotice(event, reservation, type, link);
  }

  function queueMail(event, messages) {
    if (!mailer) return;
    const items = messages.filter(Boolean);
    if (!items.length) return;
    const now = Date.now();
    const prior = mailQueue(event);
    const fresh = prior.filter(batch => now - batch.queuedAt < EMAIL_RETRY_MS);
    const accepted = items.slice(0, Math.max(0, MAIL_QUEUE_LIMIT - mailCount(fresh)));
    const missed = mailCount(prior) - mailCount(fresh) + items.length - accepted.length;
    event.missedEmails = (event.missedEmails || 0) + missed;
    event.mailOutbox = fresh;
    for (let i = 0; i < accepted.length; i += MAIL_BATCH_SIZE) {
      event.mailOutbox.push({ id: newId(), queuedAt: now, messages: accepted.slice(i, i + MAIL_BATCH_SIZE) });
    }
  }

  async function deliverMail(path, event) {
    const accepted = new Set();
    if (!mailer || !mailQueue(event).length) return accepted;
    const expired = new Set();
    const deadline = AbortSignal.timeout(6000);
    for (const batch of mailQueue(event)) {
      if (Date.now() - batch.queuedAt >= EMAIL_RETRY_MS) {
        expired.add(batch.id);
        continue;
      }
      if (deadline.aborted) break;
      try {
        await mailer(batch, deadline);
        accepted.add(batch.id);
      } catch {
        // The booking is already saved. Keep the same batch and idempotency key for a retry.
        break;
      }
    }
    if (accepted.size || expired.size) {
      try {
        const latest = await change(path, current => {
          const pending = mailQueue(current);
          const missed = mailCount(pending.filter(batch => expired.has(batch.id)));
          current.missedEmails = (current.missedEmails || 0) + missed;
          current.mailOutbox = pending.filter(batch => !accepted.has(batch.id) && !expired.has(batch.id));
          return { value: current, write: current.mailOutbox.length !== pending.length };
        });
        event.mailOutbox = latest.mailOutbox;
        event.missedEmails = latest.missedEmails;
      } catch {
        // Provider idempotency also covers a retry after an interrupted storage acknowledgment.
      }
    }
    return accepted;
  }

  async function admin(action, payload, workspace) {
    if (action === 'list') {
      const paths = await store.list(workspace + '/');
      const events = [];
      for (let offset = 0; offset < paths.length; offset += 8) {
        const batch = await Promise.all(paths.slice(offset, offset + 8).map(path => store.read(path)));
        events.push(...batch.filter(Boolean).map(({ event }) => summary(event)));
      }
      return { sheets: events.sort((a, b) => b.updated.localeCompare(a.updated)), emailReady: !!mailer };
    }
    const id = payload.id;
    if (!matches(ID, id)) fail(400, 'Choose a valid sheet.');
    const path = eventPath(workspace, id);
    const ref = workspace + id;
    if (action === 'get') return organizerSheet((await read(path)).event, workspace);
    if (action === 'retry-email') {
      if (!mailer) fail(503, 'Automatic email is waiting for sender setup.');
      const { event } = await read(path);
      await deliverMail(path, event);
      return organizerSheet(event, workspace);
    }
    if (action === 'save' && payload.revision === 0) {
      const details = eventDetails(payload.details);
      const existing = await store.read(path);
      if (existing) return organizerSheet(existing.event, workspace);
      const event = {
        id, details, contact: contactSettings(payload.contact), revision: 1, status: 'draft', published: false,
        updated: new Date().toISOString(), reservations: [],
      };
      if (!await store.write(path, event, null)) return organizerSheet((await read(path)).event, workspace);
      return organizerSheet(event, workspace);
    }
    const event = await change(path, event => {
      const messages = [];
      if (['save', 'publish', 'close', 'archive', 'restore'].includes(action)) {
        if (event.revision !== payload.revision) fail(409, CONFLICT);
        if (action === 'save') {
          if (event.status === 'archived') fail(409, 'Restore the sheet before editing it.');
          const details = eventDetails(payload.details);
          const occupied = counts(event);
          for (const [slot, count] of occupied) {
            const target = details.slots.find(item => item.id === slot);
            if (!target || target.capacity < count) fail(409, 'Move or remove reservations before deleting a slot or lowering its capacity.');
          }
          if (event.published && !details.slots.length) fail(400, 'Keep at least one slot on a published sheet.');
          const affected = event.published && mailer ? affectedReservations(event, details) : [];
          event.details = details;
          if (payload.contact !== undefined) event.contact = contactSettings(payload.contact);
          for (const reservation of affected) messages.push(guestMail(ref, event, reservation, 'event'));
        } else if (action === 'publish') {
          if (event.status === 'archived' || !event.details.slots.length) {
            fail(409, 'Restore the sheet if needed and save at least one slot before publishing.');
          }
          event.status = 'open';
          if (!event.published) {
            for (const reservation of event.reservations.filter(r => !r.cancelled)) {
              messages.push(guestMail(ref, event, reservation, 'confirmed'));
            }
          }
          event.published = true;
        } else if (action === 'close' && event.status === 'open') {
          event.status = 'closed';
        } else if (action === 'archive' && event.status !== 'archived') {
          event.status = 'archived';
          if (event.published) {
            for (const reservation of event.reservations.filter(r => !r.cancelled)) {
              messages.push(guestMail(ref, event, reservation, 'archived'));
            }
          }
        } else if (action === 'restore' && event.status === 'archived') {
          event.status = event.published ? 'closed' : 'draft';
        } else {
          fail(409, 'That action is unavailable for this sheet.');
        }
        event.revision += 1;
      } else {
        if (event.status === 'archived') fail(409, 'Restore the sheet before changing its roster.');
        const reservations = event.reservations;
        const reservation = reservations.find(r => r.id === payload.reservation && !r.cancelled);
        if (action === 'add') {
          if (!matches(ID, payload.reservation)) fail(400, 'Invalid reservation ID.');
          if (reservations.some(r => r.id === payload.reservation)) {
            return { value: event, write: false };
          }
          if (reservations.length >= MAX_RESERVATIONS) fail(409, 'This sheet has reached its reservation limit.');
          const name = readText(payload.name, 80, 'the participant name', true);
          validateChoices(event, [payload.slot]);
          const added = { id: payload.reservation, name, email: readEmail(payload.email, 'participant'), slots: [payload.slot] };
          reservations.push(added);
          if (event.published) messages.push(guestMail(ref, event, added, 'confirmed'));
        } else if (!reservation) {
          fail(404, 'That reservation is unavailable.');
        } else if (action === 'remove') {
          if (event.published) messages.push(guestMail(ref, event, reservation, 'canceled'));
          cancelReservation(reservation);
        } else {
          if (!reservation.slots.includes(payload.from)) fail(409, 'This reservation changed. Reload the roster.');
          const slots = reservation.slots.map(slot => slot === payload.from ? payload.to : slot);
          validateChoices(event, slots, reservation);
          reservation.slots = slots;
          if (event.published) messages.push(guestMail(ref, event, reservation, 'changed'));
        }
      }
      event.updated = new Date().toISOString();
      queueMail(event, messages);
      return { value: event };
    });
    await deliverMail(path, event);
    return organizerSheet(event, workspace);
  }

  function cancelReservation(reservation) {
    reservation.cancelled = true;
    reservation.slots = [];
    reservation.name = '';
    delete reservation.email;
  }

  async function guest(action, payload) {
    const path = invitePath(payload.invite);
    const ref = payload.invite.slice(0, 64);
    const proof = matches(KEY, payload.proof) ? hash('signup-studio:guest:' + payload.proof) : '';
    const manage = typeof payload.proof === 'string' ? MANAGE.exec(payload.proof) : null;
    const manageId = manage && timingSafeEqual(Buffer.from(manage[2], 'hex'), Buffer.from(manageStamp(ref, manage[1]), 'hex')) ? manage[1] : '';
    function current(event) {
      if (event.status !== 'open' && event.status !== 'closed') fail(404, 'This invitation is unavailable.');
      return event.reservations.find(r => (proof && r.proof === proof) || (manageId && r.id === manageId)) || null;
    }

    if (action === 'view') {
      const { event } = await read(path);
      return participantSheet(event, current(event));
    }
    if (!proof && !manageId) fail(400, 'Open your private reservation link to continue.');
    const { event, reservation } = await change(path, event => {
      let reservation = current(event);
      if (action === 'reserve' && reservation) {
        return { value: { event, reservation }, write: false };
      }
      if ((action !== 'reserve' || !proof) && !reservation) fail(404, 'This reservation could not be found.');
      const messages = [];
      if (action === 'cancel') {
        if (reservation.cancelled) return { value: { event, reservation }, write: false };
        messages.push(guestMail(ref, event, reservation, 'canceled'));
        cancelReservation(reservation);
      } else {
        if (event.status !== 'open') fail(409, 'This event is closed to new or changed reservations.');
        if (reservation?.cancelled) fail(409, 'This reservation was canceled. Start a new sign-up.');
        validateChoices(event, payload.slots, reservation);
        if (action === 'reserve') {
          if (event.reservations.length >= MAX_RESERVATIONS) fail(409, 'This sheet has reached its reservation limit.');
          const email = event.contact?.collectEmail ? readEmail(payload.email, 'participant', true) : '';
          reservation = { id: newId(), name: readText(payload.name, 80, 'your name', true), email, proof, slots: payload.slots };
          event.reservations.push(reservation);
          messages.push(bookingAlert(event), guestMail(ref, event, reservation, 'confirmed'));
        } else {
          const email = reservation.email || (event.contact?.collectEmail ? readEmail(payload.email, 'participant', true) : '');
          if (email === (reservation.email || '') && reservation.slots.length === payload.slots.length &&
              payload.slots.every(id => reservation.slots.includes(id))) return { value: { event, reservation }, write: false };
          reservation.email = email;
          reservation.slots = payload.slots;
          messages.push(guestMail(ref, event, reservation, 'changed'));
        }
      }
      queueMail(event, messages);
      return { value: { event, reservation } };
    });
    const ownBatches = mailQueue(event).filter(batch => batch.messages.some(message => message.reservation === reservation.id));
    const accepted = await deliverMail(path, event);
    const emailStatus = ownBatches.length ? (ownBatches.every(batch => accepted.has(batch.id)) ? 'accepted' : 'pending') : undefined;
    return { ...participantSheet(event, reservation), emailStatus };
  }

  return async ({ action, payload, workspaceKey, authorized }) => {
    if (ADMIN.has(action)) {
      if (!authorized) fail(401, 'Enter the site PIN to use organizer tools.');
      if (!matches(KEY, workspaceKey)) fail(400, 'Open a valid organizer workspace.');
      return admin(action, payload, hash('signup-studio:organizer:' + workspaceKey).slice(0, 32));
    }
    if (PARTICIPANT.has(action)) return guest(action, payload);
    fail(400, 'Unknown sign-up action.');
  };
}
