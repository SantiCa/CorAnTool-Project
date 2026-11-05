// CorAnTool desktop (V31): the web application in its own window, with more memory and its data on disk.
// - The page is served from the app:// scheme (ES modules, IndexedDB and fetch work as on a web server).
// - The renderer may use up to ~75 % of the computer's RAM for JavaScript (images live outside that limit);
//   beyond physical RAM the operating system pages memory to disk (SSD) as for any program.
// - Projects are stored in IndexedDB inside the user-data folder (on disk), not in a browser profile.
const { app, BrowserWindow, protocol, net, shell, session, ipcMain } = require('electron');
const { Trainer } = require('./trainer');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');

const heapMB = Math.max(2048, Math.min(32768, Math.floor((os.totalmem() / 2 ** 20) * 0.75)));
app.commandLine.appendSwitch('js-flags', `--max-old-space-size=${heapMB}`);

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
const WEB = path.join(__dirname, 'web');

function createWindow() {
  const win = new BrowserWindow({
    width: 1500, height: 950, minWidth: 900, minHeight: 600, title: 'CorAnTool', backgroundColor: '#ecefee',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: false, preload: path.join(__dirname, 'preload.js') },
  });
  win.removeMenu();
  win.loadURL('app://corantool/app/index.html');
  // external links open in the system browser; the app's own floating windows stay inside
  win.webContents.setWindowOpenHandler(({ url }) => (url.startsWith('app://') ? { action: 'allow', overrideBrowserWindowOptions: { width: 1200, height: 850, autoHideMenuBar: true } } : (shell.openExternal(url), { action: 'deny' })));
  return win;
}

app.whenReady().then(() => {
  protocol.handle('app', (req) => {
    const u = new URL(req.url), rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
    const file = path.normalize(path.join(WEB, rel));
    if (!file.startsWith(WEB)) return new Response('forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  // keep the project library: ask Chromium to treat the storage as persistent
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(['persistent-storage', 'clipboard-sanitized-write', 'fileSystem'].includes(perm)));
  setupTrainer();
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

/* V0.17: U-Net training on this computer (see trainer.js). The Python source travels as an extra resource. */
function setupTrainer() {
  const pySrc = app.isPackaged ? path.join(process.resourcesPath, 'python') : path.join(__dirname, 'python');
  const send = (type, data) => { for (const w of BrowserWindow.getAllWindows()) w.webContents.send('trainer:event', type, data); };
  const tr = new Trainer({ root: path.join(app.getPath('userData'), 'trainer'), pySrc, send });
  const fromApp = (e) => new URL(e.senderFrame.url).protocol === 'app:';   // only the program's own pages
  const handle = (ch, fn) => ipcMain.handle(ch, (e, ...a) => { if (!fromApp(e)) throw new Error('forbidden'); return fn(...a); });
  handle('trainer:status', () => tr.status());
  handle('trainer:install', () => tr.install());
  handle('trainer:train', (opt) => tr.train(opt));
  handle('trainer:cancel', () => tr.cancel());
  handle('trainer:readModel', (name) => tr.readModel(name));
  handle('trainer:unfinished', (name) => tr.unfinished(name));
  handle('trainer:openFolder', () => shell.openPath(tr.root));
}
