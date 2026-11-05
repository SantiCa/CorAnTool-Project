// V0.17: training of U-Net models on the user's computer, from the desktop program.
// The app sends the training ZIP (same as «U-Net training data»); this module runs the Python package
// (`python -m ichantool.cli unet prepare|train`) in a private virtual environment and reports progress.
// The environment (PyTorch + ichantool[unet], 2–3 GB) is installed on demand with the system Python ≥ 3.10.
// Plain Node (no Electron imports), so it can be tested on its own.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');

const WIN = process.platform === 'win32';
const safe = (s) => String(s || 'model').replace(/[^\w.-]+/g, '_').slice(0, 60) || 'model';

class Trainer {
  /**
   * root: folder for the environment, runs and models (Electron: userData/trainer).
   * pySrc: folder with the Python package source (pyproject.toml + src/).
   * send(event, data): progress events to the window ('log', 'progress', 'done', 'error', 'state').
   * python: optional interpreter that already has ichantool[unet] (skips the private environment; for tests).
   */
  constructor({ root, pySrc, send = () => {}, python = process.env.CORANTOOL_PYTHON || null }) {
    Object.assign(this, { root, pySrc, send, fixedPython: python, child: null, busy: null });
    fs.mkdirSync(path.join(root, 'models'), { recursive: true });
    fs.mkdirSync(path.join(root, 'runs'), { recursive: true });
  }

  get venv() { return path.join(this.root, 'venv'); }
  get venvPython() { return path.join(this.venv, WIN ? 'Scripts/python.exe' : 'bin/python'); }
  python() { return this.fixedPython || (fs.existsSync(this.venvPython) ? this.venvPython : null); }

  /** System Python ≥ 3.10 used to create the environment: { cmd, args, version } or null. */
  systemPython() {
    const cands = WIN ? [['py', ['-3']], ['python', []], ['python3', []]] : [['python3', []], ['python', []]];
    for (const [cmd, pre] of cands) {
      const r = spawnSync(cmd, [...pre, '-c', 'import sys;print("%d.%d" % sys.version_info[:2])'], { encoding: 'utf8', timeout: 15000 });
      const v = (r.stdout || '').trim(), [a, b] = v.split('.').map(Number);
      if (r.status === 0 && (a > 3 || (a === 3 && b >= 10))) return { cmd, args: pre, version: v };
    }
    return null;
  }

  hasNvidia() { return spawnSync('nvidia-smi', ['-L'], { encoding: 'utf8', timeout: 15000 }).status === 0; }

  /** What the dialog shows: interpreter, whether the module is ready, training hardware, models and an unfinished run. */
  async status() {
    const py = this.python(), out = { python: py, installed: false, device: null, system: null, models: this.models(), busy: this.busy, platform: process.platform };
    if (!py) { out.system = this.systemPython(); return out; }
    const r = spawnSync(py, ['-m', 'ichantool.cli', 'unet', 'device'], { encoding: 'utf8', timeout: 120000 });
    if (r.status === 0) { out.installed = true; try { out.device = JSON.parse(r.stdout.trim().split('\n').pop()); } catch { /* keep null */ } }
    else out.error = (r.stderr || '').trim().split('\n').slice(-3).join('\n');
    return out;
  }

