import { useEffect, useMemo, useRef, useState } from 'react';
import * as S from './store';
import { useStore } from './store';
import type { Goal, Idea, Task, View } from './types';
import { addDays, cls, DOW, isDoneOn, longDate, MONTHS, occursOn, parseIso, parseQuick, relDate, repeatLabel, timeAgo, today, uuid, weekStart, iso } from './util';
import { Modal, Sheet } from './Modal';
import { InlineSubs, ExtraBadges, Banners, ProgressButton } from './Extras';
import { TaskModal, GoalModal, IdeaModal, NotifModal, HistoryModal, AccountModal, SettingsModal } from './Modals';

export function useMobile() {
  const q = '(max-width: 760px)';
  const [m, setM] = useState(() => matchMedia(q).matches);
  useEffect(() => { const mq = matchMedia(q); const f = () => setM(mq.matches); mq.addEventListener('change', f); return () => mq.removeEventListener('change', f); }, []);
  return m;
}

export default function App() {
  const phase = useStore(s => s.phase);
  const t = useStore(s => s.toast);
  return <>
    <div className="bg" />
    {phase === 'setup' && <Setup />}
    {phase === 'auth' && <Auth />}
    {phase === 'app' && <Main />}
    {t && <div className="toast" onClick={() => S.toast('')}>{t}</div>}
  </>;
}

// ───────── Первый запуск ─────────
function Setup() {
  const [url, setUrl] = useState(''); const [key, setKey] = useState(''); const [vapid, setVapid] = useState('');
  return <div className="center-screen"><div className="card auth-card">
    <Brand />
    <p className="muted">Для работы вдвоём нужен бесплатный сервер Supabase (инструкция — в файле «Инструкция»). Ключи вводятся один раз.</p>
    <label className="field"><span>Project URL</span><input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" /></label>
    <label className="field"><span>anon public key</span><input value={key} onChange={e => setKey(e.target.value)} placeholder="eyJhbGciOi…" /></label>
    <label className="field"><span>VAPID public key (для push, необязательно)</span><input value={vapid} onChange={e => setVapid(e.target.value)} placeholder="B…" /></label>
    <button className="btn primary wide" disabled={!url.startsWith('https://') || key.length < 20}
      onClick={() => S.setConfig({ url: url.trim().replace(/\/$/, ''), anonKey: key.trim(), vapid: vapid.trim() || undefined })}>Подключить</button>
    <button className="btn ghost wide" onClick={() => S.startLocal()}>Попробовать без сервера (только это устройство)</button>
  </div></div>;
}

function Brand({ small }: { small?: boolean }) {
  const partner = useStore(s => s.partner);
  return <div className={cls('brand', small && 'small')}>
    <span className="kanji">計画</span><span className="brand-sep" />
    <div><div className="brand-title">План работы</div><div className="brand-sub">{partner ? <>Наш план <Heart /></> : small ? 'План работы' : <>Работа · Жизнь · Цели</>}</div></div>
  </div>;
}
const Heart = ({ filled }: { filled?: boolean }) => <svg className="heart" viewBox="0 0 24 24" width="12" height="12"><path d="M12 20s-7-4.4-9.2-8.6C1.2 8.3 3 5 6.3 5c2 0 3.2 1.1 3.9 2.2l1.8 2.4 1.8-2.4C14.5 6.1 15.7 5 17.7 5 21 5 22.8 8.3 21.2 11.4 19 15.6 12 20 12 20z" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" /></svg>;

