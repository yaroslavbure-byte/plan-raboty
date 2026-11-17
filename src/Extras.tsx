import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as S from './store';
import { useStore } from './store';
import { Modal } from './Modal';
import * as M from './media';
import type { Extra, FileAtt, Task } from './types';
import { cls, uuid } from './util';

/** Всегда берём свежую версию задачи из хранилища, чтобы не затереть чужие правки. */
export function updateExtra(taskId: string, fn: (e: Extra) => Extra) {
  const cur = S.getState().tasks.find(t => t.id === taskId);
  if (!cur) return;
  S.save('tasks', { ...cur, extra: fn({ ...(cur.extra || {}) }) });
}
export const useTask = (id: string, fallback: Task) => useStore(s => s.tasks.find(t => t.id === id) || fallback);

const needsServerUpdate = () => { const st = S.getState(); return st.mode === 'cloud' && st.schema > 0 && st.schema < 2; };

// ───────── Прогресс «в процессе» ─────────
export function ProgressButton({ t, done, onDone }: { t: Task; done: boolean; onDone: () => void }) {
  const p = Math.max(0, Math.min(100, t.extra?.progress || 0));
  const [open, setOpen] = useState<{ x: number; y: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const [v, setV] = useState(p);
  useEffect(() => setV(p), [p]);
  if (done || needsServerUpdate()) return null;
  const set = (n: number) => {
    setV(n);
    updateExtra(t.id, e => ({ ...e, progress: n }));
    if (n >= 100) { setOpen(null); onDone(); }
  };
  const R = 7, C = 2 * Math.PI * R;
  return <span className="prog-wrap" onPointerDown={e => e.stopPropagation()}>
    <button ref={btn} className={cls('prog-btn', p > 0 && 'on')} onClick={() => { if (open) return setOpen(null); const r = btn.current!.getBoundingClientRect(); setOpen({ x: Math.max(8, Math.min(window.innerWidth - 258, r.right - 250)), y: Math.min(r.bottom + 6, window.innerHeight - 190) }); }} title={p ? `В процессе · ${p}%` : 'Отметить, насколько выполнено'}>
      <svg viewBox="0 0 18 18" width="18" height="18">
        <circle cx="9" cy="9" r={R} className="ring-bg" />
        {p > 0 && <circle cx="9" cy="9" r={R} className="ring-fg" strokeDasharray={`${C * p / 100} ${C}`} transform="rotate(-90 9 9)" />}
      </svg>
      {p > 0 && <span className="prog-num">{p}%</span>}
    </button>
    {open && createPortal(<div onPointerDown={e => e.stopPropagation()}>
      <div className="pop-shade" onClick={() => setOpen(null)} />
      <div className="prog-pop" role="dialog" style={{ left: open.x, top: open.y }}>
        <div className="pp-head"><span>{v > 0 ? 'В процессе' : 'Ещё не начато'}</span><b>{v}%</b></div>
        <div className="pp-bar"><i style={{ width: v + '%' }} /></div>
        <input type="range" min={0} max={100} step={5} value={v} onChange={e => setV(Number(e.target.value))}
          onPointerUp={e => set(Number((e.target as HTMLInputElement).value))} onKeyUp={e => set(Number((e.target as HTMLInputElement).value))} />
        <div className="pp-steps">{[0, 25, 50, 75, 100].map(n => <button key={n} className={cls(v === n && 'on')} onClick={() => set(n)}>{n === 100 ? 'Готово' : n + '%'}</button>)}</div>
      </div>
    </div>, document.querySelector('.app') || document.body)}
  </span>;
}

// ───────── Описание ─────────
export function NotesEditor({ task }: { task: Task }) {
  const t = useTask(task.id, task);
  const saved = t.extra?.notes || '';
  const [v, setV] = useState(saved);
  const ta = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<any>(null);
  const dirty = useRef(false);
  // чужая правка пришла, а мы не печатаем — показать её
  useEffect(() => { if (!dirty.current) setV(saved); }, [saved]);
  const fit = () => { const el = ta.current; if (!el) return; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 420) + 'px'; };
  useEffect(fit, [v]);
  const commit = (text: string) => { clearTimeout(timer.current); dirty.current = false; if (text !== (S.getState().tasks.find(x => x.id === t.id)?.extra?.notes || '')) updateExtra(t.id, e => ({ ...e, notes: text })); };
  useEffect(() => () => { if (dirty.current && ta.current) commit(ta.current.value); }, []);
  if (needsServerUpdate()) return null;
  return <textarea ref={ta} className="notes" value={v} placeholder="Описание: что именно имеется в виду, детали, мысли…"
    onChange={e => { setV(e.target.value); dirty.current = true; clearTimeout(timer.current); const x = e.target.value; timer.current = setTimeout(() => commit(x), 900); }}
    onBlur={e => commit(e.target.value)} rows={3} />;
}

