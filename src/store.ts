import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { useRef, useSyncExternalStore } from 'react';
import type { Activity, Goal, Idea, Notif, Profile, Table, Task } from './types';
import { addDays, today, uuid } from './util';

// ───────── Конфигурация ─────────
export interface Config { url: string; anonKey: string; vapid?: string; }
const CFG_KEY = 'plan:config';
export function getConfig(): Config | null {
  const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  try {
    const s = localStorage.getItem(CFG_KEY);
    if (s) { const c = JSON.parse(s); if (c.url && c.anonKey) return c; }
  } catch { /* */ }
  if (envUrl && envKey) return { url: envUrl, anonKey: envKey, vapid: import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined };
  return null;
}
export function setConfig(c: Config | null) {
  if (c) localStorage.setItem(CFG_KEY, JSON.stringify(c)); else localStorage.removeItem(CFG_KEY);
  localStorage.removeItem('plan:mode');
  location.reload();
}

// ───────── Состояние ─────────
export interface State {
  phase: 'boot' | 'setup' | 'auth' | 'app';
  mode: 'local' | 'cloud';
  userId: string | null;
  email: string | null;
  profile: Profile | null;
  partner: Profile | null;
  tasks: Task[]; goals: Goal[]; ideas: Idea[];
  notifications: Notif[]; activity: Activity[];
  online: boolean; pending: number; syncError: string | null;
  toast: string | null;
  schema: number;            // версия схемы на сервере (1 = нет поля extra)
  updateReady: string | null; // Windows: загруженная версия, ждёт перезапуска
}
let state: State = {
  phase: 'boot', mode: 'local', userId: null, email: null, profile: null, partner: null,
  tasks: [], goals: [], ideas: [], notifications: [], activity: [],
  online: typeof navigator !== 'undefined' ? navigator.onLine : true, pending: 0, syncError: null, toast: null, schema: 0, updateReady: null,
};
const listeners = new Set<() => void>();
function set(p: Partial<State>) { state = { ...state, ...p }; listeners.forEach(l => l()); }
export const getState = () => state;
const subscribeStore = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
function shallowEq(a: any, b: any) {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every(k => Object.is(a[k], b[k]));
}
export function useStore<T>(sel: (s: State) => T): T {
  const last = useRef<{ v: T } | null>(null);
  return useSyncExternalStore(subscribeStore, () => {
    const v = sel(state);
    if (last.current && shallowEq(last.current.v, v)) return last.current.v;
    last.current = { v }; return v;
  });
}

let sb: SupabaseClient | null = null;
export const sbClient = () => sb;
let appConfig: Record<string, string> = {};
let channel: RealtimeChannel | null = null;
type Op = { table: Table; row: any };
let queue: Op[] = [];
let toastTimer: any;
export function toast(msg: string) { clearTimeout(toastTimer); set({ toast: msg }); toastTimer = setTimeout(() => set({ toast: null }), 3500); }

const cacheKey = () => `plan:cache:${state.userId}`;
const queueKey = () => `plan:queue:${state.userId}`;
function persist() {
  if (!state.userId) return;
  const { tasks, goals, ideas, notifications, activity, profile, partner } = state;
  try {
    localStorage.setItem(cacheKey(), JSON.stringify({ tasks, goals, ideas, notifications, activity, profile, partner }));
    localStorage.setItem(queueKey(), JSON.stringify(queue));
  } catch { /* quota */ }
}
function loadCache() {
  try {
    const c = JSON.parse(localStorage.getItem(cacheKey()) || 'null');
    if (c) set({ tasks: c.tasks || [], goals: c.goals || [], ideas: c.ideas || [], notifications: c.notifications || [], activity: c.activity || [], profile: c.profile || state.profile, partner: c.partner || null });
    queue = JSON.parse(localStorage.getItem(queueKey()) || '[]');
    set({ pending: queue.length });
  } catch { queue = []; }
}

