'use strict';

/**
 * 04a-desktop-bar-position.js - 桌面模式播放栏拖动 / 固定
 *
 * 仅在完整桌面模式（body.desktop-wallpaper-mode）下生效：
 *  1. 按住播放栏空白区域或歌名文字拖动，可改变播放栏在桌面上的位置，
 *     拖动范围受任务栏安全区（--desktop-safe-*）约束；
 *  2. 右键播放栏弹出菜单，可在「自由拖动 / 固定位置」间切换，并可重置回默认位置；
 *  3. 位置以视口比例持久化（localStorage），换分辨率后仍按比例还原；
 *  4. 拖动结束后的首次 click 会被吞掉，避免歌名区的“歌曲详情”误触发。
 * 正常窗口模式不受影响：退出桌面模式时清除内联定位，交还给 CSS 规则。
 */

var DESKTOP_BAR_POSITION_STORAGE_KEY = 'MOMusic-desktop-bar-position-v1';
var DESKTOP_BAR_DRAG_THRESHOLD = 5;
var DESKTOP_BAR_DRAG_EXCLUDE_SELECTOR = [
  'button', 'a', 'input', 'select', 'textarea', 'label',
  '[role="button"]', '[role="slider"]',
  '#progress-bar', '#mini-queue-popover', '#volume-control',
  '.quality-popover', '.volume-popover',
  '.no-desktop-bar-drag'
].join(', ');

var desktopBarPositionState = { pinned: false, leftRatio: null, bottomRatio: null };
var desktopBarDragState = {
  pending: false,
  active: false,
  moved: false,
  pointerId: -1,
  startX: 0,
  startY: 0,
  grabOffsetX: 0,
  grabOffsetY: 0
};
// 拖拽帧调度：指针事件只记录坐标，实际写样式合并到每帧一次，
// 避免高回报率鼠标下每条 move 都强制重排整块玻璃面板造成闪烁
var desktopBarDragFrame = 0;
var desktopBarDragLatest = { x: 0, y: 0 };
var desktopBarDragInsets = null;
var desktopBarPositionMenu = null;
var desktopBarPositionModeWasActive = false;
var desktopBarPositionClickSuppress = false;
var desktopBarPositionClickSuppressTimer = 0;
var desktopBarPositionBodyObserver = null;

function desktopBarElement() {
  if (typeof document === 'undefined') return null;
  return document.getElementById('bottom-bar');
}

function desktopBarPositionModeActive() {
  if (typeof document === 'undefined' || !document.body) return false;
  return document.body.classList.contains('desktop-wallpaper-mode');
}

// ---------- 纯逻辑（供测试与主流程共用） ----------

function desktopBarPositionStateFromRaw(raw) {
  var state = { pinned: false, leftRatio: null, bottomRatio: null };
  if (!raw || typeof raw !== 'object') return state;
  state.pinned = raw.pinned === true;
  var left = Number(raw.leftRatio);
  var bottom = Number(raw.bottomRatio);
  if (isFinite(left) && left >= 0 && left <= 1) state.leftRatio = left;
  if (isFinite(bottom) && bottom >= 0 && bottom <= 1) state.bottomRatio = bottom;
  // 两个比例必须成对出现，避免半套数据把播放栏钉在旧轴上
  if ((state.leftRatio === null) !== (state.bottomRatio === null)) {
    state.leftRatio = null;
    state.bottomRatio = null;
  }
  return state;
}

function desktopBarClampPosition(centerX, bottomOffset, viewportWidth, viewportHeight, barWidth, barHeight, insets) {
  var safe = insets && typeof insets === 'object' ? insets : {};
  var halfWidth = Math.max(0, Number(barWidth) || 0) / 2;
  var height = Math.max(0, Number(barHeight) || 0);
  var minCenterX = (Number(safe.left) || 0) + halfWidth;
  var maxCenterX = Math.max(minCenterX, (Number(viewportWidth) || 0) - (Number(safe.right) || 0) - halfWidth);
  var minBottom = Number(safe.bottom) || 0;
  var maxBottom = Math.max(minBottom, (Number(viewportHeight) || 0) - (Number(safe.top) || 0) - height);
  return {
    left: Math.min(maxCenterX, Math.max(minCenterX, Number(centerX) || 0)),
    bottom: Math.min(maxBottom, Math.max(minBottom, Number(bottomOffset) || 0))
  };
}

