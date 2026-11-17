// Видео/фото во вложениях: загрузка в Supabase Storage, просмотр потоком, офлайн-кэш в IndexedDB.
import { getConfig, getState, sbClient } from './store';
import type { FileAtt } from './types';
import { uuid } from './util';

export const MAX_BYTES = 50 * 1024 * 1024; // лимит бесплатного Supabase на один файл
const BUCKET = 'attachments';

// ───── IndexedDB ─────
let dbp: Promise<IDBDatabase> | null = null;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open('plan-media', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const d = await db();
  return new Promise((res, rej) => { const rq = fn(d.transaction('files', mode).objectStore('files')); rq.onsuccess = () => res(rq.result as T); rq.onerror = () => rej(rq.error); });
}
export const getCached = (path: string) => idb<Blob | undefined>('readonly', s => s.get(path));
export const putCached = (path: string, b: Blob) => idb<void>('readwrite', s => s.put(b, path));
export const delCached = (path: string) => idb<void>('readwrite', s => s.delete(path));
export const isCached = async (path: string) => !!(await getCached(path).catch(() => undefined));

const safeName = (n: string) => n.normalize('NFKD').replace(/[^\w.\-]+/g, '_').slice(-60) || 'file';

/** Загрузка с прогрессом. ownerId — чей план (папка в хранилище). */
export async function uploadFile(file: File, ownerId: string, taskId: string, onProgress: (p: number) => void): Promise<FileAtt> {
  if (file.size > MAX_BYTES) throw new Error(`Файл ${(file.size / 1048576).toFixed(0)} МБ — больше лимита 50 МБ. Сократите или сожмите видео (на iPhone: при отправке выбрать меньший размер).`);
  const st = getState();
  const att: FileAtt = { id: uuid(), path: '', name: file.name, size: file.size, mime: file.type || 'video/mp4', by: st.userId };
  if (st.mode === 'local') {
    att.path = `local/${taskId}/${att.id}`; att.local = true;
    await putCached(att.path, file); onProgress(100); return att;
  }
  const sb = sbClient()!;
  att.path = `${ownerId}/${taskId}/${att.id}-${safeName(file.name)}`;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) throw new Error('Нет входа в аккаунт');
  const cfg = getConfig()!;
  const url = `${cfg.url}/storage/v1/object/${BUCKET}/${encodeURI(att.path)}`;
  await new Promise<void>((res, rej) => {
    const x = new XMLHttpRequest();
    x.open('POST', url);
    x.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
    x.setRequestHeader('apikey', cfg.anonKey);
    x.setRequestHeader('Content-Type', att.mime);
    x.setRequestHeader('x-upsert', 'false');
    x.upload.onprogress = e => e.lengthComputable && onProgress(Math.round(e.loaded / e.total * 100));
    x.onload = () => x.status < 300 ? res() : rej(new Error(uploadError(x.status, x.responseText)));
    x.onerror = () => rej(new Error('Нет связи — не удалось загрузить'));
    x.send(file);
  });
  putCached(att.path, file).catch(() => {}); // у загрузившего сразу есть офлайн-копия
  return att;
}
function uploadError(status: number, body: string) {
  if (status === 413 || /exceeded|too large/i.test(body)) return 'Файл больше лимита хранилища (50 МБ)';
  if (/Bucket not found/i.test(body)) return 'Хранилище не создано — выполните обновление сервера (migration-002.sql)';
  if (status === 403) return 'Нет доступа к хранилищу';
  return `Ошибка загрузки (${status})`;
}

/** Адрес для просмотра: офлайн-копия, иначе поток с сервера (без скачивания целиком). */
export async function playableUrl(f: FileAtt): Promise<{ url: string; offline: boolean }> {
  const b = await getCached(f.path).catch(() => undefined);
  if (b) return { url: URL.createObjectURL(b), offline: true };
  if (f.local) throw new Error('Файл есть только на устройстве, где его добавили');
  const { data, error } = await sbClient()!.storage.from(BUCKET).createSignedUrl(f.path, 60 * 60 * 6);
  if (error || !data) throw new Error(error?.message || 'Не удалось открыть файл');
  return { url: data.signedUrl, offline: false };
}

/** Скачать на устройство для просмотра без интернета. */
export async function saveOffline(f: FileAtt, onProgress: (p: number) => void) {
  const { data, error } = await sbClient()!.storage.from(BUCKET).createSignedUrl(f.path, 600);
  if (error || !data) throw new Error(error?.message || 'Не удалось скачать');
  const r = await fetch(data.signedUrl);
  if (!r.ok || !r.body) throw new Error('Не удалось скачать');
  const total = Number(r.headers.get('content-length')) || f.size;
  const reader = r.body.getReader(); const chunks: BlobPart[] = []; let got = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); got += value.length; onProgress(Math.round(got / total * 100)); }
  await putCached(f.path, new Blob(chunks, { type: f.mime }));
  try { await (navigator.storage as any)?.persist?.(); } catch { /* */ }
}

export async function removeRemote(f: FileAtt) {
  await delCached(f.path).catch(() => {});
  if (!f.local && sbClient()) await sbClient()!.storage.from(BUCKET).remove([f.path]);
}
export const fmtSize = (b: number) => b > 1048576 ? `${(b / 1048576).toFixed(1)} МБ` : `${Math.max(1, Math.round(b / 1024))} КБ`;
