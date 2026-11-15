import { assetIds, clone, normalizeProject, uid } from './model.js';

const DATABASE = 'mayne-production-studio';
const CURRENT = 'mayne-studio-project';
export const FILE_LIMIT = 180 * 1024 * 1024;
const ARCHIVE_LIMIT = 500 * 1024 * 1024;
const assetType = /^(?:image\/(?:png|jpeg|webp|gif|avif)|video\/[a-z0-9.+-]+|audio\/[a-z0-9.+-]+|application\/(?:octet-stream|vnd\.[a-z0-9.+-]+))$/i;
let database;

function db() {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      const store = request.result;
      store.createObjectStore('projects', { keyPath: 'id' });
      store.createObjectStore('files');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch(error => {
    database = null;
    throw error;
  });
  return database;
}

async function access(stores, mode, operation) {
  const storage = await db();
  return new Promise((resolve, reject) => {
    const transaction = storage.transaction(stores, mode);
    transaction.oncomplete = () => resolve(request?.result);
    transaction.onabort = () => reject(transaction.error ?? new Error('The browser could not save this project.'));
    let request;
    try { request = operation(transaction); }
    catch (error) { transaction.abort(); reject(error); }
  });
}

export function lastProject(id) {
  try {
    if (id) localStorage.setItem(CURRENT, id);
    return localStorage.getItem(CURRENT);
  } catch { return null; }
}

export const loadProject = id => access('projects', 'readonly', tx => tx.objectStore('projects').get(id));
export const listProjects = () => access('projects', 'readonly', tx => tx.objectStore('projects').getAll());
export const loadFile = (project, asset) => access('files', 'readonly', tx => tx.objectStore('files').get([project, asset]));

export function saveProject(project, media = []) {
  const snapshot = clone(project);
  return access(['projects', 'files'], 'readwrite', tx => {
    for (const [id, file] of media) tx.objectStore('files').put(file, [snapshot.id, id]);
    return tx.objectStore('projects').put(snapshot);
  });
}

export function removeProject(id) {
  return access(['projects', 'files'], 'readwrite', tx => {
    tx.objectStore('files').delete(IDBKeyRange.bound([id, ''], [id, '\uffff']));
    return tx.objectStore('projects').delete(id);
  });
}

async function projectFiles(project) {
  return Promise.all(assetIds(project).map(async id => {
    const file = await loadFile(project.id, id);
    if (!file) throw new Error('A source file referenced by this project is missing on this device.');
    return [id, file];
  }));
}

export async function copyProject(project) {
  const files = await projectFiles(project);
  const copy = { ...clone(project), id: uid(), name: (project.name + ' copy').slice(0, 90), updated: Date.now() };
  await saveProject(copy, files);
  return copy;
}

function fileLimit(bytes) {
  if (bytes > ARCHIVE_LIMIT) throw new Error('Project backups can hold up to 500 MB of media.');
}

export async function exportProject(project) {
  const files = await projectFiles(project);
  fileLimit(files.reduce((total, [, blob]) => total + blob.size, 0));
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  zip.file('project.json', JSON.stringify({ format: 'mayne-studio', project, media: files.map(([id, file]) => ({
    id, name: file.name || 'Source', type: file.type || 'application/octet-stream', bytes: file.size,
  })) }));
  for (const [id, file] of files) zip.file('media/' + id, await file.arrayBuffer());
  return zip.generateAsync({ type: 'blob', mimeType: 'application/zip', compression: 'STORE' });
}

export async function importProject(file) {
  fileLimit(file.size);
  const { unzip } = await import('fflate');
  const data = new Uint8Array(await file.arrayBuffer());
  const entries = await new Promise((resolve, reject) => {
    let total = 0;
    let count = 0;
    unzip(data, { filter(entry) {
      if (!/^project\.json$|^media\/[a-z0-9_-]{1,64}$/i.test(entry.name)) return false;
      total += entry.originalSize;
      count++;
      return count <= 201 && total <= ARCHIVE_LIMIT
        && entry.originalSize <= (entry.name === 'project.json' ? 1024 * 1024 : FILE_LIMIT);
    } }, (error, result) => {
      if (error || count > 201 || total > ARCHIVE_LIMIT) reject(new Error('This project backup could not be opened.'));
      else resolve(result);
    });
  });
  if (!entries['project.json']) throw new Error('This backup has no Mayne Studio project.');
  const manifest = JSON.parse(new TextDecoder().decode(entries['project.json']));
  if (manifest.format !== 'mayne-studio' || !Array.isArray(manifest.media)) throw new Error('Choose a Mayne Studio project backup.');
  const project = normalizeProject(manifest.project);
  const media = assetIds(project).map(id => {
    const info = manifest.media.find(asset => asset?.id === id);
    const bytes = entries['media/' + id];
    if (!info || !bytes || bytes.length !== info.bytes) throw new Error('This backup is missing a source file.');
    const type = assetType.test(info.type) ? info.type : 'application/octet-stream';
    return [id, new File([bytes], String(info.name).slice(0, 180), { type })];
  });
  project.id = uid();
  project.updated = Date.now();
  // Device permissions and IDs are specific to the current browser profile.
  for (const source of project.sources) source.device = '';
  await saveProject(project, media);
  return project;
}
