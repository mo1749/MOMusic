'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const shared = require('../desktop/dock-shared');
const { DockRuntime } = require('../desktop/dock-runtime');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'momusic-icons-test-'));
  const runtime = new DockRuntime({ userDataPath: dir, nativeTempPath: dir,
    screen: { getPrimaryDisplay: () => ({ bounds: { x: 0, y: 0, width: 1920, height: 1080 } }) } });
  runtime.pushEvent = () => {};
  t.after(() => { runtime.dispose(); fs.rmSync(dir, { recursive: true, force: true }); });
  return runtime;
}

test('shortcut resource indexes and pinned icon sources survive normalization', () => {
  const entry = shared.normalizeAppEntries([{ name: 'Steam', target: 'C:\\Steam\\steam.exe', iconSource: 'C:\\icons.dll', iconIndex: -15 }])[0];
  assert.equal(entry.iconIndex, -15);
  const pinned = shared.normalizePinnedEntry({ ...entry, logoPath: 'C:\\logo.png' });
  assert.equal(pinned.iconSource, entry.iconSource);
  assert.equal(pinned.logoPath, 'C:\\logo.png');
});

test('unknown running hashed icon keys queue executable and window fallback', async t => {
  const runtime = fixture(t);
  const key = shared.computeAppKey('lnk', 'c:\\steam\\steamwebhelper.exe', '', '');
  runtime.runningApps = [{ iconKey: key, exePath: 'C:\\Steam\\steamwebhelper.exe', windows: [{ hwnd: 4321 }] }];
  assert.equal(await runtime.getIconDataUrl(key), '');
  const job = runtime.pendingIconJobs.get(key);
  assert.equal(job.hwnd, 4321);
  assert.equal(job.candidates[0].source, 'C:\\Steam\\steamwebhelper.exe');
});

test('packaged desktop processes reuse package icon even outside ApplicationFrameHost', t => {
  const runtime = fixture(t);
  const aumid = 'OpenAI.Codex_test!App';
  const scanned = shared.normalizeAppEntries([{ name: 'ChatGPT', type: 'uwp', aumid, logoPath: 'C:\\old-version\\Logo.png' }])[0];
  runtime.setAppsEntries([scanned]);
  runtime.handleRunningSnapshot([`42|2|C:\\WindowsApps\\ChatGPT.exe|${aumid}|ChatGPT|0,0,100,100`]);
  assert.equal(runtime.runningApps[0].iconKey, scanned.iconKey);
  const job = runtime.pendingIconJobs.get(scanned.iconKey);
  assert.ok(job.candidates.some(item => item.source === 'shell:AppsFolder\\' + aumid));
});

test('old pinned UWP records resolve fresh scan logos and explicit icons win', t => {
  const runtime = fixture(t);
  const aumid = 'Microsoft.WindowsTerminal_test!App';
  const scanned = shared.normalizeAppEntries([{ name: 'Terminal', type: 'uwp', aumid, logoPath: 'C:\\new\\Logo.png' }])[0];
  runtime.setAppsEntries([scanned]);
  runtime.config.pinned = [shared.normalizePinnedEntry({ id: 'legacy', iconKey: 'legacy-icon', type: 'uwp', name: 'Terminal', aumid })];
  assert.equal(runtime.resolveIconJob('legacy-icon').candidates[0].source, scanned.logoPath);
  runtime.config.pinned[0].customIconPath = 'C:\\custom.png';
  assert.equal(runtime.resolveIconJob('legacy-icon').candidates[0].source, 'C:\\custom.png');
  assert.equal(runtime.resolveIconJob('legacy-icon').hwnd, 0);
});

test('running icon changes trigger rerender even when windows are unchanged', () => {
  assert.equal(shared.runningSnapshotChanged([{ key: 'app', name: 'App', iconKey: 'old', windows: [] }],
    [{ key: 'app', name: 'App', iconKey: 'new', windows: [] }]), true);
});

test('frontend updates detached/requesting and replacement nodes for path-shaped keys', async () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/dock.html'), 'utf8');
  const source = html.slice(html.indexOf('  function requestIcon('), html.indexOf('  function applyIconToImg('));
  const key = 'C:\\Steam\\steam.exe';
  const original = {}, replacement = {};
  let resolve;
  const applied = [];
  const state = { icons: new Map(), iconRequested: new Set(), iconFailed: new Set() };
  const sandbox = { state, api: { action: () => new Promise(r => { resolve = r; }) },
    document: { querySelectorAll(selector) { assert.equal(selector, '[data-icon-key]'); return [{ dataset: { iconKey: key }, querySelector: () => replacement }]; } },
    showIconFallback() {}, applyIconToImg(img, value) { applied.push({ img, value }); } };
  vm.runInNewContext(source, sandbox);
  sandbox.requestIcon(key, original, 'Steam');
  resolve({ ok: true, dataUrl: 'data:image/png;base64,test' });
  await new Promise(r => setImmediate(r));
  assert.equal(applied[0].img, original);
  assert.equal(applied[1].img, replacement);
  assert.equal(state.iconRequested.size, 0);
});
