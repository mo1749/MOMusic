'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { DesktopStartup } = require('../desktop/desktop-startup');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'momusic-startup-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const startup = new DesktopStartup(dir);
  const callbacks = { enable: async () => ({ ok: true, enabled: true }), disable: async () => ({ ok: true }), getStatus: () => ({ enabled: false }) };
  return { dir, startup, callbacks };
}

test('old/malformed settings default off; only startup preference is editable', async (t) => {
  const { dir, startup, callbacks } = fixture(t);
  assert.equal((await startup.restore(callbacks)).attempted, false);
  startup.update({ restoreOnStartup: true, lastDesktopEnabled: true });
  assert.equal(startup.read().lastDesktopEnabled, false);
  assert.equal(new DesktopStartup(dir).read().restoreOnStartup, true);
  fs.writeFileSync(startup.file, '{broken');
  assert.equal(new DesktopStartup(dir).read().restoreOnStartup, false);
});

test('confirmed enable survives normal shutdown; repeated/concurrent restore attempts run once', async (t) => {
  const { dir, startup, callbacks } = fixture(t);
  startup.update({ restoreOnStartup: true });
  startup.confirmUserChange(startup.beginUserChange(true), true, { ok: true, enabled: true });
  startup.cancelPending(); // shutdown cancels pending work without saving false
  const boot = new DesktopStartup(dir);
  let calls = 0;
  let resolve;
  callbacks.enable = () => { calls++; return new Promise(r => { resolve = r; }); };
  const first = boot.restore(callbacks);
  assert.equal((await boot.restore(callbacks)).attempted, false);
  resolve({ ok: true, enabled: true });
  assert.equal((await first).ok, true);
  assert.equal(calls, 1);
  assert.equal(new DesktopStartup(dir).read().lastDesktopEnabled, true);
});

test('manual off/Escape supersedes a late enable; off state is persistent', async (t) => {
  const { dir, startup, callbacks } = fixture(t);
  startup.update({ restoreOnStartup: true });
  const old = startup.beginUserChange(true);
  startup.beginUserChange(false);
  startup.confirmUserChange(old, true, { ok: true, enabled: true });
  assert.equal(new DesktopStartup(dir).read().lastDesktopEnabled, false);
  assert.equal((await new DesktopStartup(dir).restore(callbacks)).attempted, false);
});

test('restore failure invokes cleanup once, preserves saved choice and reports cleanup failure', async (t) => {
  const { startup, callbacks } = fixture(t);
  startup.update({ restoreOnStartup: true });
  startup.confirmUserChange(startup.beginUserChange(true), true, { ok: true, enabled: true });
  startup.consumed = false;
  let cleanups = 0;
  callbacks.enable = async () => ({ ok: false, error: 'NATIVE_ATTACH_FAILED' });
  callbacks.disable = async () => { cleanups++; return { ok: false, error: 'RESTORE_UNCONFIRMED' }; };
  const result = await startup.restore(callbacks);
  assert.equal(result.error, 'NATIVE_ATTACH_FAILED');
  assert.equal(result.cleanupError, 'RESTORE_UNCONFIRMED');
  assert.equal(startup.read().lastDesktopEnabled, true);
  await startup.restore(callbacks);
  assert.equal(cleanups, 1);
});

test('cancelled restore does not disable a newer manual session', async (t) => {
  const { startup, callbacks } = fixture(t);
  startup.update({ restoreOnStartup: true });
  startup.confirmUserChange(startup.beginUserChange(true), true, { ok: true, enabled: true });
  startup.consumed = false;
  let reject;
  callbacks.enable = () => new Promise((_, r) => { reject = r; });
  callbacks.disable = () => { assert.fail('must not disable a newer session'); };
  const result = startup.restore(callbacks);
  startup.beginUserChange(false);
  startup.beginUserChange(true);
  reject(new Error('old failure'));
  assert.equal((await result).cancelled, true);
});

test('startup IPC rejects untrusted senders before accessing configuration or native callbacks', () => {
  const source = fs.readFileSync(path.join(__dirname, '../desktop/main.js'), 'utf8');
  const start = source.indexOf("ipcMain.handle('MOMusic-desktop-startup-get'");
  const end = source.indexOf("ipcMain.handle('MOMusic-wallpaper-set-enabled'", start);
  const handlers = {};
  vm.runInNewContext(source.slice(start, end), {
    ipcMain: { handle(name, fn) { handlers[name] = fn; } },
    isTrustedMainWindowIpc: () => false,
  });
  return Promise.all(Object.values(handlers).map(async handler => {
    assert.equal((await handler({})).error, 'DESKTOP_STARTUP_UNTRUSTED_SENDER');
  }));
});

