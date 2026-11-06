// Builds the installers for the current operating system with electron-builder.
// Version = delivery number (V31 → 31.0.0); files named SedCoreTool-V31-<os>-<arch>.<ext>.
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
execSync('node scripts/prepare.js', { stdio: 'inherit', cwd: path.resolve(__dirname, '..') });
const V = fs.readFileSync(path.resolve(__dirname, '..', 'web', 'DELIVERY'), 'utf8').trim(), n = ((V.match(/\d+/g) || ['0']).concat('0', '0')).slice(0, 3).map(Number).join('.');   // V0.2 → 0.2.0
const builder = require('electron-builder');
const config = {
  appId: 'org.sedcoretool.app', productName: 'SedCoreTool', copyright: 'Santiago Casanova-Arenillas',
  extraMetadata: { version: n },
  artifactName: `SedCoreTool-${V}-\${os}-\${arch}.\${ext}`,
  files: ['main.js', 'preload.js', 'trainer.js', 'web/**', 'build/icon.png', 'package.json'],
  extraResources: [{ from: 'python', to: 'python' }],   // V0.17: Python package source for the training module
  directories: { output: 'dist', buildResources: 'build' },
  win: { target: [{ target: 'nsis', arch: ['x64'] }, { target: 'portable', arch: ['x64'] }], icon: 'build/icon.png' },
  nsis: { oneClick: false, allowToChangeInstallationDirectory: true, artifactName: `SedCoreTool-${V}-windows-setup.\${ext}` },
  portable: { artifactName: `SedCoreTool-${V}-windows-portable.\${ext}` },
  mac: { target: [{ target: 'dmg', arch: ['universal'] }], category: 'public.app-category.education', icon: 'build/icon.png', identity: null },
  linux: { target: [{ target: 'AppImage', arch: ['x64'] }, { target: 'deb', arch: ['x64'] }], category: 'Science', icon: 'build/icon.png', maintainer: 'Santiago Casanova-Arenillas' },
  publish: null,
};
builder.build({ config }).then((files) => console.log(files.join('\n'))).catch((e) => { console.error(e); process.exit(1); });