// ───────── Вход ─────────
function Auth() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [info, setInfo] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      if (mode === 'in') await S.signIn(email.trim(), pw);
      else { const r = await S.signUp(email.trim(), pw, name.trim() || email.split('@')[0]); if (r === 'confirm') setInfo('Мы отправили письмо для подтверждения. Откройте ссылку из письма и затем войдите.'); }
    } catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  };
  return <div className="center-screen"><form className="card auth-card" onSubmit={submit}>
    <Brand />
    <div className="seg">
      <button type="button" className={cls(mode === 'in' && 'on')} onClick={() => setMode('in')}>Вход</button>
      <button type="button" className={cls(mode === 'up' && 'on')} onClick={() => setMode('up')}>Регистрация</button>
    </div>
    {mode === 'up' && <label className="field"><span>Имя</span><input value={name} onChange={e => setName(e.target.value)} placeholder="Как вас называть" autoComplete="name" /></label>}
    <label className="field"><span>Почта</span><input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required /></label>
    <label className="field"><span>Пароль</span><input type="password" value={pw} onChange={e => setPw(e.target.value)} minLength={6} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} required /></label>
    {err && <div className="err">{err}</div>}
    {info && <div className="info">{info}</div>}
    <button className="btn primary wide" disabled={busy}>{busy ? '…' : mode === 'in' ? 'Войти' : 'Создать аккаунт'}</button>
    <button type="button" className="link" onClick={() => { if (confirm('Сбросить настройки сервера?')) S.setConfig(null); }}>Настройки сервера</button>
  </form></div>;
}

// ───────── Основной экран ─────────
type ModalState =
  | { t: 'task'; task: Task } | { t: 'goal'; goal: Goal } | { t: 'idea'; idea: Idea }
  | { t: 'notif' } | { t: 'history' } | { t: 'account' } | { t: 'settings' } | { t: 'list'; which: 'goals' | 'later' | 'ideas' } | null;

