import {
  byId, button, copyField, eventBanner, field, inviteUrl, node, notice, request, secretKey,
  slotList, slotTime, statusPill, statuses, themes, uid,
} from './shared.js';

const WORKSPACE_KEY = 'signup-studio-organizer-v1';
const LEGACY_KEY = 'mayne-signups-standalone-v1';
const VALID_KEY = /^[a-f0-9]{64}$/;

function load(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function remember() {
  try { localStorage.setItem(WORKSPACE_KEY, workspaceKey); } catch {
    persistent = false;
  }
}

function blankSlot() {
  return { id: uid(), label: '', date: '', start: '', end: '', capacity: 1, detail: '' };
}

function blankSheet() {
  return {
    id: uid(), revision: 0, status: 'draft', reservations: [],
    details: { title: '', description: '', location: '', zone: '', bannerLabel: '', theme: 'general', slots: [] },
  };
}

const previousKey = load(WORKSPACE_KEY);
let workspaceKey = VALID_KEY.test(previousKey || '') ? previousKey : secretKey();
let sheet = blankSheet();
let sheets = [];
let dirty = false;
let busy = false;
let listError = false;
let persistent = true;

const workspace = byId('workspace');
const editor = byId('editor');
const rail = workspace.querySelector('.rail');

function api(action, payload) {
  return request(action, payload, workspaceKey);
}

async function run(task) {
  if (busy) return;
  busy = true;
  editor.inert = true;
  rail.inert = true;
  notice('Working…');
  try {
    notice(await task() || '');
  } catch (error) {
    notice(error.message || 'Try again in a moment.', true);
  } finally {
    editor.inert = false;
    rail.inert = false;
    busy = false;
  }
}

function mayLeave() {
  return !dirty || window.confirm('Leave this sheet and discard your unsaved changes?');
}

function requireSaved() {
  if (!dirty) return true;
  notice('Save or discard your edits before changing the roster or registration status.', true);
  return false;
}

async function loadSheets() {
  try {
    ({ sheets } = await api('list', {}));
    listError = false;
  } catch (error) {
    listError = true;
    throw error;
  } finally {
    renderRail();
  }
}

function openSheet(next, focus = false) {
  sheet = next;
  dirty = false;
  renderRail();
  renderEditor();
  if (focus) requestAnimationFrame(() => byId('title').focus());
}

function updated(next) {
  const { id, title, status, slots, bookings, updated } = next;
  sheets = [{ id, title, status, slots, bookings, updated }, ...sheets.filter(item => item.id !== id)];
  openSheet(next);
}

function renderRail() {
  const container = byId('sheets');
  container.replaceChildren();
  if (listError) {
    node(container, 'p', 'Saved sheets couldn’t be loaded.', 'muted');
    button(container, 'Retry', () => run(loadSheets), 'quiet');
  } else if (!sheets.length) {
    node(container, 'p', 'Saved drafts and published sheets will appear here.', 'panel muted');
  }
  if (sheets.length) {
    const list = node(container, 'ul', '', 'sheet-list');
    for (const item of sheets) {
      const control = button(node(list, 'li'), '', () => {
        if (!mayLeave()) return;
        run(async () => openSheet(await api('get', { id: item.id }), true));
      }, 'secondary');
      if (item.id === sheet.id) control.setAttribute('aria-current', 'true');
      node(control, 'strong', item.title);
      node(control, 'span', `${statuses[item.status]} · ${item.slots} slots · ${item.bookings} booked`, 'meta');
    }
  }
}

function renderWorkspaceTools() {
  const target = byId('workspace-tools');
  target.replaceChildren();
  const keys = node(target, 'details', '', 'panel');
  node(keys, 'summary', 'Workspace access');
  node(keys, 'p', persistent ?
    'Save your private key to manage these sheets from another browser after entering the site PIN.' :
    'This browser couldn’t save your workspace key. Copy it before closing the page.', 'muted');
  if (!persistent) keys.open = true;
  button(keys, 'Show my workspace key', event => {
    const row = node(keys, 'div');
    copyField(row, 'Private workspace key', workspaceKey, 'Copy private key', 'Workspace key copied. Keep it private.');
    event.currentTarget.remove();
  }, 'quiet');
  const other = field(keys, 'Open another workspace', '', { type: 'password', maxLength: 64 });
  button(keys, 'Open workspace', () => {
    const key = other.value.trim();
    if (!VALID_KEY.test(key)) { notice('Enter a valid workspace key.', true); return; }
    if (!mayLeave()) return;
    run(async () => {
      const data = await request('list', {}, key);
      if (!data.sheets.length && key !== workspaceKey) return 'No saved sheets were found for that key.';
      workspaceKey = key;
      sheets = data.sheets;
      listError = false;
      remember();
      openSheet(blankSheet(), true);
      renderWorkspaceTools();
      return 'Workspace opened.';
    });
  }, 'quiet');
  let preview;
  try { preview = JSON.parse(load(LEGACY_KEY)); } catch { /* No preview data. */ }
  const legacy = Object.values(preview?.sheets || (preview ? { previous: preview } : {}))
    .filter(item => item && typeof item.title === 'string' && Array.isArray(item.slots));
  if (legacy.length) {
    const importer = node(target, 'details', '', 'panel');
    node(importer, 'summary', 'Import a preview sheet');
    node(importer, 'p', 'Copy the event setup into a new draft. Preview bookings remain in your standalone file.', 'muted');
    const choice = node(node(importer, 'label', 'Preview sheet'), 'select');
    legacy.forEach((item, index) => { node(choice, 'option', item.title).value = String(index); });
    button(importer, 'Copy into a draft', () => {
      if (!mayLeave()) return;
      const old = legacy[Number(choice.value)];
      const next = blankSheet();
      const keys = Object.keys(next.details).filter(key => key !== 'slots');
      for (const key of keys) if (typeof old[key] === 'string') next.details[key] = old[key];
      next.details.slots = old.slots.map(slot => ({ ...blankSlot(), ...slot, id: uid(), remaining: slot.capacity }));
      openSheet(next, true);
      dirty = true;
      notice('Preview setup copied. Save the draft to keep it.');
    }, 'quiet');
  }
}

function panel(parent, title, description, className = '') {
  const section = node(parent, 'section', '', ('panel ' + className).trim());
  node(section, 'h2', title);
  if (description) node(section, 'p', description, 'muted');
  return section;
}

function stateAction(action, message) {
  if (!requireSaved()) return;
  run(async () => {
    updated(await api(action, { id: sheet.id, revision: sheet.revision }));
    return message;
  });
}

function renderShare(parent) {
  if (!sheet.invite) return;
  const share = panel(parent, 'Participant link',
    'Anyone with this link can view the sheet. They can reserve a spot when registration is open.', 'share');
  const url = inviteUrl(sheet.invite);
  copyField(share, 'Share this link', url, 'Copy participant link', 'Participant link copied.');
  const actions = node(share, 'div', '', 'row actions');
  const open = node(actions, 'a', 'Open participant page ↗', 'button-link secondary');
  open.href = url;
  open.target = '_blank';
  open.rel = 'noopener noreferrer';
  if (sheet.status === 'open') {
    button(actions, 'Close registration', () => stateAction('close', 'Registration is closed. The participant link still shows the event.'), 'secondary');
  } else {
    button(actions, 'Reopen registration', () => stateAction('publish', 'Registration is open.'));
  }
}

function editSlot(container, entries, slot, empty) {
  const group = node(container, 'fieldset', '', 'slot-editor');
  const legend = node(group, 'legend', slot.label || 'New slot');
  const label = field(group, 'Slot name', slot.label, { required: true, maxLength: 120, placeholder: 'e.g. Check-in volunteer' });
  label.addEventListener('input', () => { legend.textContent = label.value.trim() || 'New slot'; });
  const row = node(group, 'div', '', 'grid');
  const date = field(row, 'Date', slot.date, { type: 'date' });
  const start = field(row, 'Start time', slot.start, { type: 'time' });
  const end = field(row, 'End time', slot.end, { type: 'time' });
  const capacity = field(row, 'Capacity', slot.capacity, { type: 'number', required: true });
  const booked = slot.capacity - (slot.remaining ?? slot.capacity);
  capacity.min = String(Math.max(1, booked));
  capacity.max = '200';
  const detail = field(group, 'Slot instructions', slot.detail, { maxLength: 400 });
  if (booked) node(group, 'p', `${booked} booked. Move those reservations before removing this slot.`, 'meta');
  const remove = button(group, 'Remove slot', () => {
    entries.delete(slot.id);
    group.remove();
    empty.hidden = entries.size > 0;
    dirty = true;
  }, 'quiet');
  remove.disabled = booked > 0;
  entries.set(slot.id, () => ({
    id: slot.id, label: label.value.trim(), date: date.value, start: start.value, end: end.value,
    capacity: capacity.valueAsNumber, detail: detail.value.trim(),
  }));
  return label;
}

function bulkSlots(parent, add, size) {
  const tools = node(parent, 'details', '', 'bulk');
  node(tools, 'summary', 'Generate a block of time slots');
  const grid = node(tools, 'div', '', 'grid');
  const label = field(grid, 'Slot name', '', { maxLength: 120, placeholder: 'e.g. Appointment' });
  const date = field(grid, 'Date', '', { type: 'date' });
  const start = field(grid, 'From', '09:00', { type: 'time' });
  const end = field(grid, 'Until', '12:00', { type: 'time' });
  const duration = field(grid, 'Minutes per slot', '30', { type: 'number' });
  const capacity = field(grid, 'Spots per slot', '1', { type: 'number' });
  button(tools, 'Generate slots', () => {
    const minutes = value => {
      const [hours, mins] = value.split(':').map(Number);
      return hours * 60 + mins;
    };
    const clock = value => String(Math.floor(value / 60)).padStart(2, '0') + ':' + String(value % 60).padStart(2, '0');
    const from = minutes(start.value);
    const step = duration.valueAsNumber;
    const count = Math.floor((minutes(end.value) - from) / step);
    const limit = capacity.valueAsNumber;
    if (!label.value.trim() || !date.value || !Number.isInteger(step) || step < 1 ||
      !Number.isInteger(count) || count < 1 || size() + count > 100 || !Number.isInteger(limit) || limit < 1 || limit > 200) {
      notice('Enter a name, date and time range. Use a capacity of 1–200 and up to 100 slots per sheet.', true);
      return;
    }
    for (let i = 0; i < count; i += 1) {
      add({
        ...blankSlot(), label: label.value.trim(), date: date.value,
        start: clock(from + i * step), end: clock(from + (i + 1) * step), capacity: limit,
      });
    }
    notice(`${count} slots added. Save the sheet to keep them.`);
  }, 'secondary');
}

function preview(details) {
  const dialog = byId('preview-dialog');
  const content = byId('preview-content');
  content.replaceChildren();
  eventBanner(content, details);
  const slots = panel(content, 'Choose a slot', 'Preview only. Save and publish to accept reservations.');
  const validSlots = details.slots.filter(slot => slot.date && Number.isFinite(Date.parse(slot.date)) || !slot.date);
  if (validSlots.length) slotList(slots, validSlots);
  else node(slots, 'p', 'Slots will appear here when you add them.');
  dialog.showModal();
}

function renderEditor() {
  const heading = byId('title');
  heading.textContent = sheet.details.title || 'Create a sign-up';
  heading.tabIndex = -1;
  byId('intro').textContent = sheet.revision ?
    'Edit the event, manage reservations, or share your participant link.' :
    'Start with a blank sheet. Add event details and slots, then publish when you’re ready.';
  editor.replaceChildren();
  if (sheet.revision) {
    const strip = node(editor, 'div', '', 'row actions');
    statusPill(strip, sheet.status);
    button(strip, 'Duplicate as draft', () => {
      if (!mayLeave()) return;
      const copy = blankSheet();
      copy.details = { ...structuredClone(sheet.details), title: sheet.title.slice(0, 113) + ' (copy)' };
      copy.details.slots = copy.details.slots.map(slot => ({ ...slot, id: uid(), remaining: slot.capacity }));
      openSheet(copy, true);
      dirty = true;
      notice('Copy created. Save it as a new draft.');
    }, 'quiet');
    button(strip, 'Reload sheet', () => {
      if (mayLeave()) run(async () => updated(await api('get', { id: sheet.id })));
    }, 'quiet');
    if (sheet.status === 'archived') {
      button(strip, 'Restore sheet', () => stateAction('restore', 'Sheet restored.'), 'secondary');
      panel(editor, 'This sheet is archived', 'Restore it to edit the details or reopen registration.');
      renderRoster(editor);
      return;
    }
    button(strip, 'Archive sheet', () => {
      if (!requireSaved()) return;
      if (window.confirm('Archive this sheet and take its participant link offline?')) {
        stateAction('archive', 'Sheet archived. You can restore it later.');
      }
    }, 'quiet');
  }

  renderShare(editor);
  const form = node(editor, 'form');
  const info = panel(form, 'Event details', 'Tell participants what they’re signing up for.');
  const original = sheet.details;
  const title = field(info, 'Event title', original.title, { required: true, maxLength: 120, placeholder: 'e.g. Saturday volunteer shifts' });
  const description = field(info, 'Instructions', original.description, { type: 'textarea', maxLength: 2000 });
  const place = node(info, 'div', '', 'grid');
  const location = field(place, 'Location or meeting details', original.location, { maxLength: 160 });
  const zone = field(place, 'Time zone label', original.zone, { maxLength: 60, placeholder: 'e.g. Central Time' });
  const appearance = node(info, 'details', '', 'bulk');
  node(appearance, 'summary', 'Banner appearance');
  const appearanceGrid = node(appearance, 'div', '', 'grid');
  const theme = node(node(appearanceGrid, 'label', 'Event theme'), 'select');
  for (const [value, option] of Object.entries(themes)) node(theme, 'option', option.label).value = value;
  theme.value = Object.hasOwn(themes, original.theme) ? original.theme : 'general';
  const bannerLabel = field(appearanceGrid, 'Custom banner label', original.bannerLabel, { maxLength: 60 });
  const swatch = node(appearance, 'div');
  function showTheme() {
    swatch.replaceChildren();
    eventBanner(swatch, { theme: theme.value, bannerLabel: bannerLabel.value.trim() }, true);
  }
  theme.addEventListener('change', showTheme);
  bannerLabel.addEventListener('input', showTheme);
  showTheme();

  const slots = panel(form, 'Sign-up slots', 'Add sessions, volunteer roles, items, or appointments. Dates and times are optional.');
  const entries = new Map();
  const container = node(slots, 'div');
  const empty = node(container, 'p', 'This sheet has no slots yet.', 'blank-note');
  empty.hidden = original.slots.length > 0;
  const actionRow = node(slots, 'div', '', 'row');
  function add(slot) {
    empty.hidden = true;
    return editSlot(container, entries, slot, empty);
  }
  original.slots.forEach(add);
  button(actionRow, '+ Add slot', () => {
    if (entries.size >= 100) { notice('This sheet already has 100 slots.', true); return; }
    add(blankSlot()).focus();
    dirty = true;
  }, 'secondary');
  bulkSlots(slots, slot => { add(slot); dirty = true; }, () => entries.size);

  const footer = node(form, 'div', '', 'panel form-footer');
  const left = node(footer, 'div', '', 'row');
  const primary = sheet.invite ? 'Save changes' : 'Save draft';
  const save = node(left, 'button', primary, sheet.invite ? '' : 'secondary');
  save.value = 'save';
  if (!sheet.invite) node(left, 'button', 'Publish & get link').value = 'publish';
  function details() {
    return {
      title: title.value.trim(), description: description.value.trim(), location: location.value.trim(),
      zone: zone.value.trim(), theme: theme.value, bannerLabel: bannerLabel.value.trim(),
      slots: [...entries.values()].map(read => read()),
    };
  }
  button(footer, 'Preview as participant', () => preview(details()), 'secondary');
  form.addEventListener('input', event => {
    if (!event.target.closest('.bulk') || event.target.closest('.bulk') === appearance) dirty = true;
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const publish = event.submitter?.value === 'publish';
    const input = details();
    if (publish && !input.slots.length) { notice('Add at least one slot before publishing.', true); return; }
    run(async () => {
      const saved = await api('save', { id: sheet.id, revision: sheet.revision, details: input });
      updated(saved);
      if (publish) {
        updated(await api('publish', { id: sheet.id, revision: sheet.revision }));
        requestAnimationFrame(() => editor.querySelector('.share input')?.focus());
        return 'Published. Copy the participant link to share your sign-up.';
      }
      return sheet.invite ? 'Changes saved.' : 'Draft saved.';
    });
  });

  if (sheet.revision) renderRoster(editor);
}

function renderRoster(parent) {
  const roster = panel(parent, 'Roster', 'Participant names are visible here in the organizer workspace.');
  const lookup = new Map(sheet.details.slots.map(slot => [slot.id, slot]));
  if (lookup.size) {
    const list = node(roster, 'ul');
    for (const slot of lookup.values()) node(list, 'li', `${slot.label} · ${slotTime(slot)} · ${slot.capacity - slot.remaining} of ${slot.capacity} booked`);
  }
  function choice(parent, label, except = []) {
    const select = node(node(parent, 'label', label), 'select');
    node(select, 'option', 'Select an open slot').value = '';
    for (const slot of lookup.values()) {
      if (!slot.remaining || except.includes(slot.id)) continue;
      node(select, 'option', slot.label + ' · ' + slotTime(slot)).value = slot.id;
    }
    return select;
  }
  function rosterAction(action, payload, message) {
    if (!requireSaved()) return;
    run(async () => {
      updated(await api(action, { ...payload, id: sheet.id }));
      return message;
    });
  }
  if (sheet.status !== 'archived' && [...lookup.values()].some(slot => slot.remaining)) {
    const add = node(roster, 'details', '', 'bulk');
    node(add, 'summary', 'Add a participant manually');
    const row = node(add, 'div', '', 'grid');
    const name = field(row, 'Participant name', '', { maxLength: 80 });
    const slot = choice(row, 'Slot');
    const reservation = uid();
    button(add, 'Add reservation', () => {
      if (!name.value.trim() || !slot.value) { notice('Enter a name and choose an open slot.', true); return; }
      rosterAction('add', { name: name.value.trim(), slot: slot.value, reservation }, 'Reservation added.');
    }, 'secondary');
  }
  if (!sheet.reservations.length) node(roster, 'p', 'No reservations yet.', 'muted');
  for (const reservation of sheet.reservations) {
    const item = node(roster, 'fieldset', '', 'roster-row');
    node(item, 'legend', reservation.name);
    const list = node(item, 'ul');
    for (const id of reservation.slots) node(list, 'li', lookup.get(id).label + ' · ' + slotTime(lookup.get(id)));
    if (sheet.status === 'archived') continue;
    if ([...lookup.values()].some(slot => slot.remaining && !reservation.slots.includes(slot.id))) {
      const options = node(item, 'div', '', 'grid');
      const from = node(node(options, 'label', 'Move from'), 'select');
      for (const id of reservation.slots) node(from, 'option', lookup.get(id).label + ' · ' + slotTime(lookup.get(id))).value = id;
      const to = choice(options, 'Move to', reservation.slots);
      button(item, 'Move reservation', () => {
        if (!to.value) { notice('Choose an open destination slot.', true); return; }
        rosterAction('move', { reservation: reservation.id, from: from.value, to: to.value }, 'Reservation moved.');
      }, 'quiet');
    }
    button(item, 'Remove reservation', () => {
      if (!requireSaved()) return;
      if (window.confirm('Remove this reservation and release its spots?')) {
        rosterAction('remove', { reservation: reservation.id }, 'Reservation removed.');
      }
    }, 'quiet');
  }
  button(roster, 'Export roster CSV', () => {
    const csv = value => '"' + String(value).replace(/^[\s\uFEFF]*[=+@-]/, "'$&").replaceAll('"', '""') + '"';
    const rows = [['Participant', 'Slot', 'Date', 'Start', 'End']];
    for (const reservation of sheet.reservations) {
      for (const id of reservation.slots) {
        const slot = lookup.get(id);
        rows.push([reservation.name, slot.label, slot.date, slot.start, slot.end]);
      }
    }
    const url = URL.createObjectURL(new Blob([rows.map(row => row.map(csv).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'signup-studio-roster.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'secondary');
}

byId('new-sheet').addEventListener('click', () => {
  if (mayLeave()) { openSheet(blankSheet(), true); notice(); }
});
window.addEventListener('beforeunload', event => {
  if (dirty) { event.preventDefault(); event.returnValue = ''; }
});
remember();
renderEditor();
renderWorkspaceTools();
run(loadSheets);