function desktopBarRatiosFromPosition(left, bottom, viewportWidth, viewportHeight) {
  var width = Number(viewportWidth) || 0;
  var height = Number(viewportHeight) || 0;
  if (width <= 0 || height <= 0) return { leftRatio: null, bottomRatio: null };
  return {
    leftRatio: Math.min(1, Math.max(0, (Number(left) || 0) / width)),
    bottomRatio: Math.min(1, Math.max(0, (Number(bottom) || 0) / height))
  };
}

function desktopBarPositionFromState(state, viewportWidth, viewportHeight) {
  if (!state || typeof state.leftRatio !== 'number' || typeof state.bottomRatio !== 'number') return null;
  return {
    left: state.leftRatio * (Number(viewportWidth) || 0),
    bottom: state.bottomRatio * (Number(viewportHeight) || 0)
  };
}

// ---------- 存储 ----------

function readDesktopBarPositionStorage() {
  try {
    if (typeof localStorage === 'undefined') return null;
    var raw = localStorage.getItem(DESKTOP_BAR_POSITION_STORAGE_KEY);
    if (!raw) return null;
    return desktopBarPositionStateFromRaw(JSON.parse(raw));
  } catch (_) {
    return null;
  }
}

function saveDesktopBarPositionStorage() {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(DESKTOP_BAR_POSITION_STORAGE_KEY, JSON.stringify(desktopBarPositionState));
  } catch (_) {}
}

// ---------- 位置应用 ----------

function desktopBarSafeInsets() {
  var result = { top: 0, right: 0, bottom: 0, left: 0 };
  if (typeof window === 'undefined' || !window.getComputedStyle) return result;
  if (typeof document === 'undefined' || !document.documentElement) return result;
  var style = window.getComputedStyle(document.documentElement);
  if (!style) return result;
  ['top', 'right', 'bottom', 'left'].forEach(function (name) {
    var value = parseFloat(style.getPropertyValue('--desktop-safe-' + name));
    if (isFinite(value) && value > 0) result[name] = value;
  });
  return result;
}

function applyDesktopBarPosition() {
  var bar = desktopBarElement();
  if (!bar) return;
  var active = desktopBarPositionModeActive();
  if (typeof document !== 'undefined' && document.body) {
    document.body.classList.toggle('desktop-bar-pinned', active && desktopBarPositionState.pinned === true);
  }
  // 拖拽进行中内联位置由拖拽帧驱动，状态同步不得用旧存档位置覆盖（否则闪回）
  if (desktopBarDragState.active) return;
  if (!active) {
    bar.style.left = '';
    bar.style.bottom = '';
    return;
  }
  if (typeof window === 'undefined' || !window.innerWidth || !window.innerHeight) return;
  var desired = desktopBarPositionFromState(desktopBarPositionState, window.innerWidth, window.innerHeight);
  if (!desired) {
    // 无自定义位置（含“重置位置”之后）：必须清掉拖动遗留的内联样式，交还给 CSS 规则
    bar.style.left = '';
    bar.style.bottom = '';
    return;
  }
  var clamped = desktopBarClampPosition(
    desired.left, desired.bottom,
    window.innerWidth, window.innerHeight,
    bar.offsetWidth, bar.offsetHeight,
    desktopBarSafeInsets()
  );
  bar.style.left = clamped.left + 'px';
  bar.style.bottom = clamped.bottom + 'px';
}

function syncDesktopBarPositionUi() {
  var active = desktopBarPositionModeActive();
  if (active !== desktopBarPositionModeWasActive) {
    desktopBarPositionModeWasActive = active;
    if (!active) hideDesktopBarPositionMenu();
  }
  applyDesktopBarPosition();
}

