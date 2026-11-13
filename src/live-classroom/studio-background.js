async function accessBackground(mode, action) {
  const database = await new Promise((resolve, reject) => {
    const request = indexedDB.open('mayne-live-classroom', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('presenter-studio');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction('presenter-studio', mode);
      const request = action(transaction.objectStore('presenter-studio'));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export const loadStudioBackground = () => accessBackground('readonly', store => store.get('background'));
export const saveStudioBackground = file => accessBackground('readwrite', store => file
  ? store.put(file, 'background') : store.delete('background'));
