// ============================================================
// 03-splash.js — 启动动画已移除（无启动画面直进主页）
// 保留原 splash 的"揭示"生命周期：DOMContentLoaded 后立即按
// 原"秒启动" instant 路径揭示主页，不再渲染任何启动画面。
// 对外契约不变：reduceSplashMotion 全局（05-startup-login-guide
// 读取）、finishSplashReveal / releaseStartupFastSkipPreload。
// ============================================================

var reduceSplashMotion = false;
try {
  reduceSplashMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
} catch (e) { }

// 防御：清除可能残留的 splash DOM 与启动期 body 状态。
// 多个模块以 body.splash-active 判断"是否仍在启动阶段"，
// 启动动画移除后该 class 不应再出现。
(function removeSplashDom() {
  try {
    document.body.classList.remove('splash-active');
    document.body.classList.remove('splash-revealing');
    var s = document.getElementById('splash');
    if (s && s.parentNode) s.parentNode.removeChild(s);
  } catch (e) { }
})();

function releaseStartupFastSkipPreload() {
  if (!document.documentElement.classList.contains('startup-fast-skip-preload')) return false;
  document.body.classList.add('startup-fast-skip-revealing');
  document.documentElement.classList.remove('startup-fast-skip-preload');
  setTimeout(function () { document.body.classList.remove('startup-fast-skip-revealing'); }, 520);
  return true;
}

// ============================================================
// 生命周期函数（外部调用接口，签名不变）
// ============================================================
function finishSplashReveal(forceLoad, opts) {
  opts = opts || {};
  markAppPerf('home-revealed');
  releaseStartupFastSkipPreload();
  requestAnimationFrame(function () {
    var homeShown = updateEmptyHomeVisibility({ forceLoad: forceLoad !== false });
    if (!homeShown && shouldForceEmptyHomeAfterSplash()) {
      homeSuppressed = false;
      homeForcedOpen = true;
      homeShown = updateEmptyHomeVisibility({ forceLoad: forceLoad !== false });
    }
    requestAnimationFrame(function () {
      markStartupHomeReadyForAutoplay(opts.reason || 'splash', opts.fastSkip ? 240 : 100);
      var guideStarted = maybeRunStartupVisualGuide('splash');
      if (!guideStarted && !hasAnyPlatformLogin()) maybeRunStartupLoginGuide('splash');
      else if (!guideStarted && !homeShown) maybeRunStartupLoginGuide('splash');
      setTimeout(maybeShowUploadTipOnce, 5200);
    });
  });
}

// ============================================================
// 直进主页：与原 instant-dismiss（秒启动）路径一致
// ============================================================
document.addEventListener('DOMContentLoaded', function () {
  markAppPerf('dom-content-loaded');
  markAppPerf('splash-skip');
  revealIdleParticles(0, 520);
  finishSplashReveal(true, { fastSkip: true, reason: 'splash-removed' });
});
