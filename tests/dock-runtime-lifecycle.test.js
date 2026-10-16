'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DockRuntime } = require('../desktop/dock-runtime');

class FakeWindow extends EventEmitter {
  constructor(options) {
    super(); this.options = options; this.destroyed = false; this.shown = false;
    this.webContents = new EventEmitter();
    this.webContents.isDestroyed = () => this.destroyed;
    this.webContents.send = () => {};
  }
  isDestroyed() { return this.destroyed; }
  setAlwaysOnTop() {}
  setIgnoreMouseEvents(value) { this.ignored = value; }
  setBounds(value) { this.bounds = value; }
  showInactive() { this.shown = true; }
  close() { this.destroyed = true; } // Delayed native closed event is intentional.
  loadURL() { return Promise.resolve(); }
}
function child() {
  const proc = new EventEmitter();
  proc.stdout = new EventEmitter(); proc.exitCode = null; proc.killed = false;
  proc.kill = () => { proc.killed = true; };
  return proc;
}
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'momusic-dock-test-'));
  const processes = [], shortcuts = new Set(), states = [];
  const runtime = new DockRuntime({
    BrowserWindow: FakeWindow, userDataPath: dir, nativeTempPath: dir,
    screen: { getPrimaryDisplay: () => ({ bounds: { x: -1920, y: 0, width: 1920, height: 1080 }, workArea: { x: -1920, y: 0, width: 1920, height: 1040 } }) },
    app: { setLoginItemSettings() {} }, shell: {},
    globalShortcut: { register(key) { shortcuts.add(key); return true; }, unregister(key) { shortcuts.delete(key); } },
    spawnImpl() { const proc = child(); processes.push(proc); return proc; },
    execFileImpl(_exe, _args, _opts, callback) {
      const proc = child(); proc.complete = callback; processes.push(proc); return proc;
    },
    onMainWindowEvent(_channel, state) { states.push(state); },
  });
  t.after(() => { runtime.dispose(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { runtime, dir, processes, shortcuts, states };
}
function enable(runtime) { runtime.handleDesktopModeStatus({ enabled: true }); assert.equal(runtime.setEnabled(true).ok, true); }

test('saved preference and active state differ; persistState controls desktop reentry and next launch', t => {
  const { runtime, dir, states } = fixture(t);
  assert.equal(runtime.setEnabled(true).ok, false);
  enable(runtime);
  runtime.handleDesktopModeStatus({ enabled: false });
  assert.equal(runtime.publicConfig().enabled, false);
  assert.equal(runtime.publicConfig().preferredEnabled, true);
  assert.equal(states.at(-1).enabled, false);
  runtime.handleDesktopModeStatus({ enabled: true });
  assert.equal(runtime.publicConfig().enabled, true);
  runtime.updateSettings({ persistState: false });
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'dock-config.json')));
  assert.equal(saved.enabled, true);
  runtime.handleDesktopModeStatus({ enabled: false });
  runtime.handleDesktopModeStatus({ enabled: true });
  assert.equal(runtime.publicConfig().enabled, false);
});

test('late old window callbacks cannot show or clear a replacement; teardown releases helpers and shortcuts', t => {
  const { runtime, processes, shortcuts } = fixture(t);
  enable(runtime);
  const old = runtime.window;
  assert.equal(old.ignored, true);
  runtime.setEnabled(false);
  assert.equal(shortcuts.size, 0);
  assert.ok(processes.every(p => p.killed));
  runtime.setEnabled(true);
  const replacement = runtime.window;
  old.emit('closed'); old.emit('ready-to-show');
  assert.equal(runtime.window, replacement);
  assert.equal(replacement.shown, false);
  replacement.emit('ready-to-show');
  assert.equal(replacement.shown, true);
  runtime.handleDisplayChange();
  assert.equal(replacement.bounds.x, -1920);
});

test('shutdown cancels renderer crash rebuild timer and prevents resurrection', t => {
  const { runtime } = fixture(t);
  enable(runtime);
  runtime.window.webContents.emit('render-process-gone', {}, { reason: 'crashed' });
  assert.ok(runtime.rebuildTimer);
  runtime.dispose();
  assert.equal(runtime.rebuildTimer, null);
  assert.equal(runtime.ensureDock(), null);
});

test('stale scan result cannot write cache or overwrite a new scan in-flight flag', async t => {
  const { runtime, dir } = fixture(t);
  enable(runtime);
  let resolve;
  runtime.runPowerShellScript = () => new Promise(r => { resolve = r; });
  const oldScan = runtime.rescanApps();
  runtime.setEnabled(false);
  runtime.setEnabled(true);
  runtime.scanInFlight = true; // New lifecycle owns this flag.
  resolve({ apps: [{ name: 'stale', target: 'C:\\stale.exe' }] });
  await oldScan;
  assert.equal(runtime.appsEntries.length, 0);
  assert.equal(fs.existsSync(path.join(dir, 'dock-apps-cache.json')), false);
  assert.equal(runtime.scanInFlight, true);
});

test('one-shot scanning is terminated on close and its rejected result is ignored', async t => {
  const { runtime, processes } = fixture(t);
  enable(runtime);
  const scan = runtime.rescanApps();
  const proc = processes.at(-1);
  assert.equal(runtime.oneShotProcesses.has(proc), true);
  runtime.setEnabled(false);
  assert.equal(proc.killed, true);
  proc.complete(new Error('cancelled'));
  await scan;
  assert.equal(runtime.oneShotProcesses.size, 0);
});

test('late helper exit/data cannot replace new process; empty snapshots clear running apps', t => {
  const { runtime } = fixture(t);
  enable(runtime);
  const old = runtime.runningProcess;
  runtime.setEnabled(false); runtime.setEnabled(true);
  const replacement = runtime.runningProcess;
  old.emit('exit'); old.emit('error', new Error('late error'));
  old.stdout.emit('data', '123|0|C:\\fake.exe||Old|0,0,1,1\nEND\n');
  assert.equal(runtime.runningProcess, replacement);
  assert.equal(runtime.runningRestartTimer, null);
  runtime.runningApps = [{ key: 'old' }];
  replacement.stdout.emit('data', 'END\n');
  assert.equal(runtime.runningApps.length, 0);
});

test('failed persistence/autostart restores saved settings and does not register inactive hotkeys', t => {
  const { runtime, shortcuts } = fixture(t);
  runtime.updateSettings({ margin: 15 });
  assert.equal(shortcuts.size, 0);
  runtime.app.setLoginItemSettings = () => { throw new Error('registry failure'); };
  assert.throws(() => runtime.updateSettings({ launchAtLogin: true }), /DOCK_LOGIN_ITEM_FAILED/);
  assert.equal(runtime.config.launchAtLogin, false);
  runtime.writeJsonFileAtomic = () => { throw new Error('disk full'); };
  assert.throws(() => runtime.updateSettings({ margin: 30 }), /disk full/);
  assert.equal(runtime.config.margin, 15);
});