// ───────── Подпункты ─────────
export function SubtaskEditor({ task }: { task: Task }) {
  const t = useTask(task.id, task);
  const subs = t.extra?.subtasks || [];
  const [v, setV] = useState('');
  const add = () => { const title = v.trim(); if (!title) return; updateExtra(t.id, e => ({ ...e, subtasks: [...(e.subtasks || []), { id: uuid(), title, done: false }] })); setV(''); };
  const toggle = (id: string) => updateExtra(t.id, e => ({ ...e, subtasks: (e.subtasks || []).map(s => s.id === id ? { ...s, done: !s.done } : s) }));
  if (needsServerUpdate()) return <div className="xsec"><div className="sub-head">Подпункты, ссылки, видео</div><div className="hint">Появятся после обновления сервера — см. жёлтую плашку вверху.</div></div>;
  const del = (id: string) => updateExtra(t.id, e => ({ ...e, subtasks: (e.subtasks || []).filter(s => s.id !== id) }));
  const rename = (id: string, title: string) => updateExtra(t.id, e => ({ ...e, subtasks: (e.subtasks || []).map(s => s.id === id ? { ...s, title } : s) }));
  return <div className="xsec">
    <div className="sub-head">Подпункты{subs.length > 0 && <span className="muted small"> · {subs.filter(s => s.done).length}/{subs.length}</span>}</div>
    {subs.map(s => <div key={s.id} className={cls('sub-row', s.done && 'done')}>
      <button className={cls('check sm', s.done && 'on')} onClick={() => toggle(s.id)}><Tick /></button>
      <input className="sub-input" defaultValue={s.title} onBlur={e => { const nv = e.target.value.trim(); if (nv && nv !== s.title) rename(s.id, nv); }} onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
      <button className="x-sm" onClick={() => del(s.id)} aria-label="Удалить">×</button>
    </div>)}
    <form className="quick small" onSubmit={e => { e.preventDefault(); add(); }}>
      <span className="plus">+</span><input value={v} onChange={e => setV(e.target.value)} placeholder="Добавить подпункт" enterKeyHint="done" />
    </form>
  </div>;
}

