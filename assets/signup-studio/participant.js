import { byId, button, copyField, eventBanner, field, inviteUrl, node, notice, request, secretKey, slotList, slotTime } from './shared.js';

const invite = new URLSearchParams(location.search).get('id') || '';
const fragment = new URLSearchParams(location.hash.slice(1)).get('reservation');
const storageKey = 'signup-studio-reservation:' + invite;
const validProof = /^(?:[a-f0-9]{32}\.)?[a-f0-9]{64}$/;
let proof = validProof.test(fragment || '') ? fragment : storedProof();
let sheet;
let screen = 'slots';
let selected = new Set();
let busy = false;
let nameDraft = '';
let emailDraft = '';

const booking = byId('booking');

function storedProof() {
  try { return sessionStorage.getItem(storageKey) || ''; } catch { return ''; }
}

function remember() {
  try {
    if (proof) sessionStorage.setItem(storageKey, proof);
    else sessionStorage.removeItem(storageKey);
  } catch { /* The private link is available for recovery. */ }
}

function api(action, payload = {}) {
  return request(action, { invite, proof, ...payload });
}

async function run(task, recoverConflict = false) {
  if (busy) return;
  busy = true;
  booking.inert = true;
  notice('Working…');
  try {
    notice(await task() || '');
  } catch (error) {
    if (recoverConflict && error.status === 409) {
      try {
        sheet = await api('view');
        screen = 'slots';
        selected = new Set((sheet.reservation?.slots || []).filter(id => sheet.slots.some(slot => slot.id === id)));
        render();
      } catch { /* Keep the last view and show the original error. */ }
    }
    notice(error.message || 'Try again in a moment.', true);
  } finally {
    booking.inert = false;
    busy = false;
  }
}

function panel(title, message, style = '') {
  const result = node(booking, 'section', '', ('panel ' + style).trim());
  node(result, 'h2', title);
  if (message) node(result, 'p', message, 'muted');
  return result;
}

function showUnavailable(message, retry = false) {
  byId('event').replaceChildren();
  booking.replaceChildren();
  const item = panel('Sign-up unavailable', message);
  if (retry) button(item, 'Try again', load, 'secondary');
}

function render() {
  const header = byId('event');
  header.replaceChildren();
  eventBanner(header, sheet);
  document.title = sheet.title + ' | Sign-Up Studio';
  booking.replaceChildren();

  if (sheet.reservation && screen === 'slots') {
    receipt();
  } else if (screen === 'review') {
    review();
  } else {
    choices();
  }
}

function choices() {
  const open = sheet.status === 'open';
  const title = screen === 'edit' ? 'Change your slots' : 'Choose your slots';
  const intro = open ? 'Select one or more options, then review your choices.' : 'This event is closed to new sign-ups.';
  const section = panel(title, intro);
  const controls = node(section, 'div', '', 'row');
  button(controls, 'Refresh availability', () => run(async () => {
    sheet = await api('view');
    const held = new Set(sheet.reservation?.slots || []);
    selected = new Set(sheet.slots.filter(s => selected.has(s.id) && (s.remaining || held.has(s.id))).map(s => s.id));
    if (sheet.status !== 'open') screen = 'slots';
    render();
    return 'Availability refreshed.';
  }), 'quiet');
  const list = node(section, 'div');
  slotList(list, sheet.slots, {
    selected, unavailable: !open,
    onSelect(id, checked) {
      if (checked) selected.add(id);
      else selected.delete(id);
    },
  });
  const actions = node(section, 'div', '', 'row');
  const next = button(actions, 'Review selection', () => {
    if (!selected.size) { notice('Choose at least one slot to continue.', true); return; }
    screen = 'review';
    render();
    notice();
    booking.querySelector('input')?.focus();
  });
  next.disabled = !open || !sheet.slots.some(slot => slot.remaining || selected.has(slot.id));
  if (screen === 'edit') button(actions, 'Back to my reservation', () => {
    screen = 'slots';
    render();
    notice();
  }, 'secondary');
}

