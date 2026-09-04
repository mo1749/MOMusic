'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createClassList(initial) {
  const set = new Set(initial || []);
  return {
    contains(name) { return set.has(name); },
    add(name) { set.add(name); },
    remove(name) { set.delete(name); },
    toggle(name, force) {
      const should = force === undefined ? !set.has(name) : !!force;
      if (should) set.add(name); else set.delete(name);
      return should;
    },
  };
}

function createElementStub(tagName) {
  return {
    tagName,
    id: '',
    type: '',
    style: {},
    attrs: {},
    listeners: {},
    children: [],
    offsetWidth: 180,
    offsetHeight: 150,
    classList: createClassList(),
    appendChild(child) { this.children.push(child); return child; },
    contains() { return false; },
    setAttribute(name, value) { this.attrs[name] = String(value); },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
    },
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    querySelectorAll() { return []; },
  };
}

function createBarStub() {
  return {
    nodeType: 1,
    style: {},
    offsetWidth: 1000,
    offsetHeight: 90,
    captureCalls: 0,
    classList: createClassList(['visible']),
    listeners: {},
    setPointerCapture() { this.captureCalls += 1; },
    hasPointerCapture() { return false; },
    getBoundingClientRect() {
      return { left: 460, top: 940, right: 1460, bottom: 1030, width: 1000, height: 90 };
    },
    contains() { return false; },
    dispatchEvent() { return true; },
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
  };
}

function createStorageStub(initial) {
  const map = new Map(Object.entries(initial || {}));
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); },
    dump() { return Object.fromEntries(map.entries()); },
  };
}

function loadModuleSandbox({ bodyClasses = ['desktop-wallpaper-mode'], storage = {} } = {}) {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'js', 'modules', '10-shell', '04a-desktop-bar-position.js'),
    'utf8',
  );
  const sandbox = { setTimeout, clearTimeout };
  vm.runInNewContext(source, sandbox);
  assert.strictEqual(typeof sandbox.initDesktopBarPosition, 'function',
    'module must expose init function and load without a DOM');

  const bar = createBarStub();
  const body = { classList: createClassList(bodyClasses), appendChild() {} };
  const windowListeners = new Map();
  const listenerKey = (type, capture) => `${type}:${capture ? 'capture' : 'bubble'}`;
  const windowStub = {
    innerWidth: 1920,
    innerHeight: 1080,
    addEventListener(type, fn, capture) {
      const key = listenerKey(type, capture);
      const list = windowListeners.get(key) || [];
      list.push(fn);
      windowListeners.set(key, list);
    },
    removeEventListener(type, fn, capture) {
      const key = listenerKey(type, capture);
      const list = windowListeners.get(key) || [];
      const index = list.indexOf(fn);
      if (index >= 0) list.splice(index, 1);
      if (list.length) windowListeners.set(key, list);
      else windowListeners.delete(key);
    },
    getComputedStyle() { return { getPropertyValue() { return ''; } }; },
  };
  sandbox.document = {
    body,
    getElementById(id) { return id === 'bottom-bar' ? bar : null; },
    addEventListener() {},
    createElement(tag) { return createElementStub(tag); },
  };
  sandbox.window = windowStub;
  sandbox.localStorage = createStorageStub(storage);
  sandbox.initDesktopBarPosition();
  return { sandbox, bar, body, storage: sandbox.localStorage, windowStub, windowListeners, listenerKey };
}

