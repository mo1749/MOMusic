// ============================================================
// 03-splash.js — MoMusic Splash Animation (Canvas 2D only)
// 全新设计：Canvas 2D 深色渐变背景 + 脉冲波纹 + 浮动粒子
// ============================================================

document.body.classList.add('splash-active');
var splashAnimating = true;
var splashCanvas = null, splashCtx = null;
var splashW = 0, splashH = 0;
var splashPixelRatio = 1;
var splashStartedAt = performance.now();
var splashSoundPlayed = false;
var splashAudioCtx = null;
var splashSoundFallbackArmed = false;
var splashTimer = null;
var reduceSplashMotion = false;
var splashReadyToEnter = false;

// Pulse ring pool
var splashPulseRings = [];
// Floating ambient particles
var splashParticles = [];
var splashAppIconImage = null;
var splashAppIconLoaded = false;
(function preloadSplashAppIcon() {
  splashAppIconImage = new Image();
  splashAppIconImage.onload = function () { splashAppIconLoaded = true; };
  splashAppIconImage.onerror = function () { splashAppIconLoaded = false; };
  splashAppIconImage.src = 'build/icon.png';
})();



function splashClamp01(v) { return Math.max(0, Math.min(1, v)); }
function splashSmoothstep(edge0, edge1, x) {
  var t = splashClamp01((x - edge0) / Math.max(0.0001, edge1 - edge0));
  return t * t * (3 - 2 * t);
}
function splashEaseOutCubic(t) {
  t = splashClamp01(t);
  return 1 - Math.pow(1 - t, 3);
}
function splashTimelineElapsed(elapsed) {
  return elapsed;
}
function stopSplashIntroSound() {
  if (!splashAudioCtx) return;
  try {
    if (splashAudioCtx.close) splashAudioCtx.close();
  } catch (e) { }
  splashAudioCtx = null;
}
function releaseStartupFastSkipPreload() {
  if (!document.documentElement.classList.contains('startup-fast-skip-preload')) return false;
  document.body.classList.add('startup-fast-skip-revealing');
  document.documentElement.classList.remove('startup-fast-skip-preload');
  setTimeout(function () { document.body.classList.remove('startup-fast-skip-revealing'); }, 520);
  return true;
}