// ───────── Ссылки ─────────
export function prettyUrl(u: string) {
  try { const x = new URL(u); const p = (x.pathname + x.search).replace(/\/$/, ''); return x.hostname.replace(/^www\./, '') + (p.length > 28 ? p.slice(0, 26) + '…' : p); } catch { return u; }
}
export function LinkEditor({ task }: { task: Task }) {
  const t = useTask(task.id, task);
  const links = t.extra?.links || [];
  const [v, setV] = useState(''); const [err, setErr] = useState('');
  const add = () => {
    let url = v.trim(); if (!url) return;
    if (!/^[a-z][\w+.-]*:\/\//i.test(url)) url = 'https://' + url;
    try { new URL(url); } catch { setErr('Это не похоже на ссылку'); return; }
    updateExtra(t.id, e => ({ ...e, links: [...(e.links || []), { id: uuid(), url }] })); setV(''); setErr('');
  };
  const del = (id: string) => updateExtra(t.id, e => ({ ...e, links: (e.links || []).filter(l => l.id !== id) }));
  if (needsServerUpdate()) return null;
  return <div className="xsec">
    <div className="sub-head">Ссылки</div>
    {links.map(l => <div key={l.id} className="link-row">
      <LinkIcon />
      <a href={l.url} target="_blank" rel="noreferrer" title={l.url}>{l.title || prettyUrl(l.url)}</a>
      <button className="x-sm" onClick={() => del(l.id)} aria-label="Удалить">×</button>
    </div>)}
    <form className="quick small" onSubmit={e => { e.preventDefault(); add(); }}>
      <span className="plus">+</span><input value={v} onChange={e => { setV(e.target.value); setErr(''); }} placeholder="Вставить ссылку" inputMode="url" enterKeyHint="done" onPaste={e => { const tx = e.clipboardData.getData('text'); if (/^https?:\/\//.test(tx.trim())) { e.preventDefault(); setV(tx.trim()); } }} />
      {v && <button className="btn sm" type="submit">OK</button>}
    </form>
    {err && <div className="err">{err}</div>}
  </div>;
}

// ───────── Видео и фото ─────────
export function MediaEditor({ task }: { task: Task }) {
  const t = useTask(task.id, task);
  const files = t.extra?.files || [];
  const input = useRef<HTMLInputElement>(null);
  const [up, setUp] = useState<{ name: string; p: number } | null>(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState<FileAtt | null>(null);
  const pick = async (fl: FileList | null) => {
    if (!fl?.length) return;
    setErr('');
    for (const f of Array.from(fl)) {
      try {
        setUp({ name: f.name, p: 0 });
        const att = await M.uploadFile(f, t.owner_id, t.id, p => setUp({ name: f.name, p }));
        updateExtra(t.id, e => ({ ...e, files: [...(e.files || []), att] }));
      } catch (e: any) { setErr(e.message); }
    }
    setUp(null);
    if (input.current) input.current.value = '';
  };
  const del = async (f: FileAtt) => {
    if (!confirm(`Удалить «${f.name}»?`)) return;
    updateExtra(t.id, e => ({ ...e, files: (e.files || []).filter(x => x.id !== f.id) }));
    M.removeRemote(f).catch(() => {});
  };
  const blocked = needsServerUpdate();
  if (blocked) return null;
  return <div className="xsec">
    <div className="sub-head">Видео и фото</div>
    {files.map(f => <FileRow key={f.id} f={f} onOpen={() => setOpen(f)} onDelete={() => del(f)} />)}
    {up && <div className="up-row"><span className="muted small">Загрузка «{up.name}» — {up.p}%</span><div className="progress thin"><div style={{ width: up.p + '%' }} /></div></div>}
    {blocked ? <div className="hint">Чтобы прикреплять видео, нужно один раз обновить сервер — см. жёлтую плашку вверху.</div>
      : <button className="btn sm attach-btn" disabled={!!up} onClick={() => input.current?.click()}><ClipIcon /> Прикрепить видео или фото</button>}
    <input ref={input} type="file" accept="video/*,image/*" multiple hidden onChange={e => pick(e.target.files)} />
    <div className="hint small">До 50 МБ на файл. Смотреть можно сразу, без скачивания, или сохранить на устройство для просмотра без интернета.</div>
    {err && <div className="err">{err}</div>}
    {open && <Viewer f={open} onClose={() => setOpen(null)} />}
  </div>;
}

function FileRow({ f, onOpen, onDelete }: { f: FileAtt; onOpen: () => void; onDelete: () => void }) {
  const [cached, setCached] = useState<boolean | null>(null);
  const [dl, setDl] = useState<number | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { M.isCached(f.path).then(setCached); }, [f.path]);
  const save = async () => {
    setErr(''); setDl(0);
    try { await M.saveOffline(f, setDl); setCached(true); } catch (e: any) { setErr(e.message); } finally { setDl(null); }
  };
  const isImg = f.mime.startsWith('image/');
  return <div className="file-row">
    <button className="file-main" onClick={onOpen}>
      <span className="file-ic">{isImg ? <ImgIcon /> : <PlayIcon />}</span>
      <span className="file-name">{f.name}</span>
      <span className="muted small">{M.fmtSize(f.size)}{f.by && f.by !== S.getState().userId ? ` · ${S.nameOf(f.by)}` : ''}</span>
    </button>
    {!f.local && (dl !== null ? <span className="muted small">{dl}%</span>
      : cached ? <button className="mini-btn on" title="Сохранено на устройстве. Нажмите, чтобы удалить копию" onClick={async () => { await M.delCached(f.path); setCached(false); }}>✓ на устройстве</button>
        : <button className="mini-btn" title="Скачать для просмотра без интернета" onClick={save}>⤓ скачать</button>)}
    <button className="x-sm" onClick={onDelete} aria-label="Удалить">×</button>
    {err && <div className="err full">{err}</div>}
  </div>;
}

function Viewer({ f, onClose }: { f: FileAtt; onClose: () => void }) {
  const [src, setSrc] = useState<{ url: string; offline: boolean } | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let u = ''; M.playableUrl(f).then(r => { u = r.offline ? r.url : ''; setSrc(r); }).catch(e => setErr(e.message));
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [f.path]);
  return <Modal title={f.name} onClose={onClose}>
    {err ? <div className="err">{err}</div> : !src ? <div className="empty">Открываю…</div>
      : f.mime.startsWith('image/') ? <img className="media" src={src.url} alt={f.name} />
        : <video className="media" src={src.url} controls autoPlay playsInline preload="metadata" />}
    {src && <div className="hint small">{src.offline ? 'Воспроизводится с устройства — интернет не нужен.' : 'Воспроизводится потоком с сервера.'}</div>}
  </Modal>;
}

// ───────── Подпункты прямо в списке ─────────
export function InlineSubs({ t }: { t: Task }) {
  const subs = t.extra?.subtasks || [];
  const note = (t.extra?.notes || '').trim();
  if (!subs.length && !note) return null;
  return <div className="inline-subs">
    {note && <div className="note-preview">{note.split('\n')[0]}</div>}
    {subs.map(s => <div key={s.id} className={cls('isub', s.done && 'done')}>
      <button className={cls('check xs', s.done && 'on')} onClick={() => updateExtra(t.id, e => ({ ...e, subtasks: (e.subtasks || []).map(x => x.id === s.id ? { ...x, done: !x.done } : x) }))}><Tick /></button>
      <span>{s.title}</span>
    </div>)}
  </div>;
}

/** Значки у задачи: ссылки, вложения. */
export function ExtraBadges({ t }: { t: Task }) {
  const l = t.extra?.links?.length || 0, f = t.extra?.files?.length || 0;
  return <>
    {l > 0 && <span className="meta-ic" title={`Ссылок: ${l}`}><LinkIcon />{l > 1 ? l : ''}</span>}
    {f > 0 && <span className="meta-ic" title={`Вложений: ${f}`}><PlayIcon />{f > 1 ? f : ''}</span>}
  </>;
}

const Tick = () => <svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
export const LinkIcon = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M10 14a4 4 0 005.66 0l3-3a4 4 0 00-5.66-5.66l-1 1" /><path d="M14 10a4 4 0 00-5.66 0l-3 3a4 4 0 005.66 5.66l1-1" /></svg>;
const PlayIcon = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M10 9.5v5l4.5-2.5z" fill="currentColor" /></svg>;
const ImgIcon = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="5" width="18" height="14" rx="3" /><circle cx="9" cy="10" r="1.6" /><path d="M21 16l-5-5-8 8" /></svg>;
const ClipIcon = () => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M20 11.5l-8.2 8.2a5 5 0 01-7.1-7.1l8.5-8.5a3.3 3.3 0 014.7 4.7l-8.4 8.4a1.7 1.7 0 01-2.4-2.4l7.7-7.7" /></svg>;

// ───────── Плашки: обновление сервера / приложения ─────────
import migrationSql from '../supabase/migrations/002_extra_media.sql?raw';
export function Banners() {
  const { schema, mode, updateReady } = useStore(s => ({ schema: s.schema, mode: s.mode, updateReady: s.updateReady }));
  const [guide, setGuide] = useState(false);
  return <>
    {updateReady && <div className="banner ok"><span>Загружена новая версия {updateReady}</span><button className="btn primary sm" onClick={() => window.planDesktop?.installUpdate?.()}>Перезапустить и обновить</button></div>}
    {mode === 'cloud' && schema > 0 && schema < 2 && <div className="banner warn"><span>Чтобы заработали подпункты, ссылки и видео, нужно один раз обновить сервер (1 минута).</span><button className="btn sm" onClick={() => setGuide(true)}>Как обновить</button></div>}
    {guide && <ServerUpdateGuide onClose={() => setGuide(false)} />}
  </>;
}
export function ServerUpdateGuide({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const ref = (S.getConfig()?.url.match(/https:\/\/([^.]+)\.supabase\.co/) || [])[1];
  const sqlUrl = ref ? `https://supabase.com/dashboard/project/${ref}/sql/new` : 'https://supabase.com/dashboard';
  const copy = async () => {
    try { await navigator.clipboard.writeText(migrationSql); setCopied(true); }
    catch { const ta = document.createElement('textarea'); ta.value = migrationSql; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); setCopied(true); }
  };
  return <Modal title="Обновление сервера" onClose={onClose}>
    <ol className="steps">
      <li><button className="btn primary sm" onClick={copy}>{copied ? '✓ Скопировано' : '1. Скопировать код'}</button></li>
      <li><a className="btn sm" href={sqlUrl} target="_blank" rel="noreferrer">2. Открыть Supabase</a> <span className="muted small">откроется пустой SQL-запрос</span></li>
      <li>3. Нажмите в поле, затем <b>Ctrl + V</b> и зелёную кнопку <b>Run</b>.</li>
      <li>4. Когда внизу появится <b>Success</b>, вернитесь сюда и нажмите:<br /><button className="btn sm" onClick={() => location.reload()}>Готово — перезапустить</button></li>
    </ol>
    <div className="hint small">Это нужно сделать один раз и только одному из вас. Код можно запускать повторно — ничего не сломается.</div>
  </Modal>;
}
