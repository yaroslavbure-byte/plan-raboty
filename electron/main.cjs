const { app, BrowserWindow, Tray, Menu, ipcMain, Notification, nativeImage, shell, screen } = require('electron');
const path = require('path');
const fs = require('fs');

app.setAppUserModelId('app.plan.raboty');
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

let win = null, tray = null, quitting = false;
const statePath = () => path.join(app.getPath('userData'), 'window.json');
function loadBounds() {
  try {
    const b = JSON.parse(fs.readFileSync(statePath(), 'utf8'));
    const area = screen.getDisplayMatching(b).workArea;
    if (b.x >= area.x - 50 && b.y >= area.y - 50 && b.x < area.x + area.width && b.y < area.y + area.height) return b;
  } catch {}
  return { width: 1120, height: 720 };
}
function saveBounds() {
  if (!win || win.isMinimized()) return;
  try { fs.writeFileSync(statePath(), JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() })); } catch {}
}

function createWindow() {
  const b = loadBounds();
  win = new BrowserWindow({
    ...b, minWidth: 380, minHeight: 520, frame: false, show: false, backgroundColor: '#efdcc7',
    title: 'План работы', icon: path.join(__dirname, 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, spellcheck: true },
  });
  if (b.maximized) win.maximize();
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  win.once('ready-to-show', () => { if (!process.argv.includes('--hidden')) win.show(); });
  win.on('close', (e) => { saveBounds(); if (!quitting) { e.preventDefault(); win.hide(); } });
  win.on('resize', saveBounds); win.on('move', saveBounds);
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}
function show() { if (!win) return; if (win.isMinimized()) win.restore(); win.show(); win.focus(); }

app.on('second-instance', show);
app.whenReady().then(() => {
  createWindow();
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'tray.png')).resize({ width: 16, height: 16 }));
  tray.setToolTip('План работы');
  const autostart = () => app.getLoginItemSettings().openAtLogin;
  const menu = () => Menu.buildFromTemplate([
    { label: 'Открыть', click: show },
    { label: 'Запускать вместе с Windows', type: 'checkbox', checked: autostart(),
      click: (i) => { app.setLoginItemSettings({ openAtLogin: i.checked, args: ['--hidden'] }); } },
    { type: 'separator' },
    { label: 'Выход', click: () => { quitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu());
  tray.on('right-click', () => tray.setContextMenu(menu()));
  tray.on('click', show);
});
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => {});

ipcMain.on('win', (_e, cmd) => {
  if (!win) return;
  if (cmd === 'min') win.minimize();
  else if (cmd === 'max') win.isMaximized() ? win.unmaximize() : win.maximize();
  else if (cmd === 'close') win.close();
});
ipcMain.on('notify', (_e, { title, body }) => {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, icon: path.join(__dirname, 'icon.png'), silent: false });
  n.on('click', show);
  n.show();
});
// ───────── Обновления ─────────
let updater = null;
function getUpdater() {
  if (updater) return updater;
  updater = require('electron-updater').autoUpdater;
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = true;
  const send = (e) => win && win.webContents.send('upd', e);
  updater.on('checking-for-update', () => send({ state: 'checking' }));
  updater.on('update-available', (i) => send({ state: 'available', version: i.version }));
  updater.on('update-not-available', () => send({ state: 'none' }));
  updater.on('download-progress', (p) => send({ state: 'progress', percent: p.percent }));
  updater.on('update-downloaded', (i) => send({ state: 'ready', version: i.version }));
  updater.on('error', (err) => send({ state: 'error', error: String(err && err.message || err).split('\n')[0] }));
  return updater;
}
ipcMain.handle('upd-check', async (_e, feed) => {
  if (!app.isPackaged) throw new Error('Обновления работают только в установленной версии');
  const u = getUpdater();
  u.setFeedURL({ provider: 'generic', url: feed });
  await u.checkForUpdates();
});
ipcMain.handle('upd-download', async () => { await getUpdater().downloadUpdate(); });
ipcMain.on('upd-install', () => { quitting = true; getUpdater().quitAndInstall(false, true); });
ipcMain.on('theme', (_e, t) => { if (win) win.setBackgroundColor(t === 'night' ? '#151411' : '#efdcc7'); });

ipcMain.on('version-sync', (e) => { e.returnValue = app.getVersion(); });
