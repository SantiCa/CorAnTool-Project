// Real desktop entry point with an isolated test profile and hidden windows.
const { app } = require('electron');
const path = require('node:path');
if (!process.env.CORANTOOL_TEST_PROFILE) throw new Error('Missing isolated test profile');
app.setPath('userData', process.env.CORANTOOL_TEST_PROFILE);
app.on('browser-window-created', (_event, win) => win.hide());
app.on('window-all-closed', () => app.quit());
require(path.resolve(__dirname, '../../desktop/main.js'));
