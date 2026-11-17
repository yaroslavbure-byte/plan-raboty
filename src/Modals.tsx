import { useEffect, useMemo, useState } from 'react';
import * as S from './store';
import { useStore } from './store';
import { Modal } from './Modal';
import { SubtaskEditor, LinkEditor, MediaEditor, NotesEditor } from './Extras';
import { removeRemote } from './media';
import { getThemePref, setThemePref, type ThemePref } from './theme';
import type { Goal, Idea, Task } from './types';
import { addDays, cls, DOW, relDate, repeatLabel, shortDate, timeAgo, today } from './util';

// ───────── Задача ─────────
export function TaskModal({ task, goals, onClose }: { task: Task; goals: Goal[]; onClose: () => void }) {
  const { partner, userId } = useStore(s => ({ partner: s.partner, userId: s.userId }));
  const [title, setTitle] = useState(task.title);
  const [date, setDate] = useState<string | null>(task.date);
  const [time, setTime] = useState(task.time || '');
  const initialRepeat = task.repeat?.startsWith('days:') ? 'days' : task.repeat || '';
  const [repeat, setRepeat] = useState<string>(initialRepeat);
  const [days, setDays] = useState<number[]>(task.repeat?.startsWith('days:') ? task.repeat.slice(5).split(',').map(Number) : []);
  const [goal, setGoal] = useState(task.goal_id || '');
  const [assignee, setAssignee] = useState(task.assignee_id || '');
  const [shared, setShared] = useState(task.shared);
  const t = today();

  const commit = () => {
    if (!title.trim()) return;
    const rep = !date ? null : repeat === 'days' ? (days.length ? 'days:' + [...days].sort().join(',') : null) : (repeat || null);
    const cur = S.getState().tasks.find(x => x.id === task.id) || task; // свежие подпункты/вложения
    S.save('tasks', { ...cur, title: title.trim(), date, time: time || null, repeat: rep, goal_id: goal || null, assignee_id: shared ? (assignee || null) : null, shared });
    onClose();
  };
  const del = () => {
    const cur = S.getState().tasks.find(x => x.id === task.id) || task;
    if ((cur.extra?.files?.length || 0) > 0 && !confirm('Удалить задачу вместе с прикреплёнными видео?')) return;
    (cur.extra?.files || []).forEach(f => removeRemote(f).catch(() => {}));
    S.remove('tasks', cur); onClose();
  };
  const author = task.created_by ? S.nameOf(task.created_by) : '';
  const editor = task.updated_by && task.updated_by !== task.created_by ? S.nameOf(task.updated_by) : '';

  return <Modal title="Задача" onClose={onClose} footer={<>
    <button className="btn danger-ghost" onClick={del}>Удалить</button>
    <span className="grow" />
    <button className="btn primary" onClick={commit}>Сохранить</button>
  </>}>
    <input className="title-input" value={title} onChange={e => setTitle(e.target.value)} autoFocus={!task.title} onKeyDown={e => e.key === 'Enter' && commit()} placeholder="Что нужно сделать" />
    <NotesEditor task={task} />
    <div className="chips-row">
      <button className={cls('pill', date === t && 'on')} onClick={() => setDate(t)}>Сегодня</button>
      <button className={cls('pill', date === addDays(t, 1) && 'on')} onClick={() => setDate(addDays(t, 1))}>Завтра</button>
      <button className={cls('pill', !date && 'on')} onClick={() => setDate(null)}>Позже</button>
      <label className={cls('pill date-pill', date && date !== t && date !== addDays(t, 1) && 'on')}>
        {date && date !== t && date !== addDays(t, 1) ? shortDate(date) : 'Дата…'}
        <input type="date" value={date || ''} onChange={e => setDate(e.target.value || null)} />
      </label>
    </div>
    <div className="form-grid">
      <label className="field"><span>Время</span>
        <div className="row-gap"><input type="time" value={time} onChange={e => setTime(e.target.value)} />{time && <button className="link" onClick={() => setTime('')}>убрать</button>}</div>
      </label>
      <label className="field"><span>Повтор</span>
        <select value={repeat} onChange={e => setRepeat(e.target.value)} disabled={!date}>
          <option value="">Не повторять</option><option value="daily">Каждый день</option><option value="weekly">Каждую неделю</option><option value="days">По дням недели</option>
        </select>
      </label>
    </div>
    {repeat === 'days' && date && <div className="chips-row">{DOW.map((d, i) => <button key={d} className={cls('pill sm', days.includes(i + 1) && 'on')} onClick={() => setDays(days.includes(i + 1) ? days.filter(x => x !== i + 1) : [...days, i + 1])}>{d}</button>)}</div>}
    {!date && <div className="hint">Без даты — задача лежит в «Позже». Выберите день, чтобы перенести её в расписание.</div>}
    {goals.length > 0 && <label className="field"><span>Цель</span>
      <select value={goal} onChange={e => setGoal(e.target.value)}><option value="">—</option>{goals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}</select>
    </label>}
    {partner && task.owner_id === userId && <label className="check-line"><input type="checkbox" checked={shared} onChange={e => setShared(e.target.checked)} /> Общее дело (видно обоим)</label>}
    {shared && partner && <label className="field"><span>Кто делает</span>
      <select value={assignee} onChange={e => setAssignee(e.target.value)}>
        <option value="">Вместе</option><option value={userId!}>{S.nameOf(userId)}</option><option value={partner.id}>{partner.name}</option>
      </select>
    </label>}
    <SubtaskEditor task={task} />
    <LinkEditor task={task} />
    <MediaEditor task={task} />
    {task.repeat && <div className="hint">↻ {repeatLabel(task.repeat)} · выполнено раз: {task.done_dates.length}</div>}
    {author && task.created_at && <div className="byline">Добавил(а) {author} · {timeAgo(task.created_at)}{editor ? ` · изменил(а) ${editor}` : ''}</div>}
  </Modal>;
}