// ============================================================
// AppIcon Canvas Drawing — 圆形+M音符图案
// ============================================================
function drawSplashAppIcon(ctx, cx, cy, pxSize, rotation, glowAlpha) {
  if (pxSize <= 1) return;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);

  var s = pxSize / 96;

  // ---- Outer glow ----
  if (glowAlpha > 0.005) {
    ctx.shadowColor = 'rgba(80, 140, 240, ' + Math.min(0.8, (glowAlpha * 1.2)).toFixed(3) + ')';
    ctx.shadowBlur = 55 * s;
  }

  // ---- Blue-purple gradient for strokes/fills ----
  var grad = ctx.createLinearGradient(-48 * s, -48 * s, 48 * s, 48 * s);
  grad.addColorStop(0, '#508cf0');
  grad.addColorStop(1, '#a855f7');

  // ---- 1. Outer circle frame ----
  ctx.beginPath();
  ctx.arc(0, 0, 44 * s, 0, Math.PI * 2);
  ctx.strokeStyle = grad;
  ctx.lineWidth = 1.5 * s;
  ctx.stroke();

  // ---- 2. Inner decorative circle ----
  ctx.beginPath();
  ctx.arc(0, 0, 28 * s, 0, Math.PI * 2);
  ctx.strokeStyle = grad;
  ctx.lineWidth = 0.5 * s;
  ctx.stroke();

  // ---- 3. M-note stem path ----
  ctx.beginPath();
  ctx.moveTo(-10 * s, 12 * s);
  ctx.lineTo(-10 * s, -20 * s);
  ctx.lineTo(18 * s, -24 * s);
  ctx.lineTo(18 * s, 0);
  ctx.strokeStyle = grad;
  ctx.lineWidth = 2.5 * s;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';

  // ---- 4. Note head circles ----
  ctx.beginPath();
  ctx.arc(-15 * s, 12 * s, 7 * s, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(13 * s, 4 * s, 7 * s, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // ---- 5. Center dot ----
  ctx.beginPath();
  ctx.arc(0, 0, 4 * s, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.globalAlpha = 0.4;
  ctx.fill();
  ctx.globalAlpha = 1.0;

  // Reset shadow
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';

  ctx.restore();
}

// ============================================================
// Canvas 初始化 & 主循环
// ============================================================
(function initMOMusicSplashCanvas() {
  splashCanvas = document.getElementById('splash-canvas');
  if (!splashCanvas) return;
  splashCtx = splashCanvas.getContext('2d');
  if (!splashCtx) return;

  function resize() {
    splashPixelRatio = Math.min(1.6, Math.max(1, window.devicePixelRatio || 1));
    splashW = window.innerWidth;
    splashH = window.innerHeight;
    splashCanvas.width = Math.max(1, Math.floor(splashW * splashPixelRatio));
    splashCanvas.height = Math.max(1, Math.floor(splashH * splashPixelRatio));
    if (splashCtx) splashCtx.setTransform(splashPixelRatio, 0, 0, splashPixelRatio, 0, 0);

    // Re-initialize floating particles
    splashParticles = [];
    var count = reduceSplashMotion ? 12 : 36;
    for (var i = 0; i < count; i++) {
      splashParticles.push({
        x: Math.random() * splashW,
        y: Math.random() * splashH,
        vx: (Math.random() - 0.5) * 0.12,
        vy: (Math.random() - 0.5) * 0.08,
        r: Math.random() * 1.2 + 0.3,
        a: Math.random() * 0.06 + 0.015,
        phase: Math.random() * Math.PI * 2,
        speed: 0.3 + Math.random() * 0.5
      });
    }
  }
  resize();
  window.addEventListener('resize', resize);
  drawMOMusicSplash();
})();

// ============================================================
// 主渲染循环 — Canvas 2D 动画
// ============================================================
function drawMOMusicSplash() {
  if (!splashAnimating || !splashCtx) return;
  requestAnimationFrame(drawMOMusicSplash);

  var elapsed = splashTimelineElapsed((performance.now() - splashStartedAt) / 1000);
  var ctx = splashCtx;
  var cx = splashW * 0.5;
  var cy = splashH * 0.5;
  var maxDim = Math.max(splashW, splashH);

  // 先用黑色填充避免闪烁，而不是 clearRect
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, splashW, splashH);

  // ---- 1. 深色渐变背景 ----
  var bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxDim * 0.75);
  var breathe = 0.03 * Math.sin(elapsed * 0.12);
  bgGrad.addColorStop(0, '#1a1025');
  bgGrad.addColorStop(0.4, '#110b1a');
  bgGrad.addColorStop(1, '#0a0a0f');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, splashW, splashH);

  // ---- 2. AppIcon 核心视觉 — 圆形+M音符图案 (旋转+缩放+发光渐入) ----
  var iconAppearDelay = reduceSplashMotion ? 0 : 0;
  var iconAppearDuration = reduceSplashMotion ? 0.8 : 1.8;
  var iconT = splashClamp01((elapsed - iconAppearDelay) / Math.max(0.001, iconAppearDuration));
  var iconScale, iconRotation, iconGlow;

  if (reduceSplashMotion) {
    iconScale = 0.6 + 0.4 * splashEaseOutCubic(iconT);
    iconRotation = 0;
    iconGlow = splashEaseOutCubic(iconT) * 0.4;
  } else {
    iconScale = 0.3 + 0.7 * splashEaseOutCubic(iconT);
    iconRotation = (-15 + 15 * splashEaseOutCubic(iconT)) * Math.PI / 180;
    iconGlow = splashEaseOutCubic(iconT) * 0.6;
    if (iconT >= 1) {
      var bp = elapsed - iconAppearDelay - iconAppearDuration;
      iconRotation += 0.3 * Math.sin(bp * 0.15) * Math.PI / 180;
      iconGlow = 0.4 + 0.15 * Math.sin(bp * 0.2);
    }
  }

  // Ambient glow behind the icon
  if (iconGlow > 0.001) {
    var ambientR = Math.min(splashW, splashH) * 0.30;
    var ambientGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, ambientR);
    ambientGrad.addColorStop(0, 'rgba(80, 140, 240, ' + (iconGlow * 0.08).toFixed(4) + ')');
    ambientGrad.addColorStop(0.5, 'rgba(168, 85, 247, ' + (iconGlow * 0.04).toFixed(4) + ')');
    ambientGrad.addColorStop(1, 'rgba(80, 140, 240, 0)');
    ctx.fillStyle = ambientGrad;
    ctx.fillRect(0, 0, splashW, splashH);
  }

  // Draw AppIcon
  var iconBaseSize = Math.min(splashW, splashH) * 0.28;
  var pxSize = iconBaseSize * iconScale;
  if (pxSize > 2) {
    if (splashAppIconLoaded && splashAppIconImage && splashAppIconImage.width > 0) {
      var imgW = splashAppIconImage.width;
      var imgH = splashAppIconImage.height;
      var imgScale = pxSize / Math.max(imgW, imgH);
      var dw = imgW * imgScale;
      var dh = imgH * imgScale;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(iconRotation);
      if (iconGlow > 0.005) {
        ctx.shadowColor = 'rgba(80, 140, 240, ' + Math.min(0.9, (iconGlow * 1.3)).toFixed(3) + ')';
        ctx.shadowBlur = 60 * (pxSize / 96);
      }
      ctx.globalAlpha = 0.88 + iconGlow * 0.12;
      ctx.drawImage(splashAppIconImage, -dw / 2, -dh / 2, dw, dh);
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
      ctx.globalAlpha = 1;
      ctx.restore();
    } else {
      drawSplashAppIcon(ctx, cx, cy, pxSize, iconRotation, iconGlow, elapsed);
    }
  }

  // ---- 3. 脉冲波纹（从中心扩散的圆环） ----
  if (!reduceSplashMotion && elapsed > 1.0) {
    var pulseInterval = 1.8;
    var ringTime = elapsed - 1.0;
    var ringIndex = Math.floor(ringTime / pulseInterval);
    var ringPhase = ringTime - ringIndex * pulseInterval;

    if (ringPhase < 0.06) {
      splashPulseRings.push({
        x: cx,
        y: cy,
        born: elapsed
      });
    }

    // 限制最多 3 个波纹
    while (splashPulseRings.length > 3) {
      splashPulseRings.shift();
    }
  }

  for (var pi = 0; pi < splashPulseRings.length; pi++) {
    var ring = splashPulseRings[pi];
    var age = elapsed - ring.born;
    var maxR = Math.min(splashW, splashH) * 0.48;
    var r = maxR * splashSmoothstep(0, 1, age / 3.0);
    var alpha = Math.max(0, 1 - age / 3.2);
    var width = Math.max(0.3, 2.5 - age * 0.6);

    if (alpha <= 0.01) continue;

    // 蓝紫色主环
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(80, 140, 240, ' + (alpha * 0.25).toFixed(3) + ')';
    ctx.lineWidth = width;
    ctx.stroke();

    // 紫色内环
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, r * 0.72, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(168, 85, 247, ' + (alpha * 0.15).toFixed(3) + ')';
    ctx.lineWidth = width * 0.6;
    ctx.stroke();
  }

  // ---- 4. 浮动粒子 ----
  for (var j = 0; j < splashParticles.length; j++) {
    var p = splashParticles[j];
    p.x += p.vx;
    p.y += p.vy;
    p.phase += 0.012 * p.speed;

    if (p.x < -10) p.x = splashW + 10;
    if (p.x > splashW + 10) p.x = -10;
    if (p.y < -10) p.y = splashH + 10;
    if (p.y > splashH + 10) p.y = -10;

    var alpha = p.a * (0.5 + Math.sin(p.phase + elapsed * 0.5) * 0.4);
    if (alpha <= 0) continue;

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, ' + Math.max(0, alpha).toFixed(3) + ')';
    ctx.fill();
  }

  // ---- 5. 整体淡入（开场前 1.2s） ----
  var overallFade = splashEaseOutCubic(Math.min(1, elapsed / 1.2));
  ctx.fillStyle = 'rgba(0, 0, 0, ' + ((1 - overallFade) * 1.0).toFixed(3) + ')';
  ctx.fillRect(0, 0, splashW, splashH);
}

