const attendeeMedia = ['audio', 'video'];

export const meetingRoles = {
  organizer: { label: 'Organizer', media: true },
  presenter: { label: 'Presenter', media: [...attendeeMedia, 'screenVideo', 'screenAudio'] },
  attendee: { label: 'Attendee', media: attendeeMedia },
  observer: { label: 'Observer', media: false },
};

export const assignableRoles = ['presenter', 'attendee', 'observer'];

export function participantCanSend(person, track) {
  if (!person) return false;
  const media = person.permissions?.canSend;
  if (media == null) return person.owner || attendeeMedia.includes(track);
  return media === true || (media instanceof Set && media.has(track)) ||
    (Array.isArray(media) && media.includes(track));
}

export function participantRole(person) {
  if (person?.owner) return 'organizer';
  if (participantCanSend(person, 'screenVideo')) return 'presenter';
  if (participantCanSend(person, 'audio') || participantCanSend(person, 'video')) return 'attendee';
  return 'observer';
}

export function canParticipate(person) {
  return participantRole(person) !== 'observer';
}

export function changeParticipantRole(call, id, role) {
  const participants = call?.participants();
  const person = participants?.[id];
  if (!participants?.local?.owner || !person || person.local || person.owner || !assignableRoles.includes(role)) {
    throw new Error('Only the organizer can change a guest’s role in this room.');
  }
  const media = meetingRoles[role].media;
  const changes = {
    updatePermissions: { canSend: media ? new Set(media) : false, canAdmin: false },
    ...(role !== 'presenter' && person.screen ? { setScreenShare: false } : {}),
    ...(role === 'observer' ? { setVideo: false, setAudio: false } : {}),
  };
  return new Promise((resolve, reject) => {
    function finish(error) {
      clearTimeout(timeout);
      call.off('participant-updated', updated);
      call.off('participant-left', left);
      if (error) reject(error);
      else resolve();
    }
    function updated({ participant }) {
      if (participant.session_id === id && participantRole(participant) === role) finish();
    }
    function left({ participant }) {
      if (participant.session_id === id) finish(new Error('This participant left the room.'));
    }
    const timeout = setTimeout(() => finish(new Error('The role change could not be confirmed. Try again.')), 5000);
    call.on('participant-updated', updated);
    call.on('participant-left', left);
    try { call.updateParticipant(id, changes); }
    catch (error) { finish(error); }
  });
}