// ───────── Цель ─────────
export function GoalModal({ goal, onClose, onTask }: { goal: Goal; onClose: () => void; onTask: (t: Task) => void }) {
  const tasks = useStore(s => s.tasks);
  const [title, setTitle] = useState(goal.title);
  const [progress, setProgress] = useState(goal.progress);
  const linked = tasks.filter(t => t.goal_id === goal.id);
  const commit = () => { if (title.trim()) S.save('goals', { ...goal, title: title.trim(), progress }); onClose(); };
  return <Modal title="Цель" onClose={onClose} footer={<>
    <button className="btn danger-ghost" onClick={() => { S.remove('goals', goal); onClose(); }}>Удалить</button>
    <span className="grow" /><button className="btn primary" onClick={commit}>Сохранить</button>
  </>}>
    <input className="title-input" value={title} onChange={e => setTitle(e.target.value)} />
    <label className="field"><span>Прогресс — {progress}%</span>
      <input type="range" min={0} max={100} step={5} value={progress} onChange={e => setProgress(Number(e.target.value))} />
    </label>
    <div className="sub-head">Связанные задачи</div>
    {linked.length ? <div className="mini-list">{linked.map(t => <button key={t.id} className={cls('mini-row', t.done && 'done')} onClick={() => onTask(t)}>
      <span>{t.title}</span><span className="muted">{t.repeat ? repeatLabel(t.repeat) : relDate(t.date)}</span></button>)}</div>
      : <div className="hint">Привяжите задачу к цели в окне задачи (поле «Цель»).</div>}
  </Modal>;
}

// ───────── Идея ─────────
export function IdeaModal({ idea, date, newTask, onClose }: { idea: Idea; date: string; newTask: (p: Partial<Task>) => Task; onClose: () => void }) {
  const [text, setText] = useState(idea.text);
  const save = () => { if (text.trim()) S.save('ideas', { ...idea, text: text.trim() }); onClose(); };
  const toTask = (d: string | null) => {
    const t = newTask({ title: text.trim(), date: d });
    t.owner_id = idea.owner_id; t.shared = false;
    S.save('tasks', t); S.remove('ideas', idea); S.toast(d ? `Задача добавлена на ${relDate(d)}` : 'Задача добавлена в «Позже»'); onClose();
  };
  return <Modal title="Идея" onClose={onClose} footer={<>
    <button className="btn danger-ghost" onClick={() => { S.remove('ideas', idea); onClose(); }}>Удалить</button>
    <span className="grow" /><button className="btn primary" onClick={save}>Сохранить</button>
  </>}>
    <textarea value={text} onChange={e => setText(e.target.value)} rows={4} />
    <div className="sub-head">Превратить в задачу</div>
    <div className="chips-row">
      <button className="pill" onClick={() => toTask(date)}>{date === today() ? 'На сегодня' : `На ${relDate(date)}`}</button>
      <button className="pill" onClick={() => toTask(addDays(today(), 1))}>На завтра</button>
      <button className="pill" onClick={() => toTask(null)}>В «Позже»</button>
    </div>
  </Modal>;
}