function Main() {
  const mobile = useMobile();
  const st = useStore(s => s);
  const me = st.userId!;
  const partner = st.partner;
  const [view, setView] = useState<View>('me');
  const [date, setDate] = useState(today());
  const [modal, setModal] = useState<ModalState>(null);
  useEffect(() => { if (!partner && view !== 'me' && st.mode === 'cloud') setView('me'); }, [partner, view, st.mode]);
  useEffect(() => { // смена дня в полночь
    const id = setInterval(() => { const t = today(); if ((window as any).__lastDay && (window as any).__lastDay !== t && date === (window as any).__lastDay) setDate(t); (window as any).__lastDay = t; }, 30000);
    return () => clearInterval(id);
  }, [date]);

  const owner = view === 'partner' ? partner?.id ?? me : me;
  const scope = useMemo(() => st.tasks.filter(t => view === 'shared' ? t.shared : (t.owner_id === owner && !t.shared)), [st.tasks, view, owner]);
  const dayTasks = useMemo(() => scope.filter(t => occursOn(t, date)).sort((a, b) => a.position - b.position), [scope, date]);
  const later = useMemo(() => scope.filter(t => !t.date).sort((a, b) => a.position - b.position), [scope]);
  const goals = useMemo(() => st.goals.filter(g => g.owner_id === owner).sort((a, b) => a.position - b.position), [st.goals, owner]);
  const ideas = useMemo(() => st.ideas.filter(i => i.owner_id === owner).sort((a, b) => a.position - b.position), [st.ideas, owner]);
  const unread = st.notifications.filter(n => !n.read).length;

  const newTask = (p: Partial<Task>): Task => ({
    id: uuid(), owner_id: owner, shared: view === 'shared', assignee_id: null, title: '', date: null, time: null, done: false, done_at: null,
    done_dates: [], repeat: null, goal_id: null, position: Date.now() / 1000, deleted: false, ...p,
  });
  const toggle = (t: Task, d: string | null) => {
    if (t.repeat && d) {
      const has = t.done_dates.includes(d);
      S.save('tasks', { ...t, done_dates: has ? t.done_dates.filter(x => x !== d) : [...t.done_dates, d] });
    } else S.save('tasks', { ...t, done: !t.done, done_at: !t.done ? new Date().toISOString() : null });
  };
  const addQuick = (text: string, d: string | null) => {
    const { title, time } = parseQuick(text); if (!title) return;
    S.save('tasks', newTask({ title, time, date: d }));
  };
  const reorder = (list: Task[], from: number, to: number) => {
    if (from === to) return;
    const arr = [...list]; const [m] = arr.splice(from, 1); arr.splice(to, 0, m);
    arr.forEach((t, i) => { if (t.position !== i + 1) S.save('tasks', { ...t, position: i + 1 }); });
  };
  const addGoal = (title: string) => S.save('goals', { id: uuid(), owner_id: owner, title, progress: 0, position: Date.now() / 1000, deleted: false });
  const addIdea = (text: string) => S.save('ideas', { id: uuid(), owner_id: owner, text, position: Date.now() / 1000, deleted: false });

  const ctx = { me, view, date, toggle, addQuick, reorder, open: setModal, newTask, addGoal, addIdea };

  const doneCount = dayTasks.filter(t => isDoneOn(t, date)).length;
  const todayPanel = <TodayPanel {...ctx} tasks={dayTasks} done={doneCount} setDate={setDate} mobile={mobile} />;
  const showSide = view !== 'shared';

  const header = <header className="titlebar">
    <Brand small={mobile} />
    <div className="tb-right">
      {!mobile && <button className="tb-date" title="Перейти к сегодня" onClick={() => setDate(today())}>{longDate(today())}</button>}
      <SyncDot />
      <button className="icon-btn" title="Уведомления" onClick={() => setModal({ t: 'notif' })}>
        <BellIcon />{unread > 0 && <span className="badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      <button className="icon-btn" title="Аккаунт и пара" onClick={() => setModal({ t: 'account' })}><UserIcon /></button>
      <button className="icon-btn" title="Настройки" onClick={() => setModal({ t: 'settings' })}><GearIcon /></button>
      {window.planDesktop && <div className="winbtns">
        <button onClick={() => window.planDesktop!.minimize()} title="Свернуть"><svg width="10" height="10"><path d="M1 5.5h8" stroke="currentColor" /></svg></button>
        <button onClick={() => window.planDesktop!.maximize()} title="Развернуть"><svg width="10" height="10"><rect x="1.5" y="1.5" width="7" height="7" fill="none" stroke="currentColor" /></svg></button>
        <button onClick={() => window.planDesktop!.close()} title="Закрыть (в трей)"><svg width="10" height="10"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" /></svg></button>
      </div>}
    </div>
  </header>;

  const switcher = <Switcher view={view} setView={setView} onLink={() => setModal({ t: 'account' })} />;

  return <div className={cls('app', mobile ? 'mobile' : 'desktop')}>
    {header}
    {switcher}
    <Banners />
    {mobile ? <main className="m-main">
      {todayPanel}
      <div className="card m-list">
        {showSide && <MRow icon={<GoalIcon />} label="Цели" count={goals.length} onClick={() => setModal({ t: 'list', which: 'goals' })} />}
        <MRow icon={<LaterIcon />} label="Позже" count={later.length} onClick={() => setModal({ t: 'list', which: 'later' })} />
        {showSide && <MRow icon={<IdeaIcon />} label="Идеи" count={ideas.length} onClick={() => setModal({ t: 'list', which: 'ideas' })} />}
      </div>
    </main> : <main className="d-main">
      <div className="col-left">{todayPanel}<WeekStrip date={date} setDate={setDate} scope={scope} /></div>
      <div className="col-right">
        {showSide && <GoalsPanel goals={goals} tasks={st.tasks} {...ctx} />}
        <LaterPanel later={later} {...ctx} />
        {showSide && <IdeasPanel ideas={ideas} {...ctx} />}
      </div>
    </main>}

    {modal?.t === 'list' && <Sheet title={modal.which === 'goals' ? 'Цели' : modal.which === 'later' ? 'Позже' : 'Идеи'} onClose={() => setModal(null)}>
      {modal.which === 'goals' && <GoalsPanel bare goals={goals} tasks={st.tasks} {...ctx} />}
      {modal.which === 'later' && <LaterPanel bare later={later} {...ctx} />}
      {modal.which === 'ideas' && <IdeasPanel bare ideas={ideas} {...ctx} />}
    </Sheet>}
    {modal?.t === 'task' && <TaskModal task={modal.task} goals={goals} onClose={() => setModal(null)} />}
    {modal?.t === 'goal' && <GoalModal goal={modal.goal} onClose={() => setModal(null)} onTask={t => setModal({ t: 'task', task: t })} />}
    {modal?.t === 'idea' && <IdeaModal idea={modal.idea} date={date} newTask={newTask} onClose={() => setModal(null)} />}
    {modal?.t === 'notif' && <NotifModal onClose={() => setModal(null)} />}
    {modal?.t === 'history' && <HistoryModal onClose={() => setModal(null)} />}
    {modal?.t === 'account' && <AccountModal onClose={() => setModal(null)} />}
    {modal?.t === 'settings' && <SettingsModal onClose={() => setModal(null)} onHistory={() => setModal({ t: 'history' })} />}
  </div>;
}

type Ctx = {
  me: string; view: View; date: string; toggle: (t: Task, d: string | null) => void; addQuick: (s: string, d: string | null) => void;
  reorder: (l: Task[], a: number, b: number) => void; open: (m: ModalState) => void; newTask: (p: Partial<Task>) => Task;
  addGoal: (s: string) => void; addIdea: (s: string) => void;
};

function SyncDot() {
  const { mode, online, pending, syncError } = useStore(s => ({ mode: s.mode, online: s.online, pending: s.pending, syncError: s.syncError }));
  if (mode === 'local') return <span className="sync" title="Локальный режим — данные только на этом устройстве"><i className="dot grey" /></span>;
  const st = !online ? ['grey', 'Нет интернета — работаем офлайн, синхронизируем позже'] : pending ? ['amber', `Синхронизация… (${pending})`] : syncError ? ['amber', syncError] : ['green', 'Всё синхронизировано'];
  return <span className="sync" title={st[1]}><i className={cls('dot', st[0])} /></span>;
}

function Switcher({ view, setView, onLink }: { view: View; setView: (v: View) => void; onLink: () => void }) {
  const { profile, partner, mode } = useStore(s => ({ profile: s.profile, partner: s.partner, mode: s.mode }));
  if (!partner) return <div className="switcher-row"><div className="switcher">
    <button className="sw on"><Avatar name={profile?.name || 'Я'} />Я</button>
    {mode === 'cloud' ? <button className="sw link-partner" onClick={onLink}><Heart />Связать с партнёром</button>
      : <span className="sw dim" title="В локальном режиме партнёра нет"><Heart /> вдвоём — нужен сервер</span>}
  </div></div>;
  return <div className="switcher-row"><div className="switcher">
    <button className={cls('sw', view === 'me' && 'on')} onClick={() => setView('me')}><Avatar name={profile?.name || 'Я'} />Я</button>
    <button className={cls('sw heart-sw', view === 'shared' && 'on')} onClick={() => setView('shared')} title="Общие дела"><Heart filled={view === 'shared'} /><span className="sw-label">Общие</span></button>
    <button className={cls('sw', view === 'partner' && 'on')} onClick={() => setView('partner')}><Avatar name={partner.name} />{partner.name || 'Партнёр'}</button>
  </div></div>;
}
export function Avatar({ name }: { name: string }) {
  const ch = (name || '?').trim().charAt(0).toUpperCase();
  return <span className="avatar">{ch}</span>;
}

// ───────── Сегодня ─────────
function TodayPanel(p: Ctx & { tasks: Task[]; done: number; setDate: (d: string) => void; mobile: boolean }) {
  const { date, tasks, done } = p;
  const t = today();
  const title = date === t ? 'Сегодня' : date === addDays(t, 1) ? 'Завтра' : date === addDays(t, -1) ? 'Вчера' : longDate(date);
  const pct = tasks.length ? Math.round(done / tasks.length * 100) : 0;
  return <section className="card today">
    {p.mobile && <WeekStrip date={date} setDate={p.setDate} compact />}
    <div className="today-head">
      <h1 className={cls(title.length > 10 && 'long')}>{title}</h1>
      <span className="count">{done} / {tasks.length}</span>
    </div>
    <div className="progress"><div style={{ width: pct + '%' }} /></div>
    <TaskList list={tasks} date={date} ctx={p} />
    <QuickAdd placeholder={p.view === 'shared' ? 'Общее дело… (можно «19:00»)' : 'Добавить задачу… (можно «14:00»)'} onAdd={s => p.addQuick(s, date)} />
  </section>;
}

function TaskList({ list, date, ctx, compact }: { list: Task[]; date: string | null; ctx: Ctx; compact?: boolean }) {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const [drag, setDrag] = useState<{ i: number; dy: number; over: number } | null>(null);
  const dragRef = useRef<{ i: number; y0: number; active: boolean; timer: any; moved: boolean; id: number; over: number } | null>(null);

  const onDown = (e: React.PointerEvent, i: number) => {
    if ((e.target as HTMLElement).closest('.check, .prog-wrap')) return;
    if (e.button !== 0) return;
    const touch = e.pointerType !== 'mouse';
    const d = { i, y0: e.clientY, active: false, timer: 0 as any, moved: false, id: e.pointerId, over: i };
    dragRef.current = d;
    if (touch) d.timer = setTimeout(() => { d.active = true; navigator.vibrate?.(10); setDrag({ i, dy: 0, over: i }); }, 320);
    const el = e.currentTarget as HTMLElement;
    const move = (ev: PointerEvent) => {
      const dy = ev.clientY - d.y0;
      if (!d.active) {
        if (Math.abs(dy) > 6) { d.moved = true; if (touch) { clearTimeout(d.timer); cleanup(); return; } d.active = true; }
        else return;
      }
      let idx = i;
      refs.current.forEach((r, j) => { if (!r) return; const b = r.getBoundingClientRect(); if (ev.clientY >= b.top && ev.clientY <= b.bottom) idx = j; });
      d.over = idx;
      setDrag({ i, dy, over: idx });
    };
    const block = (ev: TouchEvent) => { if (d.active) ev.preventDefault(); };
    const up = () => {
      clearTimeout(d.timer);
      const cur = dragRef.current;
      setDrag(null);
      if (cur?.active) ctx.reorder(list, cur.i, cur.over);
      if (cur && !cur.active && !cur.moved) ctx.open({ t: 'task', task: list[i] });
      cleanup();
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel);
      el.removeEventListener('touchmove', block);
      dragRef.current = null;
    };
    const cancel = () => { clearTimeout(d.timer); if (!d.active) cleanup(); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cancel);
    el.addEventListener('touchmove', block, { passive: false });
  };

  if (!list.length) return <div className="empty">{date ? 'На этот день задач нет' : 'Пусто'}</div>;
  return <div className={cls('tasks', compact && 'compact')}>
    {list.map((t, i) => {
      const done = date ? isDoneOn(t, date) : t.done;
      let shift = 0;
      if (drag && i !== drag.i) { const h = refs.current[drag.i]?.offsetHeight || 44; if (drag.i < i && i <= drag.over) shift = -h; if (drag.over <= i && i < drag.i) shift = h; }
      const style = drag?.i === i ? { transform: `translateY(${drag.dy}px)`, zIndex: 5 } : shift ? { transform: `translateY(${shift}px)` } : undefined;
      return <div key={t.id} ref={el => { refs.current[i] = el; }} className={cls('task-item', drag?.i === i && 'dragging')} style={style}>
      <div className={cls('task', done && 'done')} onPointerDown={e => onDown(e, i)}>
        <button className={cls('check', done && 'on')} onClick={() => ctx.toggle(t, date)} aria-label={done ? 'Снять отметку' : 'Выполнено'}>
          <svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <span className="task-title">{t.title}</span>
        <TaskMeta t={t} me={ctx.me} />
        <ProgressButton t={t} done={done} onDone={() => ctx.toggle(t, date)} />
        <span className="grip" aria-hidden><svg viewBox="0 0 10 16" width="8" height="14" fill="currentColor"><circle cx="2.5" cy="3" r="1.4"/><circle cx="7.5" cy="3" r="1.4"/><circle cx="2.5" cy="8" r="1.4"/><circle cx="7.5" cy="8" r="1.4"/><circle cx="2.5" cy="13" r="1.4"/><circle cx="7.5" cy="13" r="1.4"/></svg></span>
      </div>
      <InlineSubs t={t} />
      </div>;
    })}
  </div>;
}

