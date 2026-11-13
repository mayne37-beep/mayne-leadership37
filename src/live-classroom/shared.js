export const reactions = [
  ['👍', 'Like'], ['👏', 'Applause'], ['❤️', 'Love'], ['🎉', 'Celebrate'], ['😮', 'Surprised'],
  ['😂', 'Laugh'], ['🤔', 'Thinking'],
];

export const presenterLayouts = [
  { id: 'standard', label: 'Standard', icon: 'present-standard' },
  { id: 'side-by-side', label: 'Side by side', icon: 'present-side' },
  { id: 'picture-in-picture', label: 'Picture in picture', icon: 'present-overlay' },
  { id: 'weather', label: 'Weather view', icon: 'present-weather' },
];

export function presentationOf(participant) {
  const data = participant?.userData?.presentation;
  const layout = presenterLayouts.find(choice => choice.id === data?.layout)?.id ?? 'standard';
  return {
    layout,
    side: data?.side === 'left' ? 'left' : 'right',
    mirror: data?.mirror === true,
    composed: data?.layout === 'studio',
  };
}

export function cleanText(value, limit) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, limit)
    : '';
}

export function activityPath(value, origin) {
  const input = cleanText(value, 600);
  if (!input) return '';
  const directCode = input.replace(/\s/g, '');
  if (/^\d{6,7}$/.test(directCode)) return '/word-cloud-respond.html?code=' + directCode;
  try {
    const url = new URL(input, origin);
    const site = new URL(origin);
    const sameSite = url.origin === site.origin ||
      (url.protocol === 'https:' && site.protocol === 'https:' &&
       ['mayneleadership.com', 'www.mayneleadership.com'].includes(url.hostname) &&
       ['mayneleadership.com', 'www.mayneleadership.com'].includes(site.hostname) &&
       !url.port && !site.port);
    if (!sameSite || url.username || url.password) return '';
    const code = url.searchParams.get('code')?.replace(/\s/g, '');
    if (url.pathname === '/word-cloud-respond.html' && /^\d{6,7}$/.test(code ?? '')) {
      return '/word-cloud-respond.html?code=' + code;
    }
    if (url.pathname === '/collaboration-join.html') {
      const data = new URLSearchParams(url.hash.slice(1));
      const id = data.get('id');
      const token = data.get('token');
      const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
      if (uuid.test(id ?? '') && uuid.test(token ?? '')) {
        return '/collaboration-join.html#' + new URLSearchParams({ id, token });
      }
    }
  } catch {}
  return '';
}

function csvCell(value) {
  const text = String(value ?? '');
  const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(text) ? "'" + text : text;
  return '"' + safe.replaceAll('"', '""') + '"';
}

export function attendanceCsv(records) {
  return [
    ['Name', 'Room', 'Joined (UTC)', 'Left (UTC)', 'Minutes'],
    ...records.map(({ name, room, joined, left }) => [
      name, room, new Date(joined).toISOString(), left ? new Date(left).toISOString() : '',
      ((Math.max(0, (left ?? Date.now()) - joined)) / 60000).toFixed(2),
    ]),
  ].map(row => row.map(csvCell).join(',')).join('\r\n');
}