// ───────── Запуск ─────────
export async function init() {
  window.addEventListener('online', () => { set({ online: true }); flush(); refetch(); });
  window.addEventListener('offline', () => set({ online: false }));
  setInterval(() => { if (queue.length) flush(); }, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && state.mode === 'cloud' && state.userId) refetch(); });

  let cfg = getConfig();
  if (!cfg && location.protocol.startsWith('http')) {
    // config.json рядом с index.html — чтобы на телефоне ничего не вводить
    try {
      const r = await fetch('./config.json', { cache: 'no-store' });
      if (r.ok) { const c = await r.json(); if (c.url && c.anonKey && !String(c.url).includes('YOUR')) { localStorage.setItem(CFG_KEY, JSON.stringify(c)); cfg = c; } }
    } catch { /* нет файла */ }
  }
  if (!cfg) {
    if (localStorage.getItem('plan:mode') === 'local') return startLocal();
    return set({ phase: 'setup' });
  }
  sb = createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'plan:auth' } });
  set({ mode: 'cloud' });
  const { data } = await sb.auth.getSession();
  if (data.session) await startUser(data.session.user.id, data.session.user.email ?? null);
  else set({ phase: 'auth' });
  sb.auth.onAuthStateChange((ev, session) => {
    if (ev === 'SIGNED_OUT') { teardown(); set({ phase: 'auth', userId: null }); }
    else if (session && !state.userId) startUser(session.user.id, session.user.email ?? null);
  });
}

export function startLocal() {
  localStorage.setItem('plan:mode', 'local');
  set({ mode: 'local', userId: 'local', email: null, profile: { id: 'local', name: 'Я', invite_code: '—', partner_id: null } });
  loadCache();
  if (!localStorage.getItem('plan:seeded')) { seed(); localStorage.setItem('plan:seeded', '1'); }
  queue = []; set({ pending: 0, phase: 'app', schema: 99 });
  autoUpdate();
}

function seed() {
  const t = today(); const me = 'local';
  const mk = (title: string, date: string | null, done = false, pos = 0, time: string | null = null): Task => ({
    id: uuid(), owner_id: me, shared: false, assignee_id: null, title, date, time, done, done_at: done ? new Date().toISOString() : null,
    done_dates: [], repeat: null, goal_id: null, position: pos, deleted: false, created_by: me, updated_by: me, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  });
  const goal = (title: string, progress: number, pos: number): Goal => ({ id: uuid(), owner_id: me, title, progress, position: pos, deleted: false });
  const idea = (text: string, pos: number): Idea => ({ id: uuid(), owner_id: me, text, position: pos, deleted: false });
  set({
    tasks: [mk('Снять и смонтировать контент', t, true, 1), mk('Доработать приложение', t, false, 2), mk('Тренировка (велотренажёр)', t, true, 3),
      mk('Приготовить еду на завтра', t, false, 4), mk('Английский (30 минут)', t, false, 5, '20:00'), mk('Позвонить родителям', addDays(t, 1), false, 1),
      mk('Обновить сборку Minecraft', null, false, 1), mk('Подготовка к переезду', null, false, 2)],
    goals: [goal('Сбросить вес до 80 кг', 40, 1), goal('Английский B2', 25, 2)],
    ideas: [idea('Мод с ИИ для Minecraft', 1), idea('Улучшить планировщик', 2)],
  });
  persist();
}

async function startUser(id: string, email: string | null) {
  set({ userId: id, email });
  loadCache();
  set({ phase: 'app' });
  await loadProfile();
  await loadAppConfig();
  await refetch();
  subscribe();
  flush();
  autoUpdate();
}

async function loadAppConfig() {
  if (!sb) return;
  const { data, error } = await sb.from('app_config').select('key,value');
  if (error) { set({ schema: 1 }); return; }
  appConfig = Object.fromEntries((data || []).map((r: any) => [r.key, r.value]));
  set({ schema: Number(appConfig.schema_version || 1) });
}

function teardown() {
  if (channel && sb) sb.removeChannel(channel);
  channel = null; queue = [];
  set({ tasks: [], goals: [], ideas: [], notifications: [], activity: [], profile: null, partner: null, pending: 0 });
}

async function loadProfile() {
  if (!sb || !state.userId) return;
  const { data: p } = await sb.from('profiles').select('*').eq('id', state.userId).maybeSingle();
  if (!p) return;
  let partner: Profile | null = null;
  if (p.partner_id) {
    const { data: q } = await sb.from('profiles').select('*').eq('id', p.partner_id).maybeSingle();
    if (q && q.partner_id === p.id) partner = q; // только взаимная связь
  }
  set({ profile: p, partner });
  persist();
}

