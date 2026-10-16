'use strict';
// Read existing metadata; extract to a temporary directory, never rewrite user icons.
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { DockRuntime } = require('../desktop/dock-runtime');

async function main() {
  const root = process.argv[2] || path.join(process.env.APPDATA, 'MoMusic');
  const entries = JSON.parse(fs.readFileSync(path.join(root, 'dock-apps-cache.json'), 'utf8')).entries;
  const selected = entries.filter(e => /^(steam|chatgpt|终端|windows terminal)$/i.test(e.name));
  assert.ok(selected.length, 'No matching installed apps in Dock scan cache');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'momusic-native-icons-'));
  const runtime = new DockRuntime({ userDataPath: temp, nativeTempPath: temp });
  try {
    runtime.setAppsEntries(selected);
    const jobs = selected.map(entry => runtime.resolveIconJob(entry.iconKey));
    // Exercise the Shell fallback independently of accessible/stale package logos.
    for (const entry of selected.filter(e => e.type === 'uwp')) {
      const key = 'shell-' + entry.iconKey;
      jobs.push({ key, source: 'shell:AppsFolder\\' + entry.aumid, out: runtime.iconPath(key) });
    }
    const done = await runtime.runIconExtraction(jobs);
    for (const job of jobs) {
      assert.ok(done.some(item => item.key === job.key && item.ok), 'Native extraction failed: ' + job.key);
      const bytes = fs.readFileSync(job.out);
      assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      assert.ok(bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0);
    }
    console.log('OK native Dock icons:', selected.map(e => e.name).join(', '), '; PNGs including Shell fallback:', jobs.length);
  } finally {
    runtime.dispose();
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