function dispatchDesktopBarPositionChange() {
  var bar = desktopBarElement();
  if (!bar || typeof document.createEvent !== 'function') return;
  var evt = document.createEvent('CustomEvent');
  evt.initCustomEvent('bottom-bar-position-change', false, false, {
    pinned: desktopBarPositionState.pinned === true,
    hasCustomPosition: typeof desktopBarPositionState.leftRatio === 'number'
      && typeof desktopBarPositionState.bottomRatio === 'number'
  });
  bar.dispatchEvent(evt);
}

// ---------- 拖动 ----------

function desktopBarDragStartAllowed(target) {
  if (!target || target.nodeType !== 1 || typeof target.closest !== 'function') return false;
  if (target.closest(DESKTOP_BAR_DRAG_EXCLUDE_SELECTOR)) return false;
  return true;
}

function onDesktopBarPointerDown(event) {
  if (!event || event.button !== 0) return;
  if (desktopBarPositionMenuOpen()) hideDesktopBarPositionMenu();
  var bar = desktopBarElement();
  if (!bar || !desktopBarPositionModeActive()) return;
  if (!bar.classList.contains('visible') || bar.classList.contains('collapsed')) return;
  if (desktopBarPositionState.pinned) return;
  if (!desktopBarDragStartAllowed(event.target)) return;
  // 上一次拖拽若被系统中断（指针捕获丢失、窗口重挂载）可能残留状态，这里自愈
  if (desktopBarDragState.pending || desktopBarDragState.active) {
    bar.classList.remove('desktop-bar-dragging');
    desktopBarDragState.pending = false;
    desktopBarDragState.active = false;
    unbindDesktopBarDragWindowListeners();
  }
  // 阻止指针按下默认行为（文本选择 / 原生拖拽），否则从歌名等文字区起拖会被选择机制抢走
  if (typeof event.preventDefault === 'function') event.preventDefault();
  var state = desktopBarDragState;
  state.pending = true;
  state.active = false;
  state.moved = false;
  state.pointerId = event.pointerId;
  state.startX = event.clientX;
  state.startY = event.clientY;
  desktopBarDragLatest.x = event.clientX;
  desktopBarDragLatest.y = event.clientY;
  try {
    bar.setPointerCapture(event.pointerId);
  } catch (_) {}
  // 阈值检测阶段也挂 window 兜底：嵌入式桌面窗口里元素级捕获偶发失效时，
  // 移动事件仍能到达，拖拽不会在激活前就“失灵”
  bindDesktopBarDragWindowListeners();
}

function onDesktopBarPointerMove(event) {
  var state = desktopBarDragState;
  if ((!state.pending && !state.active) || !event || state.pointerId !== event.pointerId) return;
  var bar = desktopBarElement();
  if (!bar || !desktopBarPositionModeActive() || desktopBarPositionState.pinned) {
    finishDesktopBarDrag(event, false);
    return;
  }
  if (!state.active) {
    var dx = event.clientX - state.startX;
    var dy = event.clientY - state.startY;
    if (Math.abs(dx) < DESKTOP_BAR_DRAG_THRESHOLD && Math.abs(dy) < DESKTOP_BAR_DRAG_THRESHOLD) return;
    // 捕获可能在按下后丢失（窗口重挂载等），激活时重新校验并补挂
    try {
      if (typeof bar.hasPointerCapture === 'function'
        && !bar.hasPointerCapture(state.pointerId)
        && typeof bar.setPointerCapture === 'function') {
        bar.setPointerCapture(state.pointerId);
      }
    } catch (_) {}
    var startRect = bar.getBoundingClientRect();
    state.active = true;
    state.moved = true;
    state.grabOffsetX = state.startX - startRect.left;
    state.grabOffsetY = state.startY - startRect.top;
    bar.classList.add('desktop-bar-dragging');
  }
  desktopBarDragLatest.x = event.clientX;
  desktopBarDragLatest.y = event.clientY;
  scheduleDesktopBarDragFrame(bar);
  if (event.cancelable) event.preventDefault();
}