// ───────── Уведомления ─────────
export function NotifModal({ onClose }: { onClose: () => void }) {
  const notifs = useStore(s => s.notifications);
  const mode = useStore(s => s.mode);
  const [snapshot] = useState(() => new Set(notifs.filter(n => !n.read).map(n => n.id)));
  useEffect(() => { S.markAllRead(); }, []);
  return <Modal title="Уведомления" onClose={onClose}>
    {mode === 'local' && <div className="hint">В локальном режиме уведомлений нет — они приходят, когда партнёр меняет ваш план.</div>}
    {notifs.length ? <div className="feed">{notifs.map(n => <div key={n.id} className={cls('feed-row', snapshot.has(n.id) && 'new')}>
      <div>{S.notifText(n)}</div><div className="muted small">{timeAgo(n.created_at)}</div>
    </div>)}</div> : mode === 'cloud' && <div className="empty">Пока тихо</div>}
  </Modal>;
}

// ───────── История ─────────
const ACT: Record<string, string> = { attached: 'прикрепил(а) видео к', added: 'добавил(а)', completed: 'выполнил(а)', uncompleted: 'вернул(а) в работу', edited: 'изменил(а)', deleted: 'удалил(а)', moved: 'перенёс(ла)' };
export function HistoryModal({ onClose }: { onClose: () => void }) {
  const { tasks, activity } = useStore(s => ({ tasks: s.tasks, activity: s.activity }));
  const [tab, setTab] = useState<'done' | 'changes'>('done');
  const done = useMemo(() => {
    const out: { key: string; title: string; when: string; who: string }[] = [];
    tasks.forEach(t => {
      if (t.repeat) t.done_dates.forEach(d => out.push({ key: t.id + d, title: t.title, when: d, who: S.nameOf(t.owner_id) }));
      else if (t.done) out.push({ key: t.id, title: t.title, when: (t.done_at || t.updated_at || '').slice(0, 10) || (t.date ?? ''), who: S.nameOf(t.owner_id) });
    });
    return out.sort((a, b) => b.when.localeCompare(a.when)).slice(0, 150);
  }, [tasks]);
  return <Modal title="История" onClose={onClose}>
    <div className="seg">
      <button className={cls(tab === 'done' && 'on')} onClick={() => setTab('done')}>Выполненные</button>
      <button className={cls(tab === 'changes' && 'on')} onClick={() => setTab('changes')}>Изменения</button>
    </div>
    {tab === 'done' ? (done.length ? <div className="feed">{done.map(d => <div key={d.key} className="feed-row">
      <div>✓ {d.title}</div><div className="muted small">{d.when ? relDate(d.when) : ''}{d.who ? ` · ${d.who}` : ''}</div></div>)}</div> : <div className="empty">Пока ничего не выполнено</div>)
      : (activity.length ? <div className="feed">{activity.map(a => <div key={a.id} className="feed-row">
        <div><b>{S.nameOf(a.actor_id) || '—'}</b> {ACT[a.action] || a.action}: {a.title}{a.shared ? ' (общее)' : a.plan_owner !== a.actor_id ? ` — в плане ${S.nameOf(a.plan_owner)}` : ''}</div>
        <div className="muted small">{timeAgo(a.created_at)}</div></div>)}</div> : <div className="empty">Изменений пока нет</div>)}
  </Modal>;
}