test('trusted restore requires recovery tray and confirms native icon visibility', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../desktop/main.js'), 'utf8');
  const start = source.indexOf("ipcMain.handle('MOMusic-desktop-startup-get'");
  const end = source.indexOf("ipcMain.handle('MOMusic-wallpaper-set-enabled'", start);
  const handlers = {}, calls = [];
  const sandbox = { ipcMain: { handle(name, fn) { handlers[name] = fn; } },
    isTrustedMainWindowIpc: () => true, appQuitting: false,
    desktopStartup: { restore: ({ enable }) => enable(() => true) },
    ensureFullDesktopModeRecoveryTray: () => { calls.push('tray'); return true; },
    createWallpaperWindow: async () => { calls.push('enable'); return { ok: true, enabled: true }; },
    fullDesktopModeRuntime: { async setDesktopIconsVisible(visible) { calls.push(visible); return { ok: true }; } },
  };
  vm.runInNewContext(source.slice(start, end), sandbox);
  assert.equal((await handlers['MOMusic-desktop-startup-restore']({})).ok, true);
  assert.deepEqual(calls, ['tray', 'enable', true]);
});

test('renderer startup consumes main-process choice without sending synthetic disable', async () => {
  const text = fs.readFileSync(path.join(__dirname, '../public/js/modules/10-shell/04b-desktop-dock.js'), 'utf8');
  const start = text.indexOf('async function initializeDesktopStartup()');
  const end = text.indexOf('\nfunction desktopDockApi()', start);
  let restores = 0, applied;
  const api = {
    getDesktopStartup: async () => ({ ok: true, config: { restoreOnStartup: true } }),
    restoreDesktopStartup: async () => { restores++; return { ok: true, status: { enabled: true } }; },
    setWallpaperMode: () => assert.fail('startup must not send a user off command'),
  };
  const sandbox = { desktopDockApi: () => api, document: { getElementById: () => null },
    syncDesktopStartupControl() {}, applyDesktopWallpaperRuntimeStatus(status) { applied = status; }, console };
  vm.runInNewContext(text.slice(start, end), sandbox);
  await sandbox.initializeDesktopStartup();
  assert.equal(restores, 1);
  assert.equal(applied.enabled, true);
  const bindings = fs.readFileSync(path.join(__dirname, '../public/js/modules/10-shell/05-startup-bindings.js'), 'utf8');
  assert.ok(!bindings.includes('applyWallpaperModeState(false)'));
});

test('placeholder timer is stopped before navigating the main document', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../desktop/main.js'), 'utf8');
  const start = source.indexOf('    await ensureLocalServerStarted();', source.indexOf('async function createWindowOnce()'));
  const end = source.indexOf('\n  } finally', start);
  const sequence = [];
  const sandbox = {
    ensureLocalServerStarted: async () => sequence.push('server'),
    clearTimeout: () => sequence.push('cancel-placeholder'), placeholderFallbackTimer: 1,
    startupShellLoadPromise: null, win: {}, loadMainWindowWithRetry: async () => sequence.push('navigate'),
  };
  await vm.runInNewContext('(async () => {' + source.slice(start, end) + '})()', sandbox);
  assert.deepEqual(sequence, ['server', 'cancel-placeholder', 'navigate']);
});

test('Dock settings requests serialize and rejected optimistic edits read back saved state', async () => {
  const text = fs.readFileSync(path.join(__dirname, '../public/js/modules/10-shell/04b-desktop-dock.js'), 'utf8');
  const start = text.indexOf('function desktopDockUpdateSettings(patch)');
  const end = text.indexOf('\nfunction desktopDockDebouncedSlider', start);
  const calls = [], notices = [];
  let concurrent = 0;
  const api = {
    async updateDockSettings(patch) {
      concurrent++;
      assert.equal(concurrent, 1);
      calls.push(patch.margin);
      await Promise.resolve(); concurrent--;
      if (patch.margin === 30) throw new Error('disk full');
      return { ok: true, config: { settings: { margin: patch.margin } } };
    },
    getDockState: async () => ({ settings: { margin: 15 } }),
  };
  const sandbox = { desktopDockSettingsSerial: 0, desktopDockSettingsQueue: Promise.resolve(), desktopDockSavedSettings: null,
    desktopDockState: { settings: { margin: 8 } }, desktopDockApi: () => api,
    desktopDockSyncControls() {}, desktopDockApplyStatePayload(state) { sandbox.desktopDockState.settings = state.settings; },
    showToast(text) { notices.push(text); } };
  vm.runInNewContext(text.slice(start, end), sandbox);
  sandbox.desktopDockUpdateSettings({ margin: 15 });
  sandbox.desktopDockUpdateSettings({ margin: 30 });
  await sandbox.desktopDockSettingsQueue;
  assert.deepEqual(calls, [15, 30]);
  assert.equal(sandbox.desktopDockState.settings.margin, 15);
  assert.equal(notices.length, 1);
});
