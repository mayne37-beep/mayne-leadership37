export const themes = {
  general: { label: 'General', icon: '✓' },
  coaching: { label: 'Coaching', icon: '💬' },
  baking: { label: 'Baking', icon: '🧁' },
  volunteer: { label: 'Volunteering', icon: '🤝' },
  sports: { label: 'Sports', icon: '🏆' },
  celebration: { label: 'Celebration', icon: '🎉' },
};

export const statuses = { draft: 'Draft', open: 'Open', closed: 'Closed', archived: 'Archived' };

export const byId = id => document.getElementById(id);
export const uid = () => crypto.randomUUID().replaceAll('-', '');
export const secretKey = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), value => value.toString(16).padStart(2, '0')).join('');

export function node(parent, tag, text = '', className = '') {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  parent.append(element);
  return element;
}

export function button(parent, label, action, style = '') {
  const control = node(parent, 'button', label, style);
  control.type = 'button';
  if (action) control.addEventListener('click', action);
  return control;
}

export function field(parent, label, value = '', { type = 'text', maxLength, required, placeholder } = {}) {
  const wrapper = node(parent, 'label', label);
  const input = node(wrapper, type === 'textarea' ? 'textarea' : 'input');
  if (type !== 'textarea') input.type = type;
  input.value = value;
  if (maxLength) input.maxLength = maxLength;
  if (required) input.required = true;
  if (placeholder) input.placeholder = placeholder;
  return input;
}

export function notice(message = '', error = false) {
  const area = byId('notice');
  area.textContent = message;
  area.dataset.error = String(error);
}

export async function request(action, payload = {}, key = '') {
  const response = await fetch('/api/signup-studio', {
    method: 'POST',
    credentials: key ? 'same-origin' : 'omit',
    headers: { 'Content-Type': 'application/json', ...(key && { Authorization: 'Bearer ' + key }) },
    body: JSON.stringify({ action, payload }),
  });
  const result = await response.json().catch(() => ({}));
  if (response.ok && Object.keys(result).length) return result;
  throw Object.assign(new Error(result.error || 'The sign-up request failed.'), { status: response.status });
}

export function statusPill(parent, status) {
  const pill = node(parent, 'span', statuses[status] || status, 'pill');
  pill.dataset.status = status;
  return pill;
}

const dateFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
});

function timeLabel(value) {
  const [hours, minutes] = value.split(':').map(Number);
  return (hours % 12 || 12) + ':' + String(minutes).padStart(2, '0') + (hours < 12 ? ' AM' : ' PM');
}

export function slotTime(slot) {
  if (!slot.date) return 'No set date';
  const date = dateFormat.format(new Date(slot.date + 'T00:00:00Z'));
  if (!slot.start) return date;
  const time = timeLabel(slot.start) + (slot.end ? ' – ' + timeLabel(slot.end) : '');
  return date + ' · ' + time;
}

export function inviteUrl(invite, proof = '') {
  const url = new URL('/signup.html', location.origin);
  url.searchParams.set('id', invite);
  if (proof) url.hash = 'reservation=' + proof;
  return url.href;
}

export function copyField(parent, label, value, buttonText, message) {
  const input = field(parent, label, value);
  input.readOnly = true;
  input.classList.add('link-field');
  input.addEventListener('focus', () => input.select());
  button(parent, buttonText, async () => {
    try {
      await navigator.clipboard.writeText(value);
      notice(message);
    } catch {
      input.focus();
      input.select();
      notice('Copy the selected text to share or save it.');
    }
  }, 'secondary');
}

export function eventBanner(parent, details, compact = false) {
  const theme = Object.hasOwn(themes, details.theme) ? details.theme : 'general';
  const banner = node(parent, 'section', '', 'hero' + (compact ? ' theme-preview' : ''));
  banner.dataset.theme = theme;
  node(banner, 'span', themes[theme].icon, 'hero-icon').setAttribute('aria-hidden', 'true');
  node(banner, 'p', details.bannerLabel || (theme === 'general' ? 'Event sign-up' : themes[theme].label + ' sign-up'), 'eyebrow');
  if (compact) return;
  node(banner, 'h1', details.title || 'Untitled sign-up');
  if (details.description) node(banner, 'p', details.description, 'preserve');
  if (details.location || details.zone) {
    const meta = node(banner, 'div', '', 'row');
    for (const text of [details.location, details.zone].filter(Boolean)) node(meta, 'span', text, 'pill');
  }
}

export function slotList(parent, slots, { unavailable = false, selected = new Set(), onSelect } = {}) {
  const list = node(parent, 'ul', '', 'slot-list');
  const ordered = [...slots].sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || a.start.localeCompare(b.start));
  for (const slot of ordered) {
    const label = node(node(list, 'li'), onSelect ? 'label' : 'div', '', 'guest-slot');
    const remaining = slot.remaining ?? slot.capacity;
    const checked = selected.has(slot.id);
    if (onSelect) {
      const check = node(label, 'input');
      check.type = 'checkbox';
      check.checked = checked;
      check.disabled = unavailable || (!remaining && !checked);
      check.addEventListener('change', () => onSelect(slot.id, check.checked));
    }
    const copy = node(label, 'span', '', 'slot-copy');
    node(copy, 'strong', slot.label || 'Untitled slot');
    node(copy, 'small', slotTime(slot));
    if (slot.detail) node(copy, 'small', slot.detail);
    node(label, 'span', remaining ? `${remaining} open` : 'Full', 'pill slot-count');
  }
}
