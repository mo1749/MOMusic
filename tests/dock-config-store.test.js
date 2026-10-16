'use strict';

const assert = require('assert');
const shared = require('../desktop/dock-shared');

module.exports = { run };

function run() {
  // 默认值
  const defaults = shared.normalizeDockConfig(null);
  assert.strictEqual(defaults.enabled, false);
  assert.strictEqual(defaults.edge, 'bottom');
  assert.strictEqual(defaults.persistState, true);
  assert.strictEqual(defaults.theme, 'macos-dark');
  assert.strictEqual(defaults.custom.opacity > 0, true);
  assert.strictEqual(Array.isArray(defaults.pinned), true);

  // 非法值回落
  const normalized = shared.normalizeDockConfig({
    edge: 'diagonal',
    theme: 'neon',
    ratio: 7,
    margin: 999,
    iconSize: 8,
    custom: { opacity: 12, blur: -5, bgColor: 'red' },
    magnify: { max: 9 },
    pinned: 'nope',
  });
  assert.strictEqual(normalized.edge, 'bottom');
  assert.strictEqual(normalized.theme, 'macos-dark');
  assert.strictEqual(normalized.ratio, 1);
  assert.strictEqual(normalized.margin, 80);
  assert.strictEqual(normalized.iconSize, 28);
  assert.strictEqual(normalized.custom.opacity, 1);
  assert.strictEqual(normalized.custom.blur, 0);
  assert.strictEqual(normalized.custom.bgColor, '#101318');
  assert.strictEqual(normalized.magnify.max, 2);
  assert.deepStrictEqual(normalized.pinned, []);

  // 固定列表按 id 去重
  const deduped = shared.normalizeDockConfig({
    pinned: [
      { id: 'a', type: 'lnk', target: 'C:\\a.exe', name: 'A' },
      { id: 'a', type: 'lnk', target: 'C:\\a.exe', name: 'A copy' },
      { id: 'b', type: 'uwp', aumid: 'X.Y_ok!App', name: 'B' },
      { type: 'lnk', target: '', name: 'invalid' },
    ],
  });
  assert.strictEqual(deduped.pinned.length, 2);
  assert.strictEqual(deduped.pinned[0].id, 'a');
  assert.strictEqual(deduped.pinned[1].type, 'uwp');

  // 固定条目扩展字段: 修改显示名称 / 自定义图标 / 单应用自启 (6.1.5-7)
  const extended = shared.normalizeDockConfig({
    pinned: [
      { id: 'c', type: 'lnk', target: 'C:\\c.exe', name: 'C', displayName: '自定义名', customIconPath: 'D:\\icons\\c.png', launchAtLogin: true },
      { id: 'd', type: 'lnk', target: 'C:\\d.exe', name: 'D', displayName: '   ', customIconPath: 123, launchAtLogin: 'yes' },
    ],
  });
  assert.strictEqual(extended.pinned[0].displayName, '自定义名');
  assert.strictEqual(extended.pinned[0].customIconPath, 'D:\\icons\\c.png');
  assert.strictEqual(extended.pinned[0].launchAtLogin, true);
  assert.strictEqual(extended.pinned[1].displayName, '');
  // 与本文件其他字段一致的松散 String() 约定: 非字符串输入被字符串化而非清空
  assert.strictEqual(extended.pinned[1].customIconPath, '123');
  assert.strictEqual(extended.pinned[1].launchAtLogin, false);

  // 固定条目同应用判定: id 来源不同 (运行区前缀 / 扫描哈希) 时按目标本体比较
  assert.strictEqual(shared.samePinnedApp(
    { id: 'exe:c:\\a\\app.exe', type: 'lnk', target: 'C:\\A\\app.exe' },
    { id: 'x7hash', type: 'lnk', target: 'c:\\a\\APP.exe', args: '--flag' },
  ), true); // 不比 args: 运行区固定拿不到启动参数
  assert.strictEqual(shared.samePinnedApp(
    { id: 'a', type: 'lnk', target: 'C:\\a.exe' },
    { id: 'b', type: 'file', target: 'c:\\a.exe' },
  ), true); // 拖入 exe (file) 与扫描条目 (lnk) 同目标也算同一应用
  assert.strictEqual(shared.samePinnedApp(
    { id: 'uwp:x!app', type: 'uwp', aumid: 'X.Y_ok!App' },
    { id: 'h1', type: 'uwp', aumid: 'x.y_OK!app' },
  ), true);
  assert.strictEqual(shared.samePinnedApp(
    { id: 'uwp:x', type: 'uwp', aumid: 'X.Y!App' },
    { id: 'l1', type: 'lnk', target: 'x.y!app' },
  ), false); // uwp 与非 uwp 不跨类型比较
  assert.strictEqual(shared.samePinnedApp(
    { id: 'a', type: 'lnk', target: 'C:\\a.exe' },
    { id: 'b', type: 'lnk', target: 'C:\\b.exe' },
  ), false);
  assert.strictEqual(shared.samePinnedApp(null, { type: 'lnk', target: 'C:\\a.exe' }), false);

  // 局部设置合并: 嵌套对象不被顶层覆盖丢失
  const base = shared.normalizeDockConfig({ custom: { opacity: 0.5, blur: 10, radius: 12, bgColor: '#223344' } });
  const merged = shared.mergeDockSettings(base, { custom: { opacity: 0.9 } });
  assert.strictEqual(merged.custom.opacity, 0.9);
  assert.strictEqual(merged.custom.blur, 10);
  assert.strictEqual(merged.custom.radius, 12);
  assert.strictEqual(merged.custom.bgColor, '#223344');
  // enabled 不允许经由 settings 合并篡改
  const mergedEnabled = shared.mergeDockSettings(base, { enabled: true });
  assert.strictEqual(mergedEnabled.enabled, false);

  console.log('ok - dock-config-store');
}

if (require.main === module) {
  run();
}
