'use strict';
// 验证 dock-runtime.js set-app-autostart 生成的 PowerShell 命令注册表路径完好。
// 从真实源码提取 runKey 求值, 避免手工转义复制造成假象。
const fs = require('fs');
const assert = require('assert');

const src = fs.readFileSync(__dirname + '/../desktop/dock-runtime.js', 'utf8');
const match = src.match(/const runKey = ('.+');/);
assert(match, '源码中找不到 runKey 定义');
const runKey = eval(match[1]);
console.log('runKey 求值结果 =', runKey);
assert.strictEqual(runKey, 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', 'runKey 反斜杠被 JS 转义吃掉了');

// 按运行时同样方式拼一次完整命令
const normalizePsSingleQuoted = (v) => String(v || '').replace(/'/g, "''");
const entry = { id: 'abc123', target: 'C:\\Program Files\\App\\app.exe' };
const valueName = normalizePsSingleQuoted(`MOMusicDock_${entry.id}`);
const ps = `New-ItemProperty -Path '${runKey}' -Name '${valueName}' -Value '"${normalizePsSingleQuoted(entry.target)}"' -Force`;
console.log('生成命令 =', ps);
assert(ps.includes("-Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'"), '命令中注册表路径损坏');
assert(ps.includes("-Value '\"C:\\Program Files\\App\\app.exe\"'"), '命令中目标值损坏');
console.log('ok - dock-autostart-ps');