  /** Run a command, sending each output line; resolves with the exit code. */
  run(cmd, args, opt = {}) {
    return new Promise((resolve, reject) => {
      const env = { ...process.env, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' };
      const p = spawn(cmd, args, { cwd: opt.cwd || this.root, env, windowsHide: true });
      this.child = p;
      const feed = (buf) => {
        for (const line of String(buf).split(/\r?\n/)) {
          if (!line.trim()) continue;
          if (line.startsWith('{"progress"')) { try { this.send('progress', JSON.parse(line).progress); continue; } catch { /* plain line */ } }
          this.send('log', line);
        }
      };
      p.stdout.on('data', feed); p.stderr.on('data', feed);
      p.on('error', reject);
      p.on('close', (code, signal) => { this.child = null; resolve(signal ? -1 : code); });
    });
  }

  async step(label, cmd, args) {
    this.send('log', `▸ ${label}`);
    const code = await this.run(cmd, args);
    if (code !== 0) throw new Error(code === -1 ? 'cancelled' : `${label}: exit code ${code}`);
  }

  /** Private environment: venv + PyTorch (CUDA build on Windows with an NVIDIA card) + ichantool[unet] from pySrc. */
  async install() {
    if (this.busy) throw new Error('busy');
    const sys = this.systemPython();
    if (!sys) throw new Error('python-missing');
    this.busy = 'install'; this.send('state', { busy: this.busy });
    try {
      if (!fs.existsSync(this.venvPython)) await this.step(`Python ${sys.version}: virtual environment`, sys.cmd, [...sys.args, '-m', 'venv', this.venv]);
      const py = this.venvPython;
      await this.step('pip', py, ['-m', 'pip', 'install', '--upgrade', 'pip']);
      const torch = ['-m', 'pip', 'install', 'torch'];
      if (WIN && this.hasNvidia()) torch.push('--index-url', 'https://download.pytorch.org/whl/cu128');   // PyPI wheels for Windows are CPU-only
      await this.step('PyTorch', py, torch);
      const src = path.join(os.tmpdir(), `corantool-py-${Date.now()}`);   // pip builds in the source folder: use a writable copy
      fs.cpSync(this.pySrc, src, { recursive: true });
      try { await this.step('ichantool[unet]', py, ['-m', 'pip', 'install', `${src}[unet]`]); } finally { fs.rmSync(src, { recursive: true, force: true }); }
      this.send('log', '✓');
    } finally { this.busy = null; this.send('state', { busy: null }); }
  }

  /**
   * Train from the app's ZIP. opt = { zip (Uint8Array), name, val: [], test: [], epochs, pretrained, tile, overlap,
   * encoder, resume }. Resume reuses the prepared tiles and the checkpoint of the same name.
   */
  async train(opt) {
    if (this.busy) throw new Error('busy');
    const py = this.python(); if (!py) throw new Error('not-installed');
    const name = safe(opt.name), run = path.join(this.root, 'runs', name), data = path.join(run, 'data');
    const model = path.join(this.root, 'models', name);
    this.busy = 'train'; this.send('state', { busy: this.busy, name });
    try {
      const resume = !!opt.resume && fs.existsSync(path.join(data, 'dataset.json')) && fs.existsSync(model + '.ckpt');
      if (!resume) {
        fs.rmSync(run, { recursive: true, force: true }); fs.mkdirSync(run, { recursive: true });
        for (const ext of ['.ckpt', '.pt', '.onnx', '.json']) fs.rmSync(model + ext, { force: true });
        fs.writeFileSync(path.join(run, 'dataset.zip'), Buffer.from(opt.zip));
        const a = ['-m', 'ichantool.cli', 'unet', 'prepare', path.join(run, 'dataset.zip'), data, '--tile', String(opt.tile || 512), '--overlap', String(opt.overlap || 64)];
        if (opt.val?.length) a.push('--val', ...opt.val);
        if (opt.test?.length) a.push('--test', ...opt.test);
        await this.step('prepare', py, a);
      }
      const a = ['-m', 'ichantool.cli', 'unet', 'train', data, model, '--epochs', String(opt.epochs || 60), '--encoder', opt.encoder || 'resnet34', '--progress-json'];
      if (opt.pretrained === false) a.push('--no-pretrained');
      if (resume) a.push('--resume');
      await this.step(resume ? 'train (resume)' : 'train', py, a);
      const ev = path.join(run, 'evaluation_test.json');
      const test = JSON.parse(fs.readFileSync(path.join(data, 'dataset.json'), 'utf8')).split.test.cores;
      if (test.length) await this.step('evaluate (test cores)', py, ['-m', 'ichantool.cli', 'unet', 'evaluate', path.join(run, 'dataset.zip'), model + '.onnx', '--dataset', data, '-o', ev]);
      this.send('done', { name, evaluation: fs.existsSync(ev) ? JSON.parse(fs.readFileSync(ev, 'utf8')) : null });
      return name;
    } finally { this.busy = null; this.send('state', { busy: null }); }
  }

  cancel() { if (this.child) this.child.kill(); }

  /** Trained models: name, validation Dice, best epoch, date and test score if evaluated. */
  models() {
    const dir = path.join(this.root, 'models');
    return fs.readdirSync(dir).filter((f) => f.endsWith('.json') && fs.existsSync(path.join(dir, f.replace(/\.json$/, '.onnx')))).map((f) => {
      const name = f.replace(/\.json$/, ''), j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      const ev = path.join(this.root, 'runs', name, 'evaluation_test.json');
      const test = fs.existsSync(ev) ? JSON.parse(fs.readFileSync(ev, 'utf8')).pooled : null;
      return { name, valDice: j.valDice, bestEpoch: j.bestEpoch, split: j.split, date: fs.statSync(path.join(dir, f)).mtime.toISOString(), test };
    }).sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  /** Files of a trained model, for loading it in the app. */
  readModel(name) {
    const base = path.join(this.root, 'models', safe(name));
    return { name: safe(name), onnx: fs.readFileSync(base + '.onnx'), json: fs.readFileSync(base + '.json', 'utf8') };
  }

  /** A model whose last run stopped before the end (can be resumed). */
  unfinished(name) { const b = path.join(this.root, 'models', safe(name)); return fs.existsSync(b + '.ckpt') && !fs.existsSync(b + '.onnx'); }
}

module.exports = { Trainer, safe };
