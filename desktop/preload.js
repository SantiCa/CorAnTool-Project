// V0.17: bridge between the app page and the desktop program (training on this computer). Nothing else is exposed.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('corantoolDesktop', {
  trainer: {
    status: () => ipcRenderer.invoke('trainer:status'),
    install: () => ipcRenderer.invoke('trainer:install'),
    train: (opt) => ipcRenderer.invoke('trainer:train', opt),
    cancel: () => ipcRenderer.invoke('trainer:cancel'),
    readModel: (name) => ipcRenderer.invoke('trainer:readModel', name),
    unfinished: (name) => ipcRenderer.invoke('trainer:unfinished', name),
    openFolder: () => ipcRenderer.invoke('trainer:openFolder'),
    onEvent: (cb) => { const f = (_e, type, data) => cb(type, data); ipcRenderer.on('trainer:event', f); return () => ipcRenderer.removeListener('trainer:event', f); },
  },
});
