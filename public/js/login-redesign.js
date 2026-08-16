// MoMusic 登录界面双面板重构适配层（只加不改，不触碰 08-account 模块）
(function () {
  'use strict';

  // 新设计统一在双面板内完成登录，禁用旧的独立登录卡片弹窗（保留函数以防其他调用）
  // MR 连线时代遗留：startSelectedLoginConnection 会检查"是否已拖到 MR 接入口"并拦截。
  // 以上两个函数由 index-loader 动态加载，需轮询等待就绪后覆盖。
  function patchLoginOverrides() {
    var changed = false;
    if (typeof window.openLoginCardModal === 'function') {
      window.openLoginCardModal = function () {
        var card = document.getElementById('login-card-modal');
        if (card) {
          card.setAttribute('aria-hidden', 'true');
          card.classList.remove('show');
        }
      };
      changed = true;
    }
    if (typeof window.startSelectedLoginConnection === 'function'
      && typeof window.connectLoginMode === 'function'
      && typeof window.loginWorkflowActiveMode === 'function') {
      window.startSelectedLoginConnection = function () {
        if (typeof setLoginAuthDrawerOpen === 'function') setLoginAuthDrawerOpen(true);
        connectLoginMode(loginWorkflowActiveMode());
      };
      changed = true;
    }
    if (!changed) setTimeout(patchLoginOverrides, 250);
  }
  patchLoginOverrides();

  // ============ 左侧品牌区 Canvas 粒子背景 ============
  // index.html 未包含 #login-brand-canvas 元素, 脚本自建并挂到品牌区,
  // 避免 getElementById 返回 null 导致整个粒子背景静默失效
  var modal = document.getElementById('login-modal');
  var canvas = document.getElementById('login-brand-canvas');
  if (!canvas && modal) {
    canvas = document.createElement('canvas');
    canvas.id = 'login-brand-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;';
    // 挂到登录面板头部品牌区（首个子元素, 位于内容之下）
    var host = modal.querySelector('.ml-head') || modal;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.insertBefore(canvas, host.firstChild);
  }
  if (canvas && window.matchMedia && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var ctx = canvas.getContext('2d');
    var W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var bars = 64, particles = 36, running = false, rafId = 0;
    var barHeights = [], pList = [];
    var lowSpec = (navigator.hardwareConcurrency || 8) <= 4;

    function resize() {
      var rect = canvas.getBoundingClientRect();
      W = Math.max(1, rect.width);
      H = Math.max(1, rect.height);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var n = lowSpec ? Math.min(bars, 40) : bars;
      barHeights = new Array(n);
      for (var i = 0; i < n; i++) barHeights[i] = 0;
    }

    function initParticles() {
      var n = lowSpec ? 22 : particles;
      pList = [];
      for (var i = 0; i < n; i++) {
        pList.push({
          x: Math.random() * W,
          y: Math.random() * H,
          vx: (Math.random() - 0.5) * 0.35,
          vy: (Math.random() - 0.5) * 0.35,
          r: Math.random() * 1.6 + 0.6
        });
      }
    }

    function frame() {
      if (!running) return;
      rafId = requestAnimationFrame(frame);
      ctx.clearRect(0, 0, W, H);

      // 频谱柱（缓动律动）
      var n = barHeights.length;
      var bw = W / n;
      for (var i = 0; i < n; i++) {
        var target = Math.random() * H * 0.32 + H * 0.05;
        barHeights[i] += (target - barHeights[i]) * 0.04;
        var bh = barHeights[i];
        var grad = ctx.createLinearGradient(0, H - bh, 0, H);
        grad.addColorStop(0, 'rgba(56,189,248,0.75)');
        grad.addColorStop(1, 'rgba(6,182,212,0.06)');
        ctx.fillStyle = grad;
        ctx.fillRect(i * bw + bw * 0.18, H - bh, bw * 0.64, bh);
      }

      // 粒子网络
      ctx.fillStyle = 'rgba(125,211,252,0.75)';
      for (var j = 0; j < pList.length; j++) {
        var p = pList[j];
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -10) p.x = W + 10;
        if (p.x > W + 10) p.x = -10;
        if (p.y < -10) p.y = H + 10;
        if (p.y > H + 10) p.y = -10;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      for (var a = 0; a < pList.length; a++) {
        for (var b = a + 1; b < pList.length; b++) {
          var dx = pList[a].x - pList[b].x;
          var dy = pList[a].y - pList[b].y;
          var d2 = dx * dx + dy * dy;
          if (d2 < 110 * 110) {
            var alpha = (1 - Math.sqrt(d2) / 110) * 0.18;
            ctx.strokeStyle = 'rgba(125,211,252,' + alpha.toFixed(3) + ')';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(pList[a].x, pList[a].y);
            ctx.lineTo(pList[b].x, pList[b].y);
            ctx.stroke();
          }
        }
      }
    }

    function start() {
      if (running) return;
      running = true;
      resize();
      initParticles();
      rafId = requestAnimationFrame(frame);
    }
    function stop() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    }

    // 登录模态框打开时启动，关闭时停止（性能）
    // #login-modal 没有 aria-hidden 属性, 打开/关闭由 show class 控制,
    // 故以 classList.contains('show') 判断 (原判断 aria-hidden 恒为 null 永不触发)
    var modalObserver = new MutationObserver(function () {
      if (modal && modal.classList.contains('show')) start();
      else stop();
    });
    if (modal) {
      modalObserver.observe(modal, { attributes: true, attributeFilter: ['aria-hidden', 'class'] });
    }
    if (modal && modal.classList.contains('show')) start();
    window.addEventListener('resize', function () {
      if (running) { resize(); initParticles(); }
    });
  }
})();