// ───────── Аккаунт и пара ─────────
export function AccountModal({ onClose }: { onClose: () => void }) {
  const st = useStore(s => s);
  const [name, setName] = useState(st.profile?.name || '');
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const run = async (f: () => Promise<any>, ok?: string) => { setErr(''); setMsg(''); setBusy(true); try { await f(); if (ok) setMsg(ok); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const push = S.pushSupport();
  const pushOn = localStorage.getItem('plan:push') === '1';
  const cfg = S.getConfig();
  return <Modal title="Аккаунт и пара" onClose={onClose}>
    <label className="field"><span>Ваше имя</span>
      <div className="row-gap"><input value={name} onChange={e => setName(e.target.value)} />
        {name.trim() && name !== st.profile?.name && <button className="btn sm" disabled={busy} onClick={() => run(() => S.updateName(name.trim()), 'Сохранено')}>OK</button>}</div>
    </label>
    {st.email && <div className="muted small">{st.email}</div>}

    {st.mode === 'cloud' ? <>
      <div className="sub-head">Партнёр</div>
      {st.partner ? <div className="pair-box">
        <div>Связаны с <b>{st.partner.name}</b> <span className="heart-inline">♥</span></div>
        <button className="link danger" disabled={busy} onClick={() => confirm('Отвязать аккаунты? Доступ к планам друг друга пропадёт.') && run(S.unlinkPartner, 'Аккаунты отвязаны')}>Отвязать</button>
      </div> : <>
        <div className="hint">Отправьте свой код партнёру — он вводит его у себя. Или введите код партнёра здесь.</div>
        <div className="code-box">
          <span className="code">{st.profile?.invite_code || '……'}</span>
          <button className="btn sm" onClick={() => { navigator.clipboard?.writeText(st.profile?.invite_code || ''); setMsg('Код скопирован'); }}>Копировать</button>
        </div>
        <div className="row-gap">
          <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Код партнёра" maxLength={8} />
          <button className="btn primary sm" disabled={busy || code.length < 4} onClick={() => run(() => S.linkPartner(code), 'Готово! Аккаунты связаны')}>Связать</button>
        </div>
      </>}

      <div className="sub-head">Уведомления</div>
      {window.planDesktop ? <div className="hint">На Windows уведомления показываются системой, пока приложение запущено (в том числе свёрнутым в трей).</div>
        : push.ok ? (pushOn ? <div className="hint">Push-уведомления включены на этом устройстве.</div>
          : <button className="btn" disabled={busy} onClick={() => run(S.enablePush, 'Push-уведомления включены')}>Включить push-уведомления</button>)
          : <div className="hint">{push.reason}</div>}
      <div className="hint">Колокольчик в шапке — внутренний центр уведомлений, работает всегда.</div>

      <div className="sub-head">Синхронизация</div>
      <div className="hint">{!st.online ? 'Нет интернета. Изменения сохраняются на устройстве и отправятся автоматически.' : st.pending ? `Отправляется изменений: ${st.pending}` : st.syncError ? `Ошибка: ${st.syncError}` : 'Всё синхронизировано.'}</div>
      <div className="muted small">Сервер: {cfg?.url}</div>
    </> : <>
      <div className="sub-head">Локальный режим</div>
      <div className="hint">Данные хранятся только на этом устройстве. Чтобы пользоваться вдвоём и синхронизировать, подключите сервер Supabase.</div>
      <button className="btn" onClick={() => { localStorage.removeItem('plan:mode'); location.reload(); }}>Подключить сервер</button>
    </>}

    {err && <div className="err">{err}</div>}
    {msg && <div className="info">{msg}</div>}
    <div className="acc-foot">
      {st.mode === 'cloud' && <button className="btn ghost" onClick={() => S.signOut()}>Выйти</button>}
      {st.mode === 'cloud' && <button className="link" onClick={() => confirm('Сменить сервер? Потребуется войти заново.') && S.setConfig(null)}>Сменить сервер</button>}
      <span className="muted small">v{window.planDesktop?.version || __APP_VERSION__}</span>
    </div>
  </Modal>;
}
declare const __APP_VERSION__: string;

// ───────── Настройки ─────────
export function SettingsModal({ onClose, onHistory }: { onClose: () => void; onHistory: () => void }) {
  const mode = useStore(s => s.mode);
  const [theme, setTheme] = useState<ThemePref>(getThemePref());
  const [upd, setUpd] = useState<S.UpdEvent | null>(null);
  const [busy, setBusy] = useState(false);
  const [feed, setFeed] = useState(localStorage.getItem('plan:updateUrl') || '');
  const desk = window.planDesktop;
  const version = desk?.version || __APP_VERSION__;
  useEffect(() => desk?.onUpdate?.(e => setUpd(e)), []);

  const pick = (t: ThemePref) => { setTheme(t); setThemePref(t); };
  const check = async () => {
    if (desk?.checkUpdate) {
      const f = S.updateFeed();
      if (!f) { setUpd({ state: 'error', error: 'Сначала укажите адрес обновлений ниже.' }); return; }
      setUpd({ state: 'checking' });
      try { await desk.checkUpdate(f); } catch (e: any) { setUpd({ state: 'error', error: String(e.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, '') }); }
    } else {
      setBusy(true);
      try { const r = await navigator.serviceWorker?.getRegistration(); await r?.update(); } catch { /* */ }
      location.reload();
    }
  };
  const updText = !upd ? '' : upd.state === 'checking' ? 'Проверяю…' : upd.state === 'none' ? 'У вас последняя версия.' :
    upd.state === 'available' ? `Доступна версия ${upd.version}.` : upd.state === 'progress' ? `Загрузка… ${Math.round(upd.percent || 0)}%` :
    upd.state === 'ready' ? `Версия ${upd.version} загружена.` : `Не удалось: ${upd.error}`;

  return <Modal title="Настройки" onClose={onClose}>
    <div className="sub-head">Тема</div>
    <div className="themes">
      {([['warm', 'Тёплая'], ['night', 'Ночная'], ['system', 'Как в системе']] as [ThemePref, string][]).map(([k, label]) =>
        <button key={k} className={cls('theme-card', theme === k && 'on')} onClick={() => pick(k)}>
          <span className={cls('theme-prev', 'tp-' + k)}><i /><i /></span>
          <span>{label}</span>
        </button>)}
    </div>

    <div className="sub-head">Обновление</div>
    <div className="upd-row">
      <span className="muted">Версия {version}</span>
      {upd?.state === 'available' ? <button className="btn primary sm" onClick={() => { setUpd({ state: 'progress', percent: 0 }); desk?.downloadUpdate?.().catch(e => setUpd({ state: 'error', error: e.message })); }}>Скачать</button>
        : upd?.state === 'ready' ? <button className="btn primary sm" onClick={() => desk?.installUpdate?.()}>Перезапустить и установить</button>
          : <button className="btn sm" disabled={busy || upd?.state === 'checking' || upd?.state === 'progress'} onClick={check}>{desk ? 'Проверить обновления' : 'Обновить приложение'}</button>}
    </div>
    {upd?.state === 'progress' && <div className="progress thin"><div style={{ width: (upd.percent || 0) + '%' }} /></div>}
    {updText && <div className={upd?.state === 'error' ? 'err' : 'hint'}>{updText}</div>}
    {!desk && <div className="hint">Загружает последнюю версию с сайта. Данные и вход сохраняются.</div>}
    {desk && <div className="more">
      <label className="field"><span>Адрес обновлений</span>
        <input value={feed} placeholder="https://github.com/ИМЯ/plan-raboty-releases/releases/latest/download" onChange={e => { setFeed(e.target.value); if (e.target.value.trim()) localStorage.setItem('plan:updateUrl', e.target.value.trim()); else localStorage.removeItem('plan:updateUrl'); }} />
      </label>
      <div className="hint">Папка, где лежат latest.yml и установщик (например, релизы GitHub). Задачи и вход при обновлении сохраняются.</div>
    </div>}

    <div className="sub-head">Данные</div>
    <div className="chips-row">
      {mode === 'cloud' && <button className="pill" disabled={busy} onClick={async () => { setBusy(true); await S.syncNow(); setBusy(false); S.toast('Синхронизировано'); }}>Синхронизировать сейчас</button>}
      <button className="pill" onClick={onHistory}>История</button>
    </div>
  </Modal>;
}