function TaskMeta({ t, me }: { t: Task; me: string }) {
  const { partner } = useStore(s => ({ partner: s.partner }));
  const bits: React.ReactNode[] = [];
  const subs = t.extra?.subtasks || [];
  if (subs.length) bits.push(<span key="s" className="meta-ic" title="Подпункты">{subs.filter(x => x.done).length}/{subs.length}</span>);
  bits.push(<ExtraBadges key="x" t={t} />);
  if (t.repeat) bits.push(<span key="r" className="meta-ic" title={repeatLabel(t.repeat)}>↻</span>);
  if (t.time) bits.push(<span key="t" className="chip">{t.time}</span>);
  if (t.shared) {
    const who = t.assignee_id ? S.nameOf(t.assignee_id) : 'вместе';
    bits.push(<span key="a" className="who">{who}</span>);
  } else if (t.created_by && t.created_by !== t.owner_id && partner) {
    bits.push(<span key="c" className="who" title={`Добавил(а) ${S.nameOf(t.created_by)}`}>от {S.nameOf(t.created_by)}</span>);
  }
  void me;
  return <span className="meta">{bits}</span>;
}

function QuickAdd({ placeholder, onAdd }: { placeholder: string; onAdd: (s: string) => void }) {
  const [v, setV] = useState('');
  return <form className="quick" onSubmit={e => { e.preventDefault(); if (v.trim()) { onAdd(v.trim()); setV(''); } }}>
    <span className="plus">+</span>
    <input value={v} onChange={e => setV(e.target.value)} placeholder={placeholder} enterKeyHint="done" />
  </form>;
}

