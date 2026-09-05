'use strict';

// 03-splash.js（启动动画已移除）冒烟测试：
// 验证加载后不再出现任何启动画面状态（splash-active 不添加、
// 残留 #splash DOM 被清除），DOMContentLoaded 后按原"秒启动"
// instant 路径立即揭示主页，且对外全局（reduceSplashMotion、
// finishSplashReveal）保持可用。

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'public/js/modules/10-shell/03-splash.js'), 'utf8');

function makeEnvironment(options) {
  const opts = options || {};
  const perfMarks = [];
  const calls = {
    revealIdleParticles: [],
    updateEmptyHomeVisibility: [],
    shouldForceEmptyHomeAfterSplash: 0,
    markStartupHomeReadyForAutoplay: [],
    maybeRunStartupVisualGuide: [],
    maybeRunStartupLoginGuide: [],
  };
  let rafQueue = [];

  const splashElement = {
    parentNode: { removeChild() { } },
    removed: false,
  };
  splashElement.parentNode.removeChild = function (el) { splashElement.removed = true; };

  const bodyClassSet = new Set();
  const htmlClassSet = new Set();

  const documentStub = {
    body: {
      classList: {
        add: c => bodyClassSet.add(c),
        remove: c => bodyClassSet.delete(c),
        contains: c => bodyClassSet.has(c),
      },
    },
    documentElement: {
      classList: {
        add: c => htmlClassSet.add(c),
        remove: c => htmlClassSet.delete(c),
        contains: c => htmlClassSet.has(c),
      },
    },
    getElementById(id) {
      if (id === 'splash' && opts.withLeftoverSplash) return splashElement;
      return null;
    },
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    listeners: {},
  };

  const sandbox = {
    document: documentStub,
    window: {
      matchMedia() { return { matches: !!opts.reducedMotion }; },
    },
    performance: { now: () => Date.now() },
    requestAnimationFrame(fn) { rafQueue.push(fn); return rafQueue.length; },
    setTimeout(fn) { return 0; },
    clearTimeout() { },
    console,
    // 以下为拼接包中其他文件提供的全局，本文件仅调用
    startupFastSkipPreference: false,
    markAppPerf: mark => perfMarks.push(mark),
    revealIdleParticles: (...args) => calls.revealIdleParticles.push(args),
    updateEmptyHomeVisibility: (...args) => { calls.updateEmptyHomeVisibility.push(args); return true; },
    shouldForceEmptyHomeAfterSplash: () => { calls.shouldForceEmptyHomeAfterSplash += 1; return false; },
    markStartupHomeReadyForAutoplay: (...args) => calls.markStartupHomeReadyForAutoplay.push(args),
    maybeRunStartupVisualGuide: (...args) => { calls.maybeRunStartupVisualGuide.push(args); return false; },
    maybeRunStartupLoginGuide: (...args) => { calls.maybeRunStartupLoginGuide.push(args); },
    hasAnyPlatformLogin: () => false,
    maybeShowUploadTipOnce: () => { },
  };
  sandbox.globalThis = sandbox;

  const context = vm.createContext(sandbox);
  vm.runInContext(source, context, { filename: '03-splash.js' });

  return {
    context,
    perfMarks,
    calls,
    rafQueue,
    bodyClassSet,
    htmlClassSet,
    splashElement,
    dispatchDOMContentLoaded() {
      (documentStub.listeners['DOMContentLoaded'] || []).forEach(fn => fn());
    },
    tickFrames(count) {
      for (let i = 0; i < count; i += 1) {
        const queue = rafQueue;
        rafQueue = [];
        queue.forEach(fn => fn());
      }
    },
  };
}

// 1. 加载即安全：不添加 splash-active，注册 DOMContentLoaded，不启动渲染循环
let env = makeEnvironment({ withLeftoverSplash: true });
assert.strictEqual(env.bodyClassSet.has('splash-active'), false, '不得再添加 splash-active');
assert.strictEqual(env.rafQueue.length, 0, '加载阶段不得注册 rAF 渲染循环');
assert.strictEqual(env.splashElement.removed, true, '残留的 #splash DOM 应被清除');

// 2. 对外契约保持
assert.strictEqual(typeof env.context.finishSplashReveal, 'function', 'finishSplashReveal 必须存在');
assert.strictEqual(typeof env.context.releaseStartupFastSkipPreload, 'function', 'releaseStartupFastSkipPreload 必须存在');
assert.strictEqual(env.context.reduceSplashMotion, false, 'reduceSplashMotion 全局必须保持可被 05-startup-login-guide 读取');

// 3. DOMContentLoaded 后立即走揭示路径（等价原 instant-dismiss）
env.dispatchDOMContentLoaded();
env.tickFrames(4);
assert.ok(env.perfMarks.includes('dom-content-loaded'), '应记录 dom-content-loaded');
assert.ok(env.perfMarks.includes('splash-skip'), '应记录 splash-skip');
assert.ok(env.perfMarks.includes('home-revealed'), '应记录 home-revealed');
assert.deepStrictEqual(env.calls.revealIdleParticles, [[0, 520]], '应立即释放待机粒子');
assert.strictEqual(env.calls.updateEmptyHomeVisibility.length, 1, '应刷新一次空场 Home 可见性');
assert.strictEqual(env.calls.updateEmptyHomeVisibility[0][0].forceLoad, true, '应强制刷新空场 Home 可见性');
assert.deepStrictEqual(env.calls.markStartupHomeReadyForAutoplay, [['splash-removed', 240]], '应标记自动播放就绪（fastSkip 240ms）');
assert.deepStrictEqual(env.calls.maybeRunStartupVisualGuide, [['splash']], '应触发启动视觉引导判定');
assert.deepStrictEqual(env.calls.maybeRunStartupLoginGuide, [['splash']], '未登录时应触发登录引导');

// 4. reduced-motion 用户：全局标志照常生效
env = makeEnvironment({ reducedMotion: true });
assert.strictEqual(env.context.reduceSplashMotion, true, 'prefers-reduced-motion 应映射到 reduceSplashMotion');
env.dispatchDOMContentLoaded();
env.tickFrames(2);
assert.ok(env.perfMarks.includes('home-revealed'), 'reduced-motion 下同样直进主页');

console.log('tests/startup-reveal.test.js: all assertions passed');
