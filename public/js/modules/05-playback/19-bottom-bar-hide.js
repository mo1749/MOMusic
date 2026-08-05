'use strict';

/**
 * 19-bottom-bar-hide.js - 播放栏隐藏 / 恢复功能
 *
 * 在底部播放控制栏添加一个向下箭头按钮，点击后播放栏向下滑出视野
 * （#bottom-bar.collapsed），再点击恢复。
 * 当播放栏收起时，bottom-handle 旁显示一个上箭头恢复按钮。
 * 恢复按钮在无鼠标交互时自动隐藏，鼠标靠近底部中央时自动显示。
 */

var bottomBarRestoreAutoHideTimer = null;
var bottomBarRestoreVisible = false;

function showBottomBarRestoreBtn() {
  var restoreBtn = document.getElementById('bottom-bar-restore-btn');
  if (!restoreBtn) return;
  restoreBtn.hidden = false;
  bottomBarRestoreVisible = true;
  if (bottomBarRestoreAutoHideTimer) { clearTimeout(bottomBarRestoreAutoHideTimer); bottomBarRestoreAutoHideTimer = null; }
  bottomBarRestoreAutoHideTimer = setTimeout(function () {
    bottomBarRestoreAutoHideTimer = null;
    var bar = document.getElementById('bottom-bar');
    if (!bar || !bar.classList.contains('collapsed')) return;
    var btn = document.getElementById('bottom-bar-restore-btn');
    if (!btn) return;
    var r = btn.getBoundingClientRect();
    // 鼠标仍在按钮区域则不隐藏
    if (typeof lastPointerX === 'number' && typeof lastPointerY === 'number' &&
        lastPointerX >= r.left - 30 && lastPointerX <= r.right + 30 &&
        lastPointerY >= r.top - 30 && lastPointerY <= r.bottom + 30) {
      showBottomBarRestoreBtn();
      return;
    }
    btn.hidden = true;
    bottomBarRestoreVisible = false;
  }, 3000);
}

function hideBottomBarRestoreBtn() {
  var restoreBtn = document.getElementById('bottom-bar-restore-btn');
  if (restoreBtn) restoreBtn.hidden = true;
  bottomBarRestoreVisible = false;
  if (bottomBarRestoreAutoHideTimer) { clearTimeout(bottomBarRestoreAutoHideTimer); bottomBarRestoreAutoHideTimer = null; }
}

var lastPointerX = -1, lastPointerY = -1;

function toggleBottomBarCollapse() {
  var bar = document.getElementById('bottom-bar');
  if (!bar) return;

  var collapsed = bar.classList.toggle('collapsed');

  // 更新栏内隐藏按钮的 title / aria-label
  var btn = document.getElementById('bottom-bar-hide-btn');
  if (btn) {
    btn.title = collapsed ? '展开播放栏' : '隐藏播放栏';
    btn.setAttribute('aria-label', collapsed ? '展开播放栏' : '隐藏播放栏');
  }

  if (collapsed) {
    // 播放栏收起后，恢复按钮先显示再自动隐藏
    showBottomBarRestoreBtn();
  } else {
    // 恢复播放栏，隐藏恢复按钮
    hideBottomBarRestoreBtn();
    var handle = document.getElementById('bottom-handle');
    if (handle) handle.classList.remove('active');
    if (typeof revealBottomControls === 'function') {
      revealBottomControls(6000);
    }
  }

  // 派发自定义事件供其他模块监听
  var evt = document.createEvent('CustomEvent');
  evt.initCustomEvent('bottom-bar-collapse-change', false, false, { collapsed: collapsed });
  bar.dispatchEvent(evt);
}

// 监听鼠标移动，播放栏收起时鼠标靠近底部中央则显示恢复按钮
document.addEventListener('pointermove', function (e) {
  lastPointerX = e.clientX;
  lastPointerY = e.clientY;
  var bar = document.getElementById('bottom-bar');
  if (!bar || !bar.classList.contains('collapsed')) return;
  var restoreBtn = document.getElementById('bottom-bar-restore-btn');
  if (!restoreBtn || restoreBtn.hidden) return;
  var r = restoreBtn.getBoundingClientRect();
  // 鼠标在按钮附近 (底部中央区域) 时显示
  if (e.clientX >= r.left - 60 && e.clientX <= r.right + 60 &&
      e.clientY >= r.top - 40 && e.clientY <= r.bottom + 30) {
    showBottomBarRestoreBtn();
  }
}, { passive: true });