async function run() {
  // ---------- 纯逻辑：状态解析 ----------
  const { sandbox } = loadModuleSandbox({ bodyClasses: [] });
  const fromRaw = sandbox.desktopBarPositionStateFromRaw;
  // 对象产自 vm 沙箱 realm，deepStrictEqual 会因原型不同而失败，这里逐字段断言
  const assertState = (actual, pinned, leftRatio, bottomRatio) => {
    assert.strictEqual(actual.pinned, pinned);
    assert.strictEqual(actual.leftRatio, leftRatio);
    assert.strictEqual(actual.bottomRatio, bottomRatio);
  };
  assertState(fromRaw(null), false, null, null);
  assertState(fromRaw('junk'), false, null, null);
  assertState(fromRaw({ pinned: 1, leftRatio: 0.5, bottomRatio: 0.25 }), false, 0.5, 0.25,
    'pinned must be strictly boolean');
  assertState(fromRaw({ pinned: true, leftRatio: 0.5, bottomRatio: 0.25 }), true, 0.5, 0.25);
  assert.strictEqual(fromRaw({ leftRatio: 1.2, bottomRatio: 0.2 }).leftRatio, null, 'out-of-range ratio rejected');
  assert.strictEqual(fromRaw({ leftRatio: -0.5, bottomRatio: 0.2 }).leftRatio, null, 'negative ratio rejected');
  assertState(fromRaw({ leftRatio: 0.5 }), false, null, null, 'unpaired ratios dropped');

  // ---------- 纯逻辑：夹取（含任务栏安全区） ----------
  const clamp = sandbox.desktopBarClampPosition;
  const clampFree = clamp(960, 200, 1920, 1080, 1000, 90, { top: 0, right: 0, bottom: 0, left: 0 });
  assert.strictEqual(clampFree.left, 960);
  assert.strictEqual(clampFree.bottom, 200);
  assert.strictEqual(clamp(100, 16, 1920, 1080, 1000, 90, { top: 0, right: 0, bottom: 48, left: 0 }).bottom, 48,
    'bottom must stay above the taskbar inset');
  assert.strictEqual(clamp(4000, 2000, 1920, 1080, 1000, 90, { top: 48, right: 0, bottom: 48, left: 0 }).bottom, 942,
    'bottom must stay below the top inset');
  assert.strictEqual(clamp(4000, 200, 1920, 1080, 1000, 90, { top: 0, right: 0, bottom: 0, left: 0 }).left, 1420,
    'center-x clamped to right edge minus half bar');
  assert.strictEqual(clamp(100, 200, 1920, 1080, 3000, 90, { top: 0, right: 0, bottom: 0, left: 0 }).left, 1500,
    'bar wider than viewport stays centered');

  // ---------- 纯逻辑：比例换算 ----------
  const ratios = sandbox.desktopBarRatiosFromPosition(960, 200, 1920, 1000);
  assert.strictEqual(ratios.leftRatio, 0.5);
  assert.strictEqual(ratios.bottomRatio, 0.2);
  const zeroViewport = sandbox.desktopBarRatiosFromPosition(960, 200, 0, 1000);
  assert.strictEqual(zeroViewport.leftRatio, null);
  assert.strictEqual(zeroViewport.bottomRatio, null);
  const restored = sandbox.desktopBarPositionFromState({ leftRatio: 0.5, bottomRatio: 0.2 }, 3840, 2000);
  assert.strictEqual(restored.left, 1920);
  assert.strictEqual(restored.bottom, 400);
  assert.strictEqual(sandbox.desktopBarPositionFromState({ leftRatio: null, bottomRatio: null }, 3840, 2000), null);

  // ---------- DOM 集成：进入桌面模式时还原已保存位置 ----------
  const positioned = loadModuleSandbox({
    storage: { 'MOMusic-desktop-bar-position-v1': JSON.stringify({ pinned: false, leftRatio: 0.5, bottomRatio: 0.2 }) },
  });
  assert.strictEqual(positioned.bar.style.left, '960px');
  assert.strictEqual(positioned.bar.style.bottom, '216px');
  assert.strictEqual(positioned.body.classList.contains('desktop-bar-pinned'), false);

  // ---------- DOM 集成：重置 = 恢复出厂态（清位置 + 解除固定） ----------
  positioned.sandbox.setDesktopBarPinned(true);
  assert.strictEqual(positioned.body.classList.contains('desktop-bar-pinned'), true);
  positioned.sandbox.resetDesktopBarPosition();
  assert.strictEqual(positioned.sandbox.desktopBarPositionState.pinned, false,
    'reset must unpin, otherwise dragging stays dead after reset');
  assert.strictEqual(positioned.body.classList.contains('desktop-bar-pinned'), false);
  assert.strictEqual(positioned.bar.style.left, '', 'reset must clear the dragged inline position');
  assert.strictEqual(positioned.bar.style.bottom, '', 'reset must clear the dragged inline position');
  const afterReset = JSON.parse(positioned.storage.getItem('MOMusic-desktop-bar-position-v1'));
  assert.strictEqual(afterReset.pinned, false);
  assert.strictEqual(afterReset.leftRatio, null);
  assert.strictEqual(afterReset.bottomRatio, null);
  // 无位置时重复 apply 不应把样式再次写回
  positioned.sandbox.applyDesktopBarPosition();
  assert.strictEqual(positioned.bar.style.left, '');

  // ---------- DOM 集成：拖动更新内联位置并在结束后持久化 ----------
  const drag = loadModuleSandbox({ bodyClasses: [] });
  drag.body.classList.add('desktop-wallpaper-mode');
  let pointerDefaultPrevented = 0;
  drag.sandbox.onDesktopBarPointerDown({
    button: 0, pointerId: 1, clientX: 960, clientY: 1000,
    preventDefault() { pointerDefaultPrevented += 1; },
    target: { nodeType: 1, closest() { return null; } },
  });
  assert.strictEqual(pointerDefaultPrevented, 1, 'pointerdown must prevent text-selection/native-drag default');
  assert.strictEqual(drag.windowListeners.has(drag.listenerKey('pointermove', true)), true,
    'window-level fallback must bind at pointerdown, before activation');
  drag.sandbox.onDesktopBarPointerMove({ pointerId: 1, clientX: 962, clientY: 999 });
  assert.strictEqual(drag.bar.style.left, '', 'movement below threshold must not start a drag');
  drag.sandbox.onDesktopBarPointerMove({ pointerId: 1, clientX: 990, clientY: 950 });
  assert.strictEqual(drag.bar.style.left, '990px', 'drag keeps the grab offset');
  assert.strictEqual(drag.bar.style.bottom, '100px');
  assert.strictEqual(drag.bar.classList.contains('desktop-bar-dragging'), true);
  assert.strictEqual(drag.bar.captureCalls, 2,
    'capture must be taken at pointerdown and re-asserted at activation');
  const dragBlurHandlers = drag.windowListeners.get(drag.listenerKey('blur', false)).slice();
  drag.sandbox.finishDesktopBarDrag({ pointerId: 1 }, true);
  assert.strictEqual(drag.bar.classList.contains('desktop-bar-dragging'), false);
  assert.strictEqual(drag.windowListeners.has(drag.listenerKey('pointermove', true)), false,
    'window-level fallback listeners must be released after finish');
  assert.strictEqual(drag.windowListeners.has(drag.listenerKey('pointerup', true)), false);
  assert.strictEqual(drag.windowListeners.has(drag.listenerKey('pointercancel', true)), false);
  const remainingBlur = drag.windowListeners.get(drag.listenerKey('blur', false)) || [];
  assert.strictEqual(remainingBlur.length, dragBlurHandlers.length - 1,
    'only the drag blur handler is released; permanent listeners stay');
  const saved = JSON.parse(drag.storage.getItem('MOMusic-desktop-bar-position-v1'));
  assert.strictEqual(saved.leftRatio, 990 / 1920);
  assert.strictEqual(saved.bottomRatio, 100 / 1080);

  // ---------- DOM 集成：拖拽中途窗口失焦 → 就地保存（桌面嵌入窗口有焦点抖动，不回滚） ----------
  const interrupted = loadModuleSandbox({
    storage: { 'MOMusic-desktop-bar-position-v1': JSON.stringify({ pinned: false, leftRatio: 0.5, bottomRatio: 0.2 }) },
  });
  interrupted.sandbox.onDesktopBarPointerDown({
    button: 0, pointerId: 1, clientX: 960, clientY: 1000,
    preventDefault() {},
    target: { nodeType: 1, closest() { return null; } },
  });
  interrupted.sandbox.onDesktopBarPointerMove({ pointerId: 1, clientX: 1100, clientY: 900 });
  assert.strictEqual(interrupted.bar.style.left, '1100px');
  interrupted.sandbox.onDesktopBarDragInterrupted();
  assert.strictEqual(interrupted.bar.style.left, '1100px', 'interrupted drag keeps the on-screen position');
  assert.strictEqual(interrupted.bar.style.bottom, '150px');
  assert.strictEqual(interrupted.bar.classList.contains('desktop-bar-dragging'), false);
  assert.strictEqual(interrupted.windowListeners.has(interrupted.listenerKey('pointermove', true)), false,
    'interrupted drag must release the window-level fallback listeners');
  assert.strictEqual(interrupted.windowListeners.has(interrupted.listenerKey('pointerup', true)), false);
  const afterInterrupt = JSON.parse(interrupted.storage.getItem('MOMusic-desktop-bar-position-v1'));
  assert.strictEqual(afterInterrupt.leftRatio, 1100 / 1920, 'interrupted drag must save where the bar actually is');
  assert.strictEqual(afterInterrupt.bottomRatio, 150 / 1080);

  // ---------- DOM 集成：rAF 批处理 —— 一帧至多一次布局写入 ----------
  const raf = loadModuleSandbox({ bodyClasses: [] });
  raf.body.classList.add('desktop-wallpaper-mode');
  let rafQueue = [];
  raf.sandbox.requestAnimationFrame = function (fn) { rafQueue.push(fn); return rafQueue.length; };
  raf.sandbox.cancelAnimationFrame = function () {};
  raf.sandbox.onDesktopBarPointerDown({
    button: 0, pointerId: 1, clientX: 960, clientY: 1000,
    preventDefault() {},
    target: { nodeType: 1, closest() { return null; } },
  });
  raf.sandbox.onDesktopBarPointerMove({ pointerId: 1, clientX: 990, clientY: 950 });
  assert.strictEqual(raf.bar.style.left, '', 'moves must be rAF-batched, not written per event');
  assert.strictEqual(rafQueue.length, 1, 'activation move schedules exactly one frame');
  raf.sandbox.onDesktopBarPointerMove({ pointerId: 1, clientX: 1000, clientY: 940 });
  assert.strictEqual(rafQueue.length, 1, 'moves within the same frame must not schedule extra frames');
  const rafQueued = rafQueue;
  rafQueue = [];
  rafQueued.forEach(function (fn) { fn(); });
  assert.strictEqual(raf.bar.style.left, '1000px', 'flushed frame applies the latest pointer position');
  assert.strictEqual(raf.bar.style.bottom, '110px');
  raf.sandbox.finishDesktopBarDrag({ pointerId: 1 }, true);
  const rafSaved = JSON.parse(raf.storage.getItem('MOMusic-desktop-bar-position-v1'));
  assert.strictEqual(rafSaved.leftRatio, 1000 / 1920);
  assert.strictEqual(rafSaved.bottomRatio, 110 / 1080);

  // ---------- DOM 集成：固定后禁止拖动 ----------
  const pinned = loadModuleSandbox({ bodyClasses: ['desktop-wallpaper-mode'] });
  pinned.sandbox.setDesktopBarPinned(true);
  assert.strictEqual(pinned.body.classList.contains('desktop-bar-pinned'), true);
  pinned.sandbox.onDesktopBarPointerDown({
    button: 0, pointerId: 1, clientX: 960, clientY: 1000,
    target: { nodeType: 1, closest() { return null; } },
  });
  pinned.sandbox.onDesktopBarPointerMove({ pointerId: 1, clientX: 1200, clientY: 800 });
  assert.strictEqual(pinned.bar.style.left, '', 'pinned bar must not move');

  // ---------- DOM 集成：右键菜单 ----------
  const menu = loadModuleSandbox({ bodyClasses: ['desktop-wallpaper-mode'] });
  let prevented = 0;
  assert.strictEqual(menu.sandbox.onDesktopBarContextMenu({ clientX: 100, clientY: 120, preventDefault() { prevented += 1; } }), undefined);
  assert.strictEqual(prevented, 1, 'context menu must suppress the native menu in desktop mode');
  assert.strictEqual(menu.sandbox.desktopBarPositionMenuOpen(), true);
  assert.strictEqual(menu.sandbox.desktopBarPositionMenu.id, 'desktop-bar-position-menu');
  menu.sandbox.handleDesktopBarMenuAction('pinned');
  assert.strictEqual(menu.sandbox.desktopBarPositionMenuOpen(), false, 'menu closes after choosing an action');
  assert.strictEqual(menu.sandbox.desktopBarPositionState.pinned, true);
  assert.strictEqual(JSON.parse(menu.storage.getItem('MOMusic-desktop-bar-position-v1')).pinned, true);
  menu.sandbox.handleDesktopBarMenuAction('free');
  assert.strictEqual(menu.sandbox.desktopBarPositionState.pinned, false);
  menu.sandbox.handleDesktopBarMenuAction('reset');
  assert.strictEqual(menu.sandbox.desktopBarPositionState.leftRatio, null, 'reset clears the saved position');

  const inactive = loadModuleSandbox({ bodyClasses: [] });
  inactive.sandbox.onDesktopBarContextMenu({ clientX: 100, clientY: 120, preventDefault() { prevented += 1; } });
  assert.strictEqual(prevented, 1, 'context menu must not hijack right-click outside desktop mode');

  // ---------- 源码装配标记 ----------
  const loader = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'index-loader.js'), 'utf8');
  const overlayEntry = loader.indexOf("'js/modules/10-shell/04-desktop-overlay-fullscreen.js',");
  const barPositionEntry = loader.indexOf("'js/modules/10-shell/04a-desktop-bar-position.js',");
  assert(overlayEntry !== -1, 'overlay runtime must stay registered in the loader');
  assert(barPositionEntry > overlayEntry, 'new module must load after the desktop overlay runtime');

  const moduleSource = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'js', 'modules', '10-shell', '04a-desktop-bar-position.js'),
    'utf8',
  );
  assert(moduleSource.includes("bar.addEventListener('contextmenu', onDesktopBarContextMenu)"),
    'bar must own the contextmenu handler');
  assert(moduleSource.includes("target.closest(DESKTOP_BAR_DRAG_EXCLUDE_SELECTOR)"),
    'drag start must exclude real controls');
  assert(moduleSource.includes("'#progress-bar'"), 'progress seek must stay reachable');
  assert(moduleSource.includes("'MOMusic-desktop-bar-position-v1'"), 'position persistence key must be stable');

  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'index.css'), 'utf8');
  assert(css.includes('#desktop-bar-position-menu'), 'menu styles missing');
  assert(css.includes('.desktop-bar-position-menu-item.active .check'), 'active check style missing');
  assert(/not\(\.desktop-bar-pinned\)[\s\S]{0,120}cursor:\s*grab/.test(css), 'grab cursor rule missing');
  assert(css.includes('#bottom-bar.desktop-bar-dragging'), 'dragging state styles missing');

  console.log('[OK] Desktop bar position: ratio persistence, safe-area clamping, drag lifecycle, pin menu, and loader wiring verified.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