// ---------- 拖拽帧应用（每帧至多一次布局写入） ----------

function scheduleDesktopBarDragFrame(bar) {
  if (typeof requestAnimationFrame !== 'function') {
    applyDesktopBarDragFrame(bar);
    return;
  }
  if (desktopBarDragFrame) return;
  desktopBarDragFrame = requestAnimationFrame(function () {
    desktopBarDragFrame = 0;
    if (desktopBarDragState.active) applyDesktopBarDragFrame(desktopBarElement());
  });
}

function cancelDesktopBarDragFrame() {
  if (desktopBarDragFrame && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(desktopBarDragFrame);
  }
  desktopBarDragFrame = 0;
}

function applyDesktopBarDragFrame(bar) {
  if (!bar || typeof window === 'undefined') return;
  var width = window.innerWidth || 1;
  var height = window.innerHeight || 1;
  var barWidth = bar.offsetWidth || 320;
  var barHeight = bar.offsetHeight || 96;
  var nextLeft = desktopBarDragLatest.x - desktopBarDragState.grabOffsetX;
  var nextTop = desktopBarDragLatest.y - desktopBarDragState.grabOffsetY;
  var clamped = desktopBarClampPosition(
    nextLeft + barWidth / 2, height - nextTop - barHeight,
    width, height,
    barWidth, barHeight,
    desktopBarDragInsets || desktopBarSafeInsets()
  );
  bar.style.left = clamped.left + 'px';
  bar.style.bottom = clamped.bottom + 'px';
}

function finishDesktopBarDrag(event, flushPendingFrame) {
  var state = desktopBarDragState;
  if (!state.pending && !state.active) return;
  if (event && state.pointerId !== -1 && state.pointerId !== event.pointerId) return;
  var bar = desktopBarElement();
  var wasActive = state.active;
  state.pending = false;
  state.active = false;
  state.pointerId = -1;
  unbindDesktopBarDragWindowListeners();
  if (!wasActive) return;
  cancelDesktopBarDragFrame();
  if (bar) {
    // 松手时同步落定最后一帧；中断（失焦/系统取消）则停在已渲染的位置——
    // 嵌入式桌面窗口有焦点抖动，中断一律就地保存而不是回滚到旧位置
    if (flushPendingFrame) applyDesktopBarDragFrame(bar);
    bar.classList.remove('desktop-bar-dragging');
    desktopBarDragInsets = null;
    var left = parseFloat(bar.style.left);
    var bottom = parseFloat(bar.style.bottom);
    if (isFinite(left) && isFinite(bottom) && typeof window !== 'undefined') {
      var ratios = desktopBarRatiosFromPosition(left, bottom, window.innerWidth || 0, window.innerHeight || 0);
      desktopBarPositionState.leftRatio = ratios.leftRatio;
      desktopBarPositionState.bottomRatio = ratios.bottomRatio;
      saveDesktopBarPositionStorage();
      dispatchDesktopBarPositionChange();
      if (typeof scheduleDesktopIconShieldReport === 'function') scheduleDesktopIconShieldReport(false);
    }
  }
  suppressDesktopBarClickOnce();
}

function suppressDesktopBarClickOnce() {
  desktopBarPositionClickSuppress = true;
  if (desktopBarPositionClickSuppressTimer) clearTimeout(desktopBarPositionClickSuppressTimer);
  desktopBarPositionClickSuppressTimer = setTimeout(function () {
    desktopBarPositionClickSuppress = false;
    desktopBarPositionClickSuppressTimer = 0;
  }, 400);
}

// ---------- 拖拽的窗口级兜底监听 ----------
// 元素级指针捕获在桌面模式窗口重挂载 / 系统手势打断时可能失效或不生效；
// 从 pointerdown 起就挂在 window 捕获阶段，保证阈值检测、移动与收尾一定可达。

