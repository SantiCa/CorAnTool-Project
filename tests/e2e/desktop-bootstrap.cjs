// Real desktop entry point with an isolated test profile and hidden windows.
const { app } = require('electron');
const path = require('node:path');
const profile = process.env.SEDCORETOOL_TEST_PROFILE || process.env.CORANTOOL_TEST_PROFILE;
if (!profile) throw new Error('Missing isolated test profile');
app.setPath('userData', profile);
app.on('browser-window-created', (_event, win) => win.hide());
app.on('window-all-closed', () => app.quit());
require(path.resolve(__dirname, '../../desktop/main.js'));
