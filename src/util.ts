import type { Task } from './types';
export const uuid = () => (crypto as any).randomUUID ? crypto.randomUUID() :
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
export const pad = (n: number) => String(n).padStart(2, '0');
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseIso = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const today = () => iso(new Date());
export const addDays = (s: string, n: number) => { const d = parseIso(s); d.setDate(d.getDate() + n); return iso(d); };
export const weekStart = (s: string) => { const d = parseIso(s); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return iso(d); };
export const DOW = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
export const DOW_FULL = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
export const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
export const dow = (s: string) => (parseIso(s).getDay() + 6) % 7; // 0 = Пн
export const longDate = (s: string) => { const d = parseIso(s); return `${DOW_FULL[dow(s)]}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`; };
export const shortDate = (s: string) => { const d = parseIso(s); return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`; };
export const relDate = (s: string | null) => {
  if (!s) return 'без даты';
  const t = today();
  if (s === t) return 'сегодня';
  if (s === addDays(t, 1)) return 'завтра';
  if (s === addDays(t, -1)) return 'вчера';
  return shortDate(s);
};
export const timeAgo = (ts: string) => {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60) return 'только что';
  if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`;
  const d = new Date(ts); return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
};

/** Повторы: 'daily' | 'weekly' | 'days:1,3,5' (1 = Пн … 7 = Вс) */
export function occursOn(t: Task, date: string): boolean {
  if (!t.date) return false;
  if (!t.repeat) return t.date === date;
  if (date < t.date) return false;
  if (t.repeat === 'daily') return true;
  if (t.repeat === 'weekly') return dow(date) === dow(t.date);
  if (t.repeat.startsWith('days:')) return t.repeat.slice(5).split(',').map(Number).includes(dow(date) + 1);
  return t.date === date;
}
export const isDoneOn = (t: Task, date: string) => t.repeat ? t.done_dates.includes(date) : t.done;
export const repeatLabel = (r: string | null) => {
  if (!r) return '';
  if (r === 'daily') return 'каждый день';
  if (r === 'weekly') return 'каждую неделю';
  if (r.startsWith('days:')) return r.slice(5).split(',').map(n => DOW[Number(n) - 1]).join(', ');
  return '';
};
/** «Купить хлеб 14:30» → { title: 'Купить хлеб', time: '14:30' } */
export function parseQuick(s: string): { title: string; time: string | null } {
  const m = s.match(/(?:^|\s)(?:в\s)?([01]?\d|2[0-3])[:.]([0-5]\d)(?=\s|$)/);
  if (!m) return { title: s.trim(), time: null };
  return { title: (s.slice(0, m.index) + s.slice((m.index ?? 0) + m[0].length)).replace(/\s+/g, ' ').trim(), time: `${pad(Number(m[1]))}:${m[2]}` };
}
export const cls = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');