function bindDesktopBarDragWindowListeners() {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  window.addEventListener('pointermove', onDesktopBarPointerMove, true);
  window.addEventListener('pointerup', onDesktopBarWindowPointerUp, true);
  window.addEventListener('pointercancel', onDesktopBarWindowPointerCancel, true);
  window.addEventListener('blur', onDesktopBarDragInterrupted);
}

function unbindDesktopBarDragWindowListeners() {
  if (typeof window === 'undefined' || typeof window.removeEventListener !== 'function') return;
  window.removeEventListener('pointermove', onDesktopBarPointerMove, true);
  window.removeEventListener('pointerup', onDesktopBarWindowPointerUp, true);
  window.removeEventListener('pointercancel', onDesktopBarWindowPointerCancel, true);
  window.removeEventListener('blur', onDesktopBarDragInterrupted);
}

function onDesktopBarWindowPointerUp(event) {
  finishDesktopBarDrag(event, true);
}

function onDesktopBarWindowPointerCancel(event) {
  finishDesktopBarDrag(event, false);
}

function onDesktopBarDragInterrupted() {
  finishDesktopBarDrag(null, false);
}

// ---------- 右键菜单 ----------

function desktopBarPositionMenuOpen() {
  return !!(desktopBarPositionMenu && desktopBarPositionMenu.classList.contains('open'));
}

function buildDesktopBarMenuItem(kind, label, radio) {
  var item = document.createElement('button');
  item.type = 'button';
  item.className = 'desktop-bar-position-menu-item';
  item.setAttribute('role', radio ? 'menuitemradio' : 'menuitem');
  item.setAttribute('data-bar-position-action', kind);
  var text = document.createElement('span');
  text.className = 'label';
  text.textContent = label;
  var check = document.createElement('span');
  check.className = 'check';
  check.textContent = '✓';
  item.appendChild(text);
  item.appendChild(check);
  item.addEventListener('click', function (event) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
    handleDesktopBarMenuAction(kind);
  });
  return item;
}

function ensureDesktopBarPositionMenu() {
  if (desktopBarPositionMenu || typeof document === 'undefined' || !document.body) return desktopBarPositionMenu;
  var menu = document.createElement('div');
  menu.id = 'desktop-bar-position-menu';
  menu.setAttribute('role', 'menu');
  menu.appendChild(buildDesktopBarMenuItem('free', '自由拖动', true));
  menu.appendChild(buildDesktopBarMenuItem('pinned', '固定位置', true));
  var divider = document.createElement('div');
  divider.className = 'desktop-bar-position-menu-divider';
  menu.appendChild(divider);
  menu.appendChild(buildDesktopBarMenuItem('reset', '重置位置', false));
  document.body.appendChild(menu);
  desktopBarPositionMenu = menu;
  return menu;
}

function syncDesktopBarPositionMenuChecks() {
  if (!desktopBarPositionMenu) return;
  var pinned = desktopBarPositionState.pinned === true;
  desktopBarPositionMenu.querySelectorAll('[data-bar-position-action]').forEach(function (item) {
    var kind = item.getAttribute('data-bar-position-action');
    item.classList.toggle('active', kind === 'free' ? !pinned : kind === 'pinned' ? pinned : false);
    if (item.getAttribute('role') === 'menuitemradio') {
      item.setAttribute('aria-checked', (kind === 'pinned') === pinned ? 'true' : 'false');
    }
  });
}

function showDesktopBarPositionMenu(x, y) {
  if (!desktopBarPositionModeActive()) return false;
  var menu = ensureDesktopBarPositionMenu();
  if (!menu) return false;
  syncDesktopBarPositionMenuChecks();
  menu.classList.add('open');
  var width = menu.offsetWidth || 180;
  var height = menu.offsetHeight || 150;
  var viewportWidth = (typeof window !== 'undefined' && window.innerWidth) || width;
  var viewportHeight = (typeof window !== 'undefined' && window.innerHeight) || height;
  menu.style.left = Math.min(Math.max(8, x), viewportWidth - width - 8) + 'px';
  menu.style.top = Math.min(Math.max(8, y), viewportHeight - height - 8) + 'px';
  return true;
}

