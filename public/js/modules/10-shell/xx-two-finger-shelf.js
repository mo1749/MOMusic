// 双指同击手势：Home 关闭后（任意非弹层界面），双指几乎同时点击屏幕 -> 唤起歌单架
// 判定：两指落下间隔 <60ms、总时长 <250ms、位移 <15px、期间保持 2 指、无弹层打开。
// 与单指点击/滑动、双指缩放完全隔离：touchend 时 preventDefault 阻止合成 click。
(function () {
  'use strict';

  var downTouches = [];
  var fingerDown = false;
  var downAt = 0;

  function isUiBusy() {
    try {
      if (document.getElementById('playlist-panel') && document.getElementById('playlist-panel').classList.contains('show')) return true;
      var masks = document.querySelectorAll('.modal-mask');
      for (var i = 0; i < masks.length; i++) {
        var m = masks[i];
        if (m && m.getAttribute('aria-hidden') === 'false') return true;
      }
      return false;
    } catch (e) {
      return true;
    }
  }

  document.addEventListener('touchstart', function (e) {
    if (e.touches.length === 2 && !fingerDown && !isUiBusy()) {
      fingerDown = true;
      downAt = Date.now();
      downTouches = [{ x: e.touches[0].clientX, y: e.touches[0].clientY }, { x: e.touches[1].clientX, y: e.touches[1].clientY }];
    }
  }, { passive: true });

  document.addEventListener('touchmove', function (e) {
    if (!fingerDown) return;
    for (var i = 0; i < e.touches.length && i < 2; i++) {
      var t = e.touches[i];
      var d = downTouches[i] || { x: 0, y: 0 };
      if (Math.abs(t.clientX - d.x) > 15 || Math.abs(t.clientY - d.y) > 15) {
        fingerDown = false;
        return;
      }
    }
  }, { passive: true });

  // 真机事件流是逐指触发（s1->s2->e1->e0），不能要求两指同帧抬起；
  // 改为：两指都抬完（e.touches.length===0）且从按下到全部抬起 <250ms 即判定。
  // 双指同击 = 唤出/收起 3D 歌单架（shelfPinnedOpen toggle）；3D 架不可用时回退平面歌单面板。
  document.addEventListener('touchend', function (e) {
    if (!fingerDown) return;
    var dt = Date.now() - downAt;
    if (e.touches.length === 0) {
      fingerDown = false;
      if (dt > 0 && dt < 250) {
        e.preventDefault();
        if (typeof setShelfPinnedOpen === 'function' && typeof shelfPinnedOpen === 'boolean') {
          setShelfPinnedOpen(!shelfPinnedOpen, true);
        } else if (typeof window.togglePlaylistPanel === 'function') {
          window.togglePlaylistPanel();
        }
      }
    }
  }, { passive: false });

  document.addEventListener('touchcancel', function () {
    fingerDown = false;
  }, { passive: true });
})();
