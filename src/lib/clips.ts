import { useEffect, useState } from 'react';

export type Clip = { id: string; user: string; createdAt: number; duration: number; size: number; blob: Blob };
const CHANGE = 'clips-change';
let database: Promise<IDBDatabase> | null = null;

function open() {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('replay-clips', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('clips', { keyPath: 'id' }).createIndex('user', 'user');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch(error => { database = null; throw error; });
  return database;
}
async function write(change: (clips: IDBObjectStore) => void) {
  const transaction = (await open()).transaction('clips', 'readwrite');
  change(transaction.objectStore('clips'));
  await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = transaction.onabort = () => reject(transaction.error); });
  window.dispatchEvent(new Event(CHANGE));
}
export async function addClip(user: string, blob: Blob, duration: number) {
  void navigator.storage?.persist?.().catch(() => false);
  try { await write(clips => clips.put({ id: crypto.randomUUID(), user, createdAt: Date.now(), duration, size: blob.size, blob })); }
  catch (error) { throw new Error(error instanceof DOMException && error.name === 'QuotaExceededError' ? 'No queda espacio. Borra algún clip en Tus clips.' : 'No se pudo guardar el clip en este dispositivo.'); }
}
export async function listClips(user: string) {
  const index = (await open()).transaction('clips').objectStore('clips').index('user');
  const clips = await new Promise<Clip[]>((resolve, reject) => { const request = index.getAll(user); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  return clips.sort((a, b) => b.createdAt - a.createdAt);
}
export function deleteClip(id: string) { return write(clips => clips.delete(id)); }
export function useClips(user: string | null | undefined) {
  const [clips, setClips] = useState<Clip[] | null>(null);
  useEffect(() => {
    if (!user) return;
    let current = true;
    const load = () => listClips(user).then(list => { if (current) setClips(list); }, () => { if (current) setClips([]); });
    void load();
    window.addEventListener(CHANGE, load);
    return () => { current = false; window.removeEventListener(CHANGE, load); };
  }, [user]);
  return clips;
}
export function clipFileName(time: number) {
  const date = new Date(time);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `replay-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.mp4`;
}
