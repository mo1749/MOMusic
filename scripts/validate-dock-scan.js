// 临时校验脚本: 抽取 dock-runtime.js 的 DOCK_SCAN_SCRIPT 并在本机执行一次,
// 验证 AI 修改后的 PowerShell 语法与 JSON 输出。用完即删。
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

const src = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'dock-runtime.js'), 'utf8');
const m = src.match(/const DOCK_SCAN_SCRIPT = `([\s\S]*?)`;/);
if (!m) {
  console.error('FAIL: DOCK_SCAN_SCRIPT not found');
  process.exit(1);
}
// dock-runtime.js 是真实模块: 模板字面量在 Node 加载时已把 \\\\ 折叠为 \\,
// 这里直接用原文即可 (正则取到的是源码文本, 需要模拟一次 JS 字符串转义)。
let script = m[1];
// 源码文本中的 "\\\\" (4 个字符) 在模板字面量求值后是 "\\" (2 个字符, 即 PS 里的单反斜杠转义前状态)
script = script.replace(/\\\\/g, '\\');

const ps1 = path.join(os.tmpdir(), 'momusic-scan-validate.ps1');
// 与 dock-runtime 运行时行为一致: UTF-8 带 BOM 写入 (PS 5.1 对无 BOM 文件按 GBK 解码,
// 中文注释结尾的 CJK 字节会吞掉换行导致语法错乱)
fs.writeFileSync(ps1, '\ufeff' + script, 'utf8');
const out = path.join(os.tmpdir(), 'momusic-scan-validate-out.json');
console.log('ps1 written:', ps1);

execFile('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ps1], {
  windowsHide: true,
  timeout: 120000,
  maxBuffer: 32 * 1024 * 1024,
}, (error, stdout) => {
  if (error) {
    console.error('FAIL: powershell error:', error.message);
    process.exit(1);
  }
  const text = String(stdout || '');
  const start = text.indexOf('{');
  if (start < 0) {
    console.error('FAIL: no JSON in output. head:', text.slice(0, 300));
    process.exit(1);
  }
  let parsed;
  try {
    parsed = JSON.parse(text.slice(start));
  } catch (e) {
    console.error('FAIL: JSON parse:', e.message);
    process.exit(1);
  }
  const apps = Array.isArray(parsed.apps) ? parsed.apps : [];
  const uwp = apps.filter((a) => a.type === 'uwp');
  const lnk = apps.filter((a) => a.type === 'lnk');
  console.log('OK: scan ran. total =', apps.length, ', lnk =', lnk.length, ', uwp =', uwp.length);
  console.log('sample:', apps.slice(0, 3).map((a) => `${a.name} -> ${a.target || a.aumid}`).join(' ; '));
  process.exit(0);
});
