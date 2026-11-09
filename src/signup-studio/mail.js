const STUDIO = 'https://www.mayneleadership.com';
export const ORGANIZER_URL = STUDIO + '/signup-studio.html';
export const EMAIL_RETRY_MS = 23 * 60 * 60 * 1000;

export function emailAddress(value) {
  if (typeof value !== 'string' || /[\x00-\x1f\x7f]/.test(value)) return '';
  const address = value.trim();
  if (address.length > 254) return '';
  const [local, domain, extra] = address.split('@');
  if (extra !== undefined || !local || !domain || local.length > 64 ||
      !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local) || local.startsWith('.') ||
      local.endsWith('.') || local.includes('..')) return '';
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(domain)) return '';
  return local + '@' + domain.toLowerCase();
}

export function reservationUrl(invite, proof) {
  return STUDIO + '/signup.html?id=' + invite + '#reservation=' + proof;
}

const singleLine = value => value.replace(/[\x00-\x1f\x7f]/g, ' ').trim();

export function bookingAlert(event) {
  if (!event.contact?.organizerEmail) return null;
  return {
    to: event.contact.organizerEmail,
    subject: 'New sign-up · ' + singleLine(event.details.title),
    text: 'A participant signed up for ' + singleLine(event.details.title) + '.\n\nOpen Sign-Up Studio to view your private roster.\n' + ORGANIZER_URL,
  };
}

const dateFormat = new Intl.DateTimeFormat('en-US', {
  weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
});

function timeLabel(value) {
  const [hours, minutes] = value.split(':').map(Number);
  return (hours % 12 || 12) + ':' + String(minutes).padStart(2, '0') + (hours < 12 ? ' AM' : ' PM');
}

function slotLabel(slot) {
  const date = slot.date ? dateFormat.format(new Date(slot.date + 'T00:00:00Z')) : '';
  const time = slot.start ? timeLabel(slot.start) + (slot.end ? ' to ' + timeLabel(slot.end) : '') : '';
  return [singleLine(slot.label), date, time].filter(Boolean).join(' · ');
}

const reservationCopy = {
  confirmed: ['Sign-up confirmed', 'Your reservation is confirmed.'],
  changed: ['Reservation updated', 'Your reservation has changed. See your current slots below.'],
  event: ['Event details updated', 'The organizer updated details for your event or one of your slots.'],
  canceled: ['Reservation canceled', 'Your reservation was canceled and its spots were released.'],
  archived: ['Sign-up sheet archived', 'The organizer archived the sign-up sheet. Contact the organizer for event details.'],
};

export function reservationNotice(event, reservation, type, url) {
  if (!reservation.email) return null;
  const [heading, intro] = reservationCopy[type];
  const { title, location, zone, meetingUrl, slots } = event.details;
  const lines = [intro, '', singleLine(title)];
  if (type !== 'canceled' && type !== 'archived') {
    if (location) lines.push('Location: ' + singleLine(location));
    if (zone) lines.push('Time zone: ' + singleLine(zone));
    const booked = slots.filter(slot => reservation.slots.includes(slot.id));
    lines.push('', ...booked.slice(0, 12).map(slot => '- ' + slotLabel(slot)));
    if (booked.length > 12) lines.push('See your reservation page for the remaining slots.');
    if (meetingUrl) lines.push('', 'Join the meeting', meetingUrl);
  }
  if (url) lines.push('', 'View your private reservation', url, '', 'Keep this link private.');
  return { to: reservation.email, subject: heading + ' · ' + singleLine(title), text: lines.join('\n'), reservation: reservation.id };
}

export function resendMailer(apiKey, sender, send = fetch) {
  const address = emailAddress(sender);
  if (!apiKey || !address) return null;
  return async (batch, signal) => {
    const response = await send('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
        'Idempotency-Key': 'signup-studio/' + batch.id,
      },
      body: JSON.stringify(batch.messages.map(({ to, subject, text }) => ({
        from: 'Sign-Up Studio <' + address + '>', to: [to], subject, text,
      }))),
      signal,
    });
    if (!response.ok) throw new Error('Email provider rejected the batch.');
    const result = await response.json();
    if (!Array.isArray(result.data) || result.data.length !== batch.messages.length ||
        result.data.some(item => !item?.id)) throw new Error('Email provider did not accept every message.');
  };
}
