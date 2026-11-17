const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('planDesktop', {
  isDesktop: true,
  version: ipcRenderer.sendSync('version-sync'),
  minimize: () => ipcRenderer.send('win', 'min'),
  maximize: () => ipcRenderer.send('win', 'max'),
  close: () => ipcRenderer.send('win', 'close'),
  notify: (title, body) => ipcRenderer.send('notify', { title, body }),
  setTheme: (t) => ipcRenderer.send('theme', t),
  checkUpdate: (feed) => ipcRenderer.invoke('upd-check', feed),
  downloadUpdate: () => ipcRenderer.invoke('upd-download'),
  installUpdate: () => ipcRenderer.send('upd-install'),
  onUpdate: (cb) => { const h = (_e, d) => cb(d); ipcRenderer.on('upd', h); return () => ipcRenderer.removeListener('upd', h); },
});