// ───────── Неделя ─────────
function WeekStrip({ date, setDate, scope, compact }: { date: string; setDate: (d: string) => void; scope?: Task[]; compact?: boolean }) {
  const start = weekStart(date);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const t = today();
  const pick = useRef<HTMLInputElement>(null);
  const d0 = parseIso(start);
  return <div className={cls('week', compact ? 'compact' : 'card')}>
    <button className="wk-arrow" onClick={() => setDate(addDays(date, -7))} aria-label="Предыдущая неделя">‹</button>
    <div className="wk-days">
      {days.map((d, i) => {
        const has = scope?.some(x => occursOn(x, d) && !isDoneOn(x, d));
        return <button key={d} className={cls('wk-day', d === date && 'on', d === t && 'is-today')} onClick={() => setDate(d)}>
          <span className="wk-dow">{DOW[i]}</span><span className="wk-num">{parseIso(d).getDate()}</span>
          {has && d !== date && <i className="wk-dot" />}
        </button>;
      })}
    </div>
    <button className="wk-arrow" onClick={() => setDate(addDays(date, 7))} aria-label="Следующая неделя">›</button>
    <button className="wk-month" onClick={() => { const el = pick.current; if (!el) return; try { (el as any).showPicker(); } catch { el.click(); } }} title="Выбрать дату">
      {MONTHS[d0.getMonth()].slice(0, 3)}
      <input ref={pick} type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)} tabIndex={-1} />
    </button>
  </div>;
}