function mergeRows<T extends { id: string }>(server: T[], table: Table): T[] {
  const pend = new Map(queue.filter(o => o.table === table).map(o => [o.row.id, o.row]));
  const out = server.filter(r => !pend.has(r.id));
  pend.forEach(r => { if (!r.deleted) out.push(r); });
  return out;
}

let fetching = false;
export async function refetch() {
  if (!sb || !state.userId || fetching || !navigator.onLine) return;
  fetching = true;
  try {
    const [t, g, i, n, a] = await Promise.all([
      sb.from('tasks').select('*').eq('deleted', false),
      sb.from('goals').select('*').eq('deleted', false),
      sb.from('ideas').select('*').eq('deleted', false),
      sb.from('notifications').select('*').eq('user_id', state.userId).order('created_at', { ascending: false }).limit(60),
      sb.from('activity').select('*').order('created_at', { ascending: false }).limit(120),
    ]);
    const err = t.error || g.error || i.error;
    if (err) { set({ syncError: err.message }); return; }
    set({
      tasks: mergeRows(t.data as Task[], 'tasks'), goals: mergeRows(g.data as Goal[], 'goals'), ideas: mergeRows(i.data as Idea[], 'ideas'),
      notifications: (n.data as Notif[]) || state.notifications, activity: (a.data as Activity[]) || state.activity, syncError: null,
    });
    persist();
  } finally { fetching = false; }
}

