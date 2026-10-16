'use strict';

const assert = require('assert');
const shared = require('../desktop/dock-shared');

module.exports = { run };

function run() {
  const now = 1700000000000;

  // 按目标去重: 同一 exe 的两个快捷方式只留一个, 名称短者优先, 其余并入 aliases
  const entries = shared.normalizeAppEntries([
    { type: 'lnk', name: '微信', target: 'C:\\Apps\\WeChat\\WeChat.exe', args: '', iconSource: 'C:\\Apps\\WeChat\\WeChat.exe', iconIndex: 0 },
    { type: 'lnk', name: 'WeChat - 快捷方式', target: 'C:\\Apps\\WeChat\\WeChat.exe', args: '', iconSource: 'C:\\Apps\\WeChat\\WeChat.exe', iconIndex: 0 },
    { type: 'lnk', name: '记事本', target: 'C:\\Windows\\notepad.exe', args: '', iconSource: 'C:\\Windows\\notepad.exe', iconIndex: 0 },
  ], { now, convertPinyin: () => ({ full: '', initials: '' }) });

  assert.strictEqual(entries.length, 2);
  const wechat = entries.find((entry) => entry.target === 'C:\\Apps\\WeChat\\WeChat.exe');
  assert.strictEqual(wechat.name, '微信');
  assert.deepStrictEqual(wechat.aliases, ['WeChat - 快捷方式']);
  assert.strictEqual(wechat.firstSeenAt, now);

  // 非应用目标 (文档/文件夹快捷方式) 被过滤
  const filtered = shared.normalizeAppEntries([
    { type: 'lnk', name: '说明文档', target: 'C:\\readme.txt', args: '' },
    { type: 'lnk', name: '某文件夹', target: 'D:\\tools', args: '' },
    { type: 'lnk', name: '无目标', target: '', args: '' },
  ], { now });
  assert.strictEqual(filtered.length, 0);

  // UWP 条目按 aumid 归一
  const uwp = shared.normalizeAppEntries([
    { type: 'uwp', name: '计算器', aumid: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App' },
  ], { now });
  assert.strictEqual(uwp.length, 1);
  assert.strictEqual(uwp[0].type, 'uwp');
  assert.strictEqual(uwp[0].id, shared.computeAppKey('uwp', '', 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App'));

  // firstSeenAt 沿用上次扫描结果 (新装标记的依据)
  const rescan = shared.normalizeAppEntries([
    { type: 'lnk', name: '微信', target: 'C:\\Apps\\WeChat\\WeChat.exe', args: '' },
  ], {
    now: now + 1000,
    prevIndex: { [wechat.id]: { firstSeenAt: now - 10 * 24 * 60 * 60 * 1000 } },
  });
  assert.strictEqual(rescan[0].firstSeenAt, now - 10 * 24 * 60 * 60 * 1000);
  assert.strictEqual(shared.isNewAppEntry(rescan[0], now + 1000), false);

  // 3 天内的条目判定为新装
  const recent = shared.normalizeAppEntries([
    { type: 'lnk', name: '新装应用', target: 'C:\\new.exe', args: '' },
  ], { now: now + 1000 });
  assert.strictEqual(shared.isNewAppEntry(recent[0], now + 1000), true);

  // 拼音搜索: 名称 / 全拼 / 首字母 / 别名
  const pinyinEntries = shared.normalizeAppEntries([
    { type: 'lnk', name: '网易云音乐', target: 'C:\\cloudmusic.exe', args: '' },
  ], {
    now,
    convertPinyin: (name) => ({
      full: 'wangyiyunyinyue',
      initials: 'wyyyY'.toLowerCase().slice(0, name.length),
    }),
  });
  const entry = pinyinEntries[0];
  entry.pinyinFull = 'wangyiyunyinyue';
  entry.pinyinInitials = 'wyyy';
  assert.strictEqual(shared.matchAppEntry(entry, '网易云'), true);
  assert.strictEqual(shared.matchAppEntry(entry, 'wangyi'), true);
  assert.strictEqual(shared.matchAppEntry(entry, 'wyyy'), true);
  assert.strictEqual(shared.matchAppEntry(entry, 'qqmusic'), false);

  // 运行中快照 diff: 窗口增减/前台切换能被感知
  const snapshotA = [{ key: 'exe:a', name: 'A', windows: [{ hwnd: 1, minimized: false, foreground: true }] }];
  const snapshotA2 = [{ key: 'exe:a', name: 'A', windows: [{ hwnd: 1, minimized: false, foreground: true }] }];
  const snapshotB = [{ key: 'exe:a', name: 'A', windows: [{ hwnd: 1, minimized: true, foreground: false }] }];
  const snapshotC = [
    { key: 'exe:a', name: 'A', windows: [{ hwnd: 1, minimized: false, foreground: false }] },
    { key: 'exe:b', name: 'B', windows: [{ hwnd: 2, minimized: false, foreground: true }] },
  ];
  assert.strictEqual(shared.runningSnapshotChanged(snapshotA, snapshotA2), false);
  assert.strictEqual(shared.runningSnapshotChanged(snapshotA, snapshotB), true);
  assert.strictEqual(shared.runningSnapshotChanged(snapshotA, snapshotC), true);

  console.log('ok - dock-apps-dedupe');
}

if (require.main === module) {
  run();
}
