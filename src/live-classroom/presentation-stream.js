export function screenTrack(call) {
  const track = call?.participants().local?.tracks?.screenVideo;
  return track?.persistentTrack ?? track?.track;
}

export function publishPresentation(call, stream, signal, quality = 'motion-and-detail-balanced') {
  return new Promise((resolve, reject) => {
    const output = stream.getVideoTracks()[0];
    let pending = true;
    function finish(error) {
      if (!pending) return;
      pending = false;
      clearTimeout(timeout);
      call.off('local-screen-share-started', started);
      call.off('participant-updated', started);
      call.off('local-screen-share-canceled', failed);
      call.off('screen-share-error', failed);
      signal.removeEventListener('abort', aborted);
      if (error) reject(error);
      else resolve();
    }
    function started() { if (screenTrack(call)?.id === output.id) finish(); }
    function failed() { finish(new Error('The presentation could not be shared. Try again.')); }
    function aborted() { finish(signal.reason); }
    const timeout = setTimeout(failed, 10000);
    call.on('local-screen-share-started', started);
    call.on('participant-updated', started);
    call.on('local-screen-share-canceled', failed);
    call.on('screen-share-error', failed);
    signal.addEventListener('abort', aborted, { once: true });
    try {
      signal.throwIfAborted();
      Promise.resolve(call.startScreenShare({ mediaStream: stream, screenVideoSendSettings: quality })).catch(finish);
      started();
    } catch (error) { finish(error); }
  });
}
