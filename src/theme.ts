export type ThemePref = 'warm' | 'night' | 'system';
const KEY = 'plan:theme';
const mq = () => matchMedia('(prefers-color-scheme: dark)');
export const getThemePref = (): ThemePref => (localStorage.getItem(KEY) as ThemePref) || 'warm';
export const resolveTheme = (p: ThemePref = getThemePref()) => p === 'system' ? (mq().matches ? 'night' : 'warm') : p;
export function applyTheme() {
  const t = resolveTheme();
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'night' ? '#1c1b18' : '#e9d8c4');
  window.planDesktop?.setTheme?.(t);
}
export function setThemePref(p: ThemePref) { localStorage.setItem(KEY, p); applyTheme(); }
export function initTheme() { applyTheme(); mq().addEventListener('change', () => { if (getThemePref() === 'system') applyTheme(); }); }