function hideDesktopBarPositionMenu() {
  if (desktopBarPositionMenu) desktopBarPositionMenu.classList.remove('open');
}

function handleDesktopBarMenuAction(kind) {
  hideDesktopBarPositionMenu();
  if (kind === 'free') setDesktopBarPinned(false);
  else if (kind === 'pinned') setDesktopBarPinned(true);
  else if (kind === 'reset') resetDesktopBarPosition();
}

function setDesktopBarPinned(pinned) {
  desktopBarPositionState.pinned = pinned === true;
  saveDesktopBarPositionStorage();
  applyDesktopBarPosition();
  dispatchDesktopBarPositionChange();
  if (typeof showToast === 'function') {
    showToast(pinned ? '播放栏已固定，右键播放栏可重新解锁' : '播放栏已解锁，按住空白处即可拖动');
  }
}

function resetDesktopBarPosition() {
  // 重置 = 恢复出厂态：位置与固定状态一并还原，否则固定残留会让“重置后拖不动”
  desktopBarPositionState.pinned = false;
  desktopBarPositionState.leftRatio = null;
  desktopBarPositionState.bottomRatio = null;
  saveDesktopBarPositionStorage();
  applyDesktopBarPosition();
  dispatchDesktopBarPositionChange();
  if (typeof scheduleDesktopIconShieldReport === 'function') scheduleDesktopIconShieldReport(false);
  if (typeof showToast === 'function') showToast('播放栏位置已重置');
}

function onDesktopBarContextMenu(event) {
  if (!event || !desktopBarPositionModeActive()) return;
  var target = event.target;
  if (target && typeof target.closest === 'function' && target.closest('#mini-queue-popover')) return;
  event.preventDefault();
  showDesktopBarPositionMenu(event.clientX, event.clientY);
}

// ---------- 初始化 ----------

function initDesktopBarPosition() {
  if (typeof document === 'undefined' || !document.body) return;
  desktopBarPositionState = readDesktopBarPositionStorage() || desktopBarPositionState;
  var bar = desktopBarElement();
  if (bar) {
    bar.addEventListener('pointerdown', onDesktopBarPointerDown);
    bar.addEventListener('pointermove', onDesktopBarPointerMove);
    bar.addEventListener('pointerup', function (event) { finishDesktopBarDrag(event, true); });
    bar.addEventListener('pointercancel', function (event) { finishDesktopBarDrag(event, false); });
    bar.addEventListener('contextmenu', onDesktopBarContextMenu);
  }
  document.addEventListener('click', function (event) {
    if (!desktopBarPositionClickSuppress) return;
    desktopBarPositionClickSuppress = false;
    if (desktopBarPositionClickSuppressTimer) {
      clearTimeout(desktopBarPositionClickSuppressTimer);
      desktopBarPositionClickSuppressTimer = 0;
    }
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
  }, true);
  document.addEventListener('pointerdown', function (event) {
    if (!desktopBarPositionMenuOpen()) return;
    if (desktopBarPositionMenu && desktopBarPositionMenu.contains(event.target)) return;
    hideDesktopBarPositionMenu();
  }, true);
  document.addEventListener('keydown', function (event) {
    if (event && (event.key === 'Escape' || event.keyCode === 27) && desktopBarPositionMenuOpen()) {
      hideDesktopBarPositionMenu();
    }
  });
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('resize', function () {
      if (desktopBarPositionModeActive()) applyDesktopBarPosition();
    }, { passive: true });
    window.addEventListener('blur', hideDesktopBarPositionMenu);
  }
  if (typeof MutationObserver === 'function') {
    desktopBarPositionBodyObserver = new MutationObserver(function () {
      syncDesktopBarPositionUi();
    });
    desktopBarPositionBodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }
  syncDesktopBarPositionUi();
}

initDesktopBarPosition();