function subscribe() {
  if (!sb || !state.userId) return;
  if (channel) sb.removeChannel(channel);
  const apply = (table: Table) => (payload: any) => {
    const row = payload.new;
    if (!row || !row.id) return;
    if (queue.some(o => o.table === table && o.row.id === row.id)) return; // ждём своё изменение
    const list = (state as any)[table] as any[];
    const rest = list.filter(r => r.id !== row.id);
    set({ [table]: row.deleted ? rest : [...rest, row] } as any);
    persist();
  };
  channel = sb.channel('plan-' + state.userId)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, apply('tasks'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'goals' }, apply('goals'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ideas' }, apply('ideas'))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity' }, (p: any) => {
      set({ activity: [p.new, ...state.activity].slice(0, 150) });
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${state.userId}` }, (p: any) => {
      const n = p.new as Notif;
      set({ notifications: [n, ...state.notifications].slice(0, 80) });
      persist();
      const text = notifText(n);
      toast(text);
      systemNotify(text);
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, async () => {
      const had = state.partner?.id;
      await loadProfile();
      if (state.partner?.id !== had) { await refetch(); if (state.partner) toast(`Аккаунты связаны: ${state.partner.name}`); }
    })
    .subscribe((status) => { if (status === 'SUBSCRIBED') refetch(); });
}

// ───────── Запись ─────────
export function save<T extends { id: string }>(table: Table, row: T) {
  const r: any = { ...row, updated_at: new Date().toISOString(), updated_by: state.userId };
  if (!r.created_by) { r.created_by = state.userId; r.created_at = r.updated_at; }
  const list = (state as any)[table] as any[];
  const rest = list.filter(x => x.id !== r.id);
  set({ [table]: r.deleted ? rest : [...rest, r] } as any);
  if (state.mode === 'cloud') {
    queue = queue.filter(o => !(o.table === table && o.row.id === r.id));
    queue.push({ table, row: r });
    set({ pending: queue.length });
  } else if (table === 'tasks') {
    localActivity(r as Task, list.find(x => x.id === r.id));
  }
  persist();
  flush();
}
export function remove(table: Table, row: any) { save(table, { ...row, deleted: true }); }

const COLS: Record<Table, string[]> = {
  tasks: ['id', 'owner_id', 'shared', 'assignee_id', 'title', 'date', 'time', 'done', 'done_at', 'done_dates', 'repeat', 'goal_id', 'position', 'deleted'],
  goals: ['id', 'owner_id', 'title', 'progress', 'position', 'deleted'],
  ideas: ['id', 'owner_id', 'text', 'position', 'deleted'],
};
let flushing = false;
export async function flush() {
  if (!sb || flushing || !queue.length || !navigator.onLine) return;
  flushing = true;
  try {
    while (queue.length) {
      const op = queue[0];
      if (state.schema === 0) await loadAppConfig();
      const body: any = {}; COLS[op.table].forEach(k => { if (k in op.row) body[k] = op.row[k]; });
      if (state.schema >= 2 && op.row.extra) body.extra = op.row.extra;
      const { data, error } = await sb.from(op.table).upsert(body, { onConflict: 'id' }).select().maybeSingle();
      if (error) {
        const network = !navigator.onLine || /fetch|network|Failed/i.test(error.message);
        if (network) { set({ syncError: 'Нет связи — изменения сохранены и уйдут позже' }); break; }
        set({ syncError: error.message });
        queue.shift(); // отклонено сервером (права) — не зацикливаемся
      } else {
        queue.shift();
        if (data) {
          const list = (state as any)[op.table] as any[];
          const still = queue.some(o => o.table === op.table && o.row.id === data.id);
          if (!still) { const rest = list.filter(x => x.id !== data.id); set({ [op.table]: data.deleted ? rest : [...rest, data] } as any); }
        }
        set({ syncError: null });
      }
      set({ pending: queue.length });
      persist();
    }
  } finally { flushing = false; }
}

// История в локальном режиме
function localActivity(t: Task, old?: Task) {
  let action = '';
  if (!old) action = 'added';
  else if (t.deleted) action = 'deleted';
  else if (t.done && !old.done || t.done_dates.length > old.done_dates.length) action = 'completed';
  else if (!t.done && old.done) action = 'uncompleted';
  else if (t.date !== old.date || t.time !== old.time) action = 'moved';
  else if (t.title !== old.title || t.repeat !== old.repeat) action = 'edited';
  if (!action) return;
  const a: Activity = { id: Date.now(), plan_owner: 'local', actor_id: 'local', action, title: t.title, shared: t.shared, created_at: new Date().toISOString() };
  set({ activity: [a, ...state.activity].slice(0, 150) });
}

// ───────── Аккаунт ─────────
export async function signIn(email: string, password: string) {
  if (!sb) throw new Error('Сервер не настроен');
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Неверная почта или пароль' : error.message);
}
export async function signUp(email: string, password: string, name: string) {
  if (!sb) throw new Error('Сервер не настроен');
  const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name } } });
  if (error) throw new Error(error.message);
  if (!data.session) return 'confirm';
  return 'ok';
}
export async function signOut() {
  if (state.mode === 'local') { localStorage.removeItem('plan:mode'); location.reload(); return; }
  await sb?.auth.signOut();
}
export async function updateName(name: string) {
  if (state.mode === 'local') { set({ profile: { ...state.profile!, name } }); persist(); return; }
  const { error } = await sb!.from('profiles').update({ name }).eq('id', state.userId!);
  if (error) throw new Error(error.message);
  await loadProfile();
}
export async function linkPartner(code: string) {
  const { error } = await sb!.rpc('link_partner', { code });
  if (error) throw new Error(error.message);
  await loadProfile(); await refetch();
}
export async function unlinkPartner() {
  const { error } = await sb!.rpc('unlink_partner');
  if (error) throw new Error(error.message);
  await loadProfile(); await refetch();
}
export async function markAllRead() {
  const ids = state.notifications.filter(n => !n.read).map(n => n.id);
  if (!ids.length) return;
  set({ notifications: state.notifications.map(n => ({ ...n, read: true })) });
  persist();
  if (sb) await sb.from('notifications').update({ read: true }).in('id', ids);
}

// ───────── Уведомления ─────────
export function nameOf(id: string | null | undefined) {
  if (!id) return '';
  if (id === state.userId) return state.profile?.name || 'Я';
  if (id === state.partner?.id) return state.partner.name || 'Партнёр';
  return '';
}
import { relDate } from './util';
export function notifText(n: Notif) {
  const who = nameOf(n.actor_id) || 'Партнёр';
  const when = n.date ? `${relDate(n.date)}${n.time ? ', ' + n.time : ''}` : (n.time || '');
  const tail = when ? ` — ${when}` : '';
  switch (n.kind) {
    case 'added': return n.shared ? `${who} добавил(а) общее дело: ${n.title}${tail}` : `Тебе добавили задачу: ${n.title}${tail}`;
    case 'completed': return `${who} выполнил(а): ${n.title}`;
    case 'attached': return `${who} прикрепил(а) видео: ${n.title}`;
    case 'moved': return `${who} перенёс(ла): ${n.title}${tail}`;
    case 'deleted': return `${who} удалил(а): ${n.title}`;
    default: return `${who} изменил(а): ${n.title}`;
  }
}
export type UpdEvent = { state: 'checking' | 'available' | 'none' | 'progress' | 'ready' | 'error'; version?: string; percent?: number; error?: string };
declare global { interface Window { planDesktop?: {
  notify(t: string, b: string): void; minimize(): void; maximize(): void; close(): void; isDesktop: boolean; version: string;
  setTheme?(t: string): void; checkUpdate?(feed: string): Promise<void>; downloadUpdate?(): Promise<void>; installUpdate?(): void; onUpdate?(cb: (e: UpdEvent) => void): () => void;
} } }
export function updateFeed(): string {
  const custom = localStorage.getItem('plan:updateUrl');
  const v = custom || appConfig.update_feed || import.meta.env.VITE_UPDATE_FEED || '';
  return String(v).trim().replace(/\/$/, '');
}
export async function syncNow() {
  if (state.mode !== 'cloud') return;
  await flush(); await loadProfile(); await refetch();
}
function systemNotify(body: string) {
  if (window.planDesktop) { window.planDesktop.notify('План работы', body); return; }
  if (localStorage.getItem('plan:push') === '1') return; // придёт через Web Push
  if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
    navigator.serviceWorker?.getRegistration().then(r => { if (r) r.showNotification('План работы', { body, icon: './icon-192.png' }); else new Notification('План работы', { body }); });
  }
}

export function pushSupport(): { ok: boolean; reason?: string } {
  if (window.planDesktop) return { ok: false, reason: 'На Windows уведомления приходят напрямую от приложения.' };
  if (state.mode !== 'cloud') return { ok: false, reason: 'Нужен облачный режим (Supabase).' };
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = (navigator as any).standalone || matchMedia('(display-mode: standalone)').matches;
  if (ios && !standalone) return { ok: false, reason: 'На iPhone push работает только после «Поделиться → На экран «Домой»» и запуска оттуда (iOS 16.4+).' };
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return { ok: false, reason: 'Этот браузер не поддерживает фоновые push-уведомления. Внутренний центр уведомлений работает.' };
  if (!getConfig()?.vapid) return { ok: false, reason: 'Push не настроен на сервере (нет VAPID-ключа в настройках).' };
  return { ok: true };
}
export async function enablePush() {
  const s = pushSupport(); if (!s.ok) throw new Error(s.reason);
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Уведомления не разрешены');
  const reg = await navigator.serviceWorker.ready;
  const key = getConfig()!.vapid!;
  const raw = atob(key.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - key.length % 4) % 4));
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(raw, c => c.charCodeAt(0)) });
  const json = sub.toJSON();
  const { error } = await sb!.from('push_subscriptions').upsert({ endpoint: json.endpoint, user_id: state.userId, subscription: json });
  if (error) throw new Error(error.message);
  localStorage.setItem('plan:push', '1');
}

// ───────── Автообновление ─────────
let autoStarted = false;
function autoUpdate() {
  if (autoStarted) return; autoStarted = true;
  const desk = window.planDesktop;
  if (desk?.checkUpdate) {
    desk.onUpdate?.(e => {
      if (e.state === 'available') desk.downloadUpdate?.().catch(() => {});
      if (e.state === 'ready') set({ updateReady: e.version || 'новая' });
    });
    const check = () => { const f = updateFeed(); if (f) desk.checkUpdate!(f).catch(() => {}); };
    setTimeout(check, 4000);
    setInterval(check, 3 * 60 * 60 * 1000);
    return;
  }
  // PWA: сайт обновился → тихо перезагружаемся при открытии
  if (!location.protocol.startsWith('http')) return;
  const checkWeb = async () => {
    try {
      const r = await fetch('./version.json', { cache: 'no-store' });
      if (!r.ok) return;
      const { version } = await r.json();
      if (version && version !== __APP_VERSION__ && sessionStorage.getItem('plan:reloadedFor') !== version) {
        sessionStorage.setItem('plan:reloadedFor', version);
        const reg = await navigator.serviceWorker?.getRegistration();
        await reg?.update().catch(() => {});
        location.reload();
      }
    } catch { /* офлайн */ }
  };
  checkWeb();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkWeb(); });
}
declare const __APP_VERSION__: string;
