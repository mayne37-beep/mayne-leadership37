const content = document.querySelector('#content');
const status = document.querySelector('#status');
const params = new URLSearchParams(location.search);
const fragment = new URLSearchParams(location.hash.slice(1));
const id = params.get('id');

function element(parent, tag, text = '') {
  const node = document.createElement(tag);
  node.textContent = text;
  parent.append(node);
  return node;
}

async function request(action, payload = {}) {
  const response = await fetch('/api/event-signups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The request failed.');
  return result;
}

async function run(task, button) {
  if (button) button.disabled = true;
  status.textContent = 'Working…';
  try {
    status.textContent = await task() || '';
  } catch (error) {
    status.textContent = error.message || 'Try again in a moment.';
  } finally {
    if (button) button.disabled = false;
  }
}

function button(parent, label, task) {
  const control = element(parent, 'button', label);
  control.type = 'button';
  control.addEventListener('click', () => run(task, control));
  return control;
}

function field(parent, label, tag = 'input') {
  return element(element(parent, 'label', label), tag);
}

function link(parent, label, href) {
  element(parent, 'a', label).href = href;
}

function invitation(boardId) {
  return new URL('/signup.html?id=' + boardId, location.origin).href;
}

function organizer() {
  element(content, 'h2', 'Create a sign-up');
  const form = element(content, 'form');
  const title = field(form, 'Event title');
  title.required = true;
  title.maxLength = 120;
  const details = field(form, 'Instructions or location (optional)', 'textarea');
  details.maxLength = 1000;
  const slots = element(form, 'div');
  const add = () => {
    if (slots.children.length >= 30) return 'You can add up to 30 slots.';
    const row = element(slots, 'fieldset');
    element(row, 'legend', 'Sign-up slot');
    const label = field(row, 'Slot label (include date, time and time zone if applicable)');
    label.required = true;
    label.maxLength = 120;
    const capacity = field(row, 'Number of spots');
    Object.assign(capacity, { type: 'number', min: '1', max: '100', value: '1', required: true });
    button(row, 'Remove slot', () => {
      if (slots.children.length === 1) return 'Keep at least one slot.';
      row.remove();
    });
  };
  add();
  button(form, 'Add slot', add);
  const submit = element(form, 'button', 'Create sign-up');
  const boards = element(content, 'div');
  async function showBoards() {
    const results = await request('list');
    boards.replaceChildren();
    element(boards, 'h2', 'Your sign-ups');
    if (!results.length) element(boards, 'p', 'No sign-ups yet.');
    for (const board of results) {
      const panel = element(boards, 'section');
      element(panel, 'h3', board.title + (board.closed ? ' (closed)' : ''));
      const share = field(panel, 'Share this invitation link');
      Object.assign(share, { value: invitation(board.id), readOnly: true });
      button(panel, 'Copy invitation', async () => {
        await navigator.clipboard.writeText(share.value);
        return 'Invitation copied.';
      });
      const roster = element(panel, 'div');
      const showRoster = data => {
        roster.replaceChildren();
        data.slots.forEach((slot, index) => {
          element(roster, 'h4', slot.label + ' · ' + slot.remaining + ' open');
          const names = data.roster.filter(person => person.slot === index);
          if (!names.length) element(roster, 'p', 'No reservations.');
          else {
            const list = element(roster, 'ul');
            names.forEach(person => element(list, 'li', person.name));
          }
        });
      };
      button(panel, 'View roster', async () => showRoster(await request('roster', { id: board.id })));
      if (!board.closed) button(panel, 'Close sign-up', async () => {
        if (!confirm('Close this sign-up to new reservations?')) return;
        await request('close', { id: board.id });
        await showBoards();
        return 'Sign-up closed.';
      });
    }
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    run(async () => {
      const values = [...slots.children].map(row => {
        const [label, capacity] = row.querySelectorAll('input');
        return { label: label.value, capacity: capacity.valueAsNumber };
      });
      const board = await request('create', { title: title.value, details: details.value, slots: values });
      const created = element(content, 'p', 'New invitation · ');
      link(created, invitation(board.id), invitation(board.id));
      form.reset();
      await showBoards();
      return 'Sign-up created.';
    }, submit);
  });
  run(showBoards);
}

function participant(board) {
  document.querySelector('#title').textContent = board.title;
  document.querySelector('#details').textContent = board.details;
  content.replaceChildren();
  const cancelSlot = fragment.get('slot');
  const cancelProof = fragment.get('proof');
  if (cancelSlot !== null && cancelProof) {
    button(content, 'Cancel my reservation', async () => {
      if (!confirm('Release your spot?')) return;
      const result = await request('cancel', { id, slot: Number(cancelSlot), proof: cancelProof });
      fragment.delete('slot');
      fragment.delete('proof');
      history.replaceState(null, '', invitation(id));
      participant(result);
      return 'Reservation canceled.';
    });
  }
  if (board.closed) element(content, 'p', 'This sign-up is closed to new reservations.');
  board.slots.forEach((slot, index) => {
    const panel = element(content, 'section');
    element(panel, 'h2', slot.label);
    element(panel, 'p', slot.remaining + ' of ' + slot.capacity + ' spots open');
    if (board.closed || !slot.remaining) return;
    const form = element(panel, 'form');
    const name = field(form, 'Your name (visible to the organizer)');
    Object.assign(name, { required: true, maxLength: 80, autocomplete: 'name' });
    const submit = element(form, 'button', 'Reserve a spot');
    const proof = crypto.randomUUID();
    form.addEventListener('submit', event => {
      event.preventDefault();
      run(async () => {
        const result = await request('reserve', { id, slot: index, name: name.value, proof });
        participant(result);
        const confirmation = element(content, 'section');
        content.prepend(confirmation);
        element(confirmation, 'h2', 'You’re signed up');
        element(confirmation, 'p', 'Save this private link in case you need to cancel.');
        const manage = invitation(id) + '#' + new URLSearchParams({ slot: index, proof });
        const saved = field(confirmation, 'Your cancellation link');
        Object.assign(saved, { readOnly: true, value: manage });
        link(confirmation, 'Manage this reservation', manage);
        confirmation.querySelector('a').addEventListener('click', event => {
          event.preventDefault();
          fragment.set('slot', index);
          fragment.set('proof', proof);
          history.replaceState(null, '', manage);
          participant(result);
        });
        return 'Spot reserved.';
      }, submit);
    });
  });
}

if (location.pathname.endsWith('/signup.html')) {
  if (id) run(async () => participant(await request('view', { id })));
  else status.textContent = 'Open the invitation link from your event organizer.';
} else {
  document.querySelector('#details').textContent = 'Create time slots, volunteer roles or workshop seats, then share one link.';
  organizer();
}