// ───────── Правая колонка ─────────
function Panel({ title, icon, children, onAdd, addPh, bare }: { title: string; icon?: React.ReactNode; children: React.ReactNode; onAdd?: (s: string) => void; addPh?: string; bare?: boolean }) {
  const [adding, setAdding] = useState(false); const [v, setV] = useState('');
  const form = onAdd && (adding || bare) && <form className="quick small" onSubmit={e => { e.preventDefault(); if (v.trim()) { onAdd(v.trim()); setV(''); } }}>
    <span className="plus">+</span><input autoFocus={!bare} value={v} onChange={e => setV(e.target.value)} placeholder={addPh} onBlur={() => !v && setAdding(false)} enterKeyHint="done" />
  </form>;
  if (bare) return <div className="panel-bare">{children}{form}</div>;
  return <section className="card panel">
    <div className="panel-head"><h2>{icon && <span className="p-ic">{icon}</span>}{title}</h2>{onAdd && <button className="add-btn" onClick={() => setAdding(true)} title="Добавить">+</button>}</div>
    {children}{form}
  </section>;
}

function GoalsPanel({ goals, tasks, open, addGoal, bare }: Ctx & { goals: Goal[]; tasks: Task[]; bare?: boolean }) {
  return <Panel title="Цели" icon={<GoalIcon />} onAdd={addGoal} addPh="Новая цель" bare={bare}>
    {goals.length ? <ul className="bullets">{goals.map(g => {
      const linked = tasks.filter(t => t.goal_id === g.id).length;
      return <li key={g.id} onClick={() => open({ t: 'goal', goal: g })}>
        <span className="b-text">{g.title}</span>
        {(g.progress > 0 || linked > 0) && <span className="g-prog"><i style={{ width: g.progress + '%' }} /></span>}
      </li>;
    })}</ul> : <div className="empty small">Пока нет целей</div>}
  </Panel>;
}
function LaterPanel({ later, toggle, open, addQuick, bare }: Ctx & { later: Task[]; bare?: boolean }) {
  return <Panel title="Позже" icon={<HourglassIcon />} onAdd={s => addQuick(s, null)} addPh="Без даты" bare={bare}>
    {later.length ? <div className="later">{later.map(t => <div key={t.id} className={cls('later-row', t.done && 'done')} onClick={e => { if (!(e.target as HTMLElement).closest('.check')) open({ t: 'task', task: t }); }}>
      <button className={cls('check sm', t.done && 'on')} onClick={() => toggle(t, null)}><svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
      <span>{t.title}</span>
    </div>)}</div> : <div className="empty small">Здесь задачи без даты</div>}
  </Panel>;
}
function IdeasPanel({ ideas, open, addIdea, bare }: Ctx & { ideas: Idea[]; bare?: boolean }) {
  return <Panel title="Идеи" icon={<IdeaIcon />} onAdd={addIdea} addPh="Мысль, план, идея" bare={bare}>
    {ideas.length ? <ul className="bullets">{ideas.map(i => <li key={i.id} onClick={() => open({ t: 'idea', idea: i })}><span className="b-text">{i.text}</span></li>)}</ul>
      : <div className="empty small">Записывайте сюда всё, что придёт в голову</div>}
  </Panel>;
}

function MRow({ icon, label, count, onClick }: { icon: React.ReactNode; label: string; count: number; onClick: () => void }) {
  return <button className="m-row" onClick={onClick}><span className="m-ic">{icon}</span><span className="m-label">{label}</span>{count > 0 && <span className="m-count">{count}</span>}<span className="chev">›</span></button>;
}

// ───────── Иконки ─────────
const BellIcon = () => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M6 16V11a6 6 0 1112 0v5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 004 0" /></svg>;
const UserIcon = () => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="12" cy="8" r="4" /><path d="M4.5 20c1.3-3.6 4.2-5.5 7.5-5.5s6.2 1.9 7.5 5.5" /></svg>;
const GearIcon = () => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></svg>;
const HourglassIcon = () => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9" /></svg>;
const GoalIcon = () => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="0.8" fill="currentColor" /></svg>;
const LaterIcon = () => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="4" y="5" width="16" height="15" rx="2.5" /><path d="M4 10h16M9 3v4M15 3v4" /></svg>;
const IdeaIcon = () => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M9 17h6M10 20h4M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z" /></svg>;

export { Modal, relDate, timeAgo, iso };