function review() {
  const changing = sheet.reservation && !sheet.reservation.cancelled;
  const askForEmail = sheet.collectEmail && !sheet.reservation?.hasEmail;
  const section = panel(changing ? 'Review your changes' : 'Review your sign-up',
    askForEmail ? 'The organizer can use your name and email to contact you about this event.' :
      'Your reservation is shared with the organizer.');
  const list = node(section, 'ul');
  for (const slot of sheet.slots.filter(slot => selected.has(slot.id))) {
    node(list, 'li', slot.label + ' · ' + slotTime(slot));
  }
  const form = node(section, 'form');
  const name = changing ? null : field(form, 'Your name', nameDraft, { maxLength: 80, required: true, placeholder: 'First and last name' });
  if (name) name.autocomplete = 'name';
  const email = askForEmail ? field(form, 'Your email', emailDraft, { type: 'email', maxLength: 254, required: true }) : null;
  if (email) {
    email.autocomplete = 'email';
    if (sheet.emailReady) node(form, 'p', 'Use an inbox you can access for confirmation and change notices.', 'muted');
  }
  const actions = node(form, 'div', '', 'row');
  node(actions, 'button', changing ? 'Save changes' : 'Confirm sign-up');
  button(actions, 'Back to slots', () => {
    if (name) nameDraft = name.value;
    if (email) emailDraft = email.value;
    screen = changing ? 'edit' : 'slots';
    render();
    notice();
  }, 'secondary');
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (name) nameDraft = name.value.trim();
    if (email) emailDraft = email.value.trim();
    if (!changing && !nameDraft) { notice('Enter your name to continue.', true); return; }
    if (!proof) proof = secretKey();
    remember();
    run(async () => {
      sheet = await api(changing ? 'change' : 'reserve', { name: nameDraft, email: emailDraft, slots: [...selected] });
      screen = 'slots';
      selected.clear();
      render();
      return withEmailStatus(sheet.reservation?.cancelled ? 'This reservation was already canceled.' :
        changing ? 'Your reservation was updated.' : 'Your reservation is confirmed.');
    }, true);
  });
}

function withEmailStatus(message) {
  if (sheet.emailStatus === 'accepted') return message + ' Check your inbox for the email.';
  if (sheet.emailStatus === 'pending') return message + ' The email notice is pending.';
  return message;
}

function receipt() {
  const reservation = sheet.reservation;
  if (reservation.cancelled) {
    const section = panel('Reservation canceled', 'The organizer can offer those spots to other participants.');
    if (sheet.status === 'open') button(section, 'Start a new sign-up', () => {
      proof = '';
      nameDraft = '';
      emailDraft = '';
      remember();
      sheet.reservation = null;
      selected.clear();
      render();
      notice();
    });
    return;
  }
  const section = panel('Your reservation', 'You’re signed up as ' + reservation.name + '.', 'confirmation');
  const list = node(section, 'ul');
  for (const slot of sheet.slots.filter(slot => reservation.slots.includes(slot.id))) {
    node(list, 'li', slot.label + ' · ' + slotTime(slot));
  }
  node(section, 'p', 'Save the private link to manage this reservation later or on another device.', 'muted');
  copyField(section, 'Private reservation link', inviteUrl(invite, proof), 'Copy private link', 'Private reservation link copied.');
  const actions = node(section, 'div', '', 'row actions');
  if (sheet.status === 'open') button(actions, 'Change slots', () => {
    selected = new Set(reservation.slots);
    screen = 'edit';
    render();
    notice();
  }, 'secondary');
  else node(section, 'p', 'Registration is closed. You can still cancel this reservation.', 'muted');
  button(actions, 'Cancel reservation', () => {
    if (!window.confirm('Cancel this reservation and release all of its spots?')) return;
    run(async () => {
      sheet = await api('cancel');
      render();
      return withEmailStatus('Your reservation was canceled.');
    });
  }, 'secondary');
}

function load() {
  if (!/^[a-f0-9]{96}$/.test(invite)) {
    showUnavailable('Open the invitation link your organizer sent you.');
    notice();
    return;
  }
  run(async () => {
    try {
      sheet = await api('view');
      if (fragment && !sheet.reservation) {
        proof = '';
        remember();
        render();
        return 'We couldn’t find a reservation for that private link. You can view the event below.';
      }
      render();
    } catch (error) {
      showUnavailable(
        error.status === 404 ? 'This sheet may be unpublished or archived. Contact your organizer for an updated link.' : 'The sign-up could not be loaded right now.',
        error.status !== 404,
      );
      throw error;
    }
  });
}

if (fragment && proof) {
  remember();
  history.replaceState(null, '', inviteUrl(invite));
}
load();