// ============================================================
// 开场提示音（简化版）
// ============================================================
function playMOMusicIntroSound() {
  if (splashSoundPlayed) return;
  try {
    var AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return;
    var ctx = splashAudioCtx || new AudioContextCtor();
    splashAudioCtx = ctx;
    if (ctx.state === 'suspended' && ctx.resume) {
      ctx.resume().then(function () {
        if (!splashSoundPlayed) playMOMusicIntroSound();
      }).catch(function () { });
      if (ctx.state === 'suspended') return;
    }
    splashSoundPlayed = true;

    var now = ctx.currentTime + 0.02;

    // 简单干净的单音 — A4 柔音
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.linearRampToValueAtTime(523.25, now + 0.3);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.025, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.85);
  } catch (e) { }
}

function armSplashSoundFallback() {
  if (splashSoundFallbackArmed) return;
  splashSoundFallbackArmed = true;
  function unlock() {
    if (!splashSoundPlayed) playMOMusicIntroSound();
    document.removeEventListener('pointerdown', unlock, true);
    document.removeEventListener('keydown', unlock, true);
  }
  document.addEventListener('pointerdown', unlock, true);
  document.addEventListener('keydown', unlock, true);
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

function dismissSplash(opts) {
  opts = opts || {};
  var s = document.getElementById('splash');
  if (!s || s.classList.contains('hide') || s.classList.contains('exiting')) return;
  var instant = !!opts.instant;
  markAppPerf(instant ? 'splash-skip' : 'splash-dismiss');
  if (splashTimer) { clearTimeout(splashTimer); splashTimer = null; }
  splashReadyToEnter = false;
  s.classList.remove('ready');
  setTimeout(stopSplashIntroSound, instant ? 0 : 240);
  if (instant) {
    s.classList.add('hide');
    s.style.display = 'none';
    splashAnimating = false;
    document.body.classList.remove('splash-active');
    document.body.classList.remove('splash-revealing');
    revealIdleParticles(0, 520);
    finishSplashReveal(true, { fastSkip: true, reason: 'fast-skip' });
    return;
  }
  if (typeof shouldUseIdleWallpaperPreview === 'function'
    ? shouldUseIdleWallpaperPreview(true)
    : (typeof shouldShowEmptyHomeAfterSplash === 'function' && shouldShowEmptyHomeAfterSplash())) {
    activateHomeWallpaperPreview();
  }
  revealIdleParticles(0, reduceSplashMotion ? 520 : 920);
  document.body.classList.add('splash-revealing');
  s.classList.add('exiting');

  var content = s.querySelector('.splash-content');
  if (content) {
    content.style.transition = 'opacity 360ms cubic-bezier(.22,1,.36,1), transform 520ms cubic-bezier(.22,1,.36,1)';
    content.style.opacity = '0';
    content.style.transform = 'translateY(-10px) scale(.992)';
  }

  setTimeout(function () {
    s.classList.add('hide');
    splashAnimating = false;
    document.body.classList.remove('splash-active');
    document.body.classList.remove('splash-revealing');
    if (s && s.parentNode) s.style.display = 'none';
    finishSplashReveal(true, { reason: 'splash-dismiss' });
  }, 620);
}

function markSplashReadyToEnter() {
  var s = document.getElementById('splash');
  if (!s || s.classList.contains('hide') || s.classList.contains('exiting')) return;
  markAppPerf('splash-ready');
  splashReadyToEnter = true;
  splashTimer = null;
  s.classList.add('ready');
  s.setAttribute('role', 'button');
  s.setAttribute('tabindex', '0');
  s.setAttribute('aria-label', '点击进入 MOMusic');
}

// ============================================================
// DOMContentLoaded 事件绑定
// ============================================================
document.addEventListener('DOMContentLoaded', function () {
  var s = document.getElementById('splash');
  if (!s) return;
  markAppPerf('dom-content-loaded');
  if (startupFastSkipPreference) {
    dismissSplash({ instant: true });
    return;
  }
  armSplashSoundFallback();
  prewarmHomeWallpaperPreview();
  function requestSplashEnter() {
    playMOMusicIntroSound();
    if (splashReadyToEnter) dismissSplash();
  }
  s.addEventListener('click', requestSplashEnter);
  document.addEventListener('keydown', function (e) {
    if (!document.body.classList.contains('splash-active')) return;
    if (e.key === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      requestSplashEnter();
    }
  });
  if (reduceSplashMotion) {
    s.classList.add('reduce-motion');
    splashTimer = setTimeout(markSplashReadyToEnter, 650);
    return;
  }
  playMOMusicIntroSound();
  splashTimer = setTimeout(markSplashReadyToEnter, 1500);
});
