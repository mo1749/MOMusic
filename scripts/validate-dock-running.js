// 校验 dock-runtime.js 的 DOCK_RUNNING_SCRIPT 真实可执行:
// 从源码提取脚本模板落盘(带 BOM), 实际运行 6 秒, 断言出现快照 END 行且无 Progman/WorkerW 泄漏。
'use strict';
const fs = require('fs');
const path = require('path');
const { execFile, spawn } = require('child_process');

const src = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'dock-runtime.js'), 'utf8');
const match = src.match(/const DOCK_RUNNING_SCRIPT = `\n([\s\S]*?)\n`;/);
if (!match) {
  console.error('FAIL: 源码中找不到 DOCK_RUNNING_SCRIPT');
  process.exit(1);
}
// 正则提取到的是模板串源码文本 (\\t 等转义未求值), 必须按模板串求值得到真实脚本,
// 否则 C# 收到双反斜杠 char 字面量会编译失败 (与真实运行时行为不一致)
const script = eval('`' + match[1] + '`');
const ps1 = path.join(require('os').tmpdir(), 'momusic-running-validate.ps1');
fs.writeFileSync(ps1, '\ufeff' + script, 'utf8');

// 注意: PowerShell 对管道 stdout 有缓冲, 中途 kill 会丢输出; 必须重定向到文件再读
const outPath = ps1 + '.out';
const outFd = fs.openSync(outPath, 'w');
const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-File', ps1], {
  windowsHide: true,
  stdio: ['ignore', outFd, outFd],
});
const timeout = setTimeout(() => {
  try { child.kill(); } catch (_) {}
}, 9000);
child.on('exit', () => {
  clearTimeout(timeout);
  try { fs.closeSync(outFd); } catch (_) {}
  const out = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : '';
  try { fs.unlinkSync(outPath); } catch (_) {}
  const lines = out.split('\n').map((l) => l.trim()).filter(Boolean);
  const ends = lines.filter((l) => l === 'END').length;
  const rows = lines.filter((l) => l !== 'END' && l !== 'READY');
  const leaked = rows.filter((l) => /Progman|WorkerW/i.test(l));
  console.log('快照轮数(END) =', ends, '; 窗口行数 =', rows.length);
  if (leaked.length) {
    console.error('FAIL: 桌面层窗口泄漏到运行列表:', leaked.slice(0, 3).join(' ; '));
    process.exit(1);
  }
  if (ends < 2) {
    console.error('FAIL: 6 秒内未产生 2 轮快照 (Add-Type 编译失败或脚本损坏)');
    process.exit(1);
  }
  console.log('ok - dock-running-ps (含桌面层窗口过滤)');
  process.exit(0);
});
