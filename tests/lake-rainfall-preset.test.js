'use strict';

// 湖面雨落（Lake-Rainfall）预设冒烟测试：
// 1) 静态接线：预设索引、元数据、图标、展示顺序、存档键、默认值、
//    加载器、主循环、预设切换、面板绑定、控制台工作区、index.html 折叠区
// 2) vm 运行时：THREE/document 桩下加载 lake-rainfall-preset.js，
//    走 ensureLayer → 多帧 update（合成音频）→ onPresetChange 离开/回来 →
//    颜色控件读写，全程无异常且可见性/清理行为正确。

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

function readWorkspaceFile(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

function testStaticWiring() {
  const stores = readWorkspaceFile('public/js/modules/00-state/00-core-stores.js');
  assert.ok(/var MAX_VISUAL_PRESET_INDEX = 13;/.test(stores), 'MAX_VISUAL_PRESET_INDEX must cover index 13');
  assert.ok(/var LAKE_RAINFALL_PRESET_INDEX = 13;/.test(stores), 'LAKE_RAINFALL_PRESET_INDEX must be 13');

  const archive = readWorkspaceFile('public/js/modules/07-fx/00-preset-archive-data.js');
  assert.ok(/name: '湖面雨落'/.test(archive), 'presetMeta must register 湖面雨落');
  assert.ok(/Lake-Rainfall/.test(archive), 'presetMeta must carry the English name');
  assert.ok(/presetDisplayOrder = \[[^\]]*\b13\b[^\]]*\];/.test(archive), 'presetDisplayOrder must include 13');
  assert.ok(/'lakeRainfallCover'/.test(archive), 'USER_FX_SHARE_KEYS must include lakeRainfallCover');
  assert.ok(/lakeRainfallWaterColor: normalizeHexColor/.test(archive), 'archive normalize must whitelist lake colors');
  assert.ok(/lakeRainfallCover: archiveNumber/.test(archive), 'archive normalize must whitelist lake sliders');
  // 图标数组与元数据等长：icon 行数应不少于 meta 条目数
  const iconCount = (archive.match(/var presetIcons = \[([\s\S]*?)\];/) || [])[1];
  assert.ok(iconCount && iconCount.split('\n<svg').length >= 1 && (iconCount.match(/<svg/g) || []).length >= 14,
    'presetIcons must have at least 14 icons');

  const defaults = readWorkspaceFile('public/js/modules/00-state/04-fx-defaults.js');
  ['lakeRainfallWaterColor', 'lakeRainfallRainColor', 'lakeRainfallGlowColor', 'lakeRainfallRain',
    'lakeRainfallWind', 'lakeRainfallRipple', 'lakeRainfallGlow', 'lakeRainfallCover']
    .forEach(function (key) {
      assert.ok(new RegExp(key + ':').test(defaults), 'fxDefaults must define ' + key);
    });

  const loader = readWorkspaceFile('public/js/index-loader.js');
  assert.ok(/'lake-rainfall-preset\.js'/.test(loader), 'index-loader must load lake-rainfall-preset.js');
  const loaderOrder = loader.indexOf("'heart-pulse-preset.js'");
  const lakeOrder = loader.indexOf("'lake-rainfall-preset.js'");
  assert.ok(lakeOrder > loaderOrder, 'lake preset must load after heart-pulse preset');

  const mainLoop = readWorkspaceFile('public/js/modules/11-main-loop.js');
  assert.ok(/lakeRainfallPresetActive/.test(mainLoop), 'main loop must track lake preset activity');
  assert.ok(/MOMusicLakeRainfall\.update\(/.test(mainLoop), 'main loop must call MOMusicLakeRainfall.update');
  assert.ok(/'visual\.lake-rainfall'/.test(mainLoop), 'main loop must perf-mark lake preset');

  const grid = readWorkspaceFile('public/js/modules/07-fx/04-preset-grid-uniforms.js');
  assert.ok(/MOMusicLakeRainfall\.onPresetChange\(/.test(grid), 'setPreset must forward onPresetChange');
  assert.ok(/updateLakeRainfallControlVisibility/.test(grid), 'setPreset must refresh lake control visibility');

  const bindings = readWorkspaceFile('public/js/modules/07-fx/07-bindings-shelf-immersive.js');
  assert.ok(/\['fx-lakerainrain', 'lakeRainfallRain'\]/.test(bindings), 'slider bindings must include lake rain');
  assert.ok(/\['lake-rain-water-picker', 'lakeRainfallWaterColor'\]/.test(bindings), 'picker bindings must include lake water color');

  const panel = readWorkspaceFile('public/js/modules/07-fx/05-fx-panel-performance.js');
  assert.ok(/setRange\('fx-lakerainrain'/.test(panel), 'updateFxInputs must sync lake sliders');

  const workspace = readWorkspaceFile('public/js/modules/07-fx/09-console-workspace.js');
  assert.ok(/key: 'lake-rainfall'/.test(workspace), 'fx console workspace must have a lake-rainfall group');

  const html = readWorkspaceFile('public/index.html');
  ['fx-lake-rain-fold', 'fx-lake-rain-section', 'lake-rain-color-section', 'lake-rain-water-row',
    'lake-rain-rain-row', 'lake-rain-glow-row', 'lake-rain-water-picker', 'lake-rain-rain-picker',
    'lake-rain-glow-picker', 'fx-lakerainrain', 'fx-lakerainwind', 'fx-lakerainripple',
    'fx-lakerainflowglow', 'fx-lakeraincover'].forEach(function (id) {
      assert.ok(html.indexOf('id="' + id + '"') !== -1, 'index.html must contain #' + id);
    });
}

// --- THREE / document 桩 ---

function makeThreeStub() {
  function Color(input) {
    if (input && input.r != null) { this.r = input.r; this.g = input.g; this.b = input.b; return; }
    this.r = 0.4; this.g = 0.7; this.b = 0.9;
  }
  Color.prototype.copy = function (c) { this.r = c.r; this.g = c.g; this.b = c.b; return this; };
  Color.prototype.setRGB = function (r, g, b) { this.r = r; this.g = g; this.b = b; return this; };
  Color.prototype.lerp = function (c, a) { this.r += (c.r - this.r) * a; return this; };
  Color.prototype.getHexString = function () { return '40b3e6'; };

  function Vector4() { this.x = 0; this.y = 0; this.z = 0; this.w = 0; }
  Vector4.prototype.set = function (x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; };

  function Vector3() {}
  Vector3.prototype.set = function () { return this; };

  function GeometryStub() { this.attributes = {}; }
  GeometryStub.prototype.setAttribute = function (key, attr) { this.attributes[key] = attr; };

  function BufferAttribute(array, size) { this.array = array; this.itemSize = size; this.needsUpdate = false; }

  function Object3DStub() {
    this.children = [];
    this.position = new Vector3();
    this.scale = { set: function () {}, setScalar: function () {} };
    this.rotation = { set: function () {}, x: 0, y: 0, z: 0 };
    this.visible = true;
    this.frustumCulled = true;
  }
  Object3DStub.prototype.add = function (child) { this.children.push(child); };
  Object3DStub.prototype.remove = function (child) {
    var idx = this.children.indexOf(child);
    if (idx !== -1) this.children.splice(idx, 1);
  };
  Object3DStub.prototype.traverse = function (fn) {
    fn(this);
    this.children.forEach(function (child) { if (child.traverse) child.traverse(fn); });
  };

  function MaterialStub(params) {
    params = Object.assign({}, params || {});
    if (params.color != null && typeof params.color === 'number') params.color = new Color(params.color);
    Object.assign(this, params);
  }
  MaterialStub.prototype.dispose = function () {};

  function Texture() { this.image = null; this.needsUpdate = false; this.dispose = function () {}; }

  return {
    Color: Color,
    Vector4: Vector4,
    Vector3: Vector3,
    Texture: Texture,
    CanvasTexture: Texture,
    BufferGeometry: GeometryStub,
    BufferAttribute: BufferAttribute,
    Float32BufferAttribute: BufferAttribute,
    PlaneGeometry: function () {},
    Group: Object3DStub,
    Mesh: function (geometry, material) {
      Object3DStub.call(this);
      this.geometry = geometry;
      this.material = material;
    },
    LineSegments: function (geometry, material) {
      Object3DStub.call(this);
      this.geometry = geometry;
      this.material = material;
    },
    Points: function (geometry, material) {
      Object3DStub.call(this);
      this.geometry = geometry;
      this.material = material;
    },
    Sprite: function (material) {
      Object3DStub.call(this);
      this.material = material;
    },
    ShaderMaterial: function (params) {
      MaterialStub.call(this, params);
      this.uniforms = params && params.uniforms;
    },
    LineBasicMaterial: MaterialStub,
    PointsMaterial: MaterialStub,
    SpriteMaterial: MaterialStub,
    AdditiveBlending: 2,
    DoubleSide: 2
  };
}

function makeDocumentStub() {
  const ctx2d = {
    createRadialGradient: function () { return { addColorStop: function () {} }; },
    beginPath: function () {},
    arc: function () {},
    fill: function () {},
    moveTo: function () {},
    lineTo: function () {},
    closePath: function () {},
    save: function () {},
    restore: function () {},
    clip: function () {},
    globalCompositeOperation: 'source-over',
    fillRect: function () {},
    clearRect: function () {},
    fillText: function () {}
  };
  const elements = {};
  return {
    elements: elements,
    createElement: function (tag) {
      if (tag === 'canvas') return { width: 0, height: 0, getContext: function () { return ctx2d; } };
      return {};
    },
    getElementById: function (id) {
      if (!elements[id]) {
        elements[id] = { id: id, value: '', textContent: '', style: {} };
      }
      return elements[id];
    },
    addEventListener: function () {}
  };
}

function makeSandbox() {
  const three = makeThreeStub();
  const document = makeDocumentStub();
  const calls = { toasts: [], saves: [], hidden: [] };
  const scene = {
    children: [],
    add: function (child) { this.children.push(child); },
    remove: function (child) {
      var idx = this.children.indexOf(child);
      if (idx !== -1) this.children.splice(idx, 1);
    }
  };
  const sandbox = {
    THREE: three,
    document: document,
    console: console,
    Math: Math,
    performance: { now: function () { return Date.now(); } },
    fx: { preset: 0 },
    // 00-core-stores 未加载，显式提供预设索引常量（预设可见性判断依赖它）
    LAKE_RAINFALL_PRESET_INDEX: 13,
    fxDefaults: {
      lakeRainfallWaterColor: '#0b2437',
      lakeRainfallRainColor: '#9fd0e8',
      lakeRainfallGlowColor: '#a8e8ff',
      lakeRainfallRain: 1.0,
      lakeRainfallWind: 0.8,
      lakeRainfallRipple: 1.15,
      lakeRainfallGlow: 1.05,
      lakeRainfallCover: 0.55
    },
    saveLyricLayout: function (info) { calls.saves.push(info); },
    showToast: function (text) { calls.toasts.push(text); },
    setFxPanelControlsHidden: function (ids, hidden) { calls.hidden.push({ ids: ids, hidden: hidden }); },
    __calls: calls,
    __scene: scene
  };
  sandbox.window = sandbox;
  return sandbox;
}

function loadPreset(sandbox) {
  const source = readWorkspaceFile('public/lake-rainfall-preset.js');
  vm.runInNewContext(source, sandbox, { filename: 'lake-rainfall-preset.js' });
}

function testRuntimeSmoke() {
  const sandbox = makeSandbox();
  loadPreset(sandbox);
  const preset = sandbox.MOMusicLakeRainfall;
  assert.ok(preset, 'preset must export MOMusicLakeRainfall');
  assert.strictEqual(preset.INDEX, 13, 'preset INDEX must be 13');
  assert.strictEqual(preset.isActive({ preset: 13 }), true, 'isActive must match preset 13');
  assert.strictEqual(preset.isActive({ preset: 12 }), false, 'isActive must reject other presets');

  // 进入预设：初始化并渐入
  sandbox.fx.preset = 13;
  preset.onPresetChange(12, 13, { scene: sandbox.__scene });
  assert.ok(sandbox.__scene.children.length === 1, 'ensureLayer must add one root group');
  const root = sandbox.__scene.children[0];
  let audioClock = { t: 0 };
  function audioFrame() {
    audioClock.t += 1 / 60;
    const phase = (audioClock.t % 0.5);
    return {
      bass: phase < 0.08 ? 0.9 : 0.15,
      mid: 0.4,
      treble: 0.5,
      beat: phase < 0.08 ? 1.0 : 0.1,
      energy: 0.6
    };
  }
  for (let i = 0; i < 150; i++) {
    preset.update(1 / 60, {
      scene: sandbox.__scene,
      fx: sandbox.fx,
      visualRotation: { x: 0.05, y: 0.1 },
      audio: audioFrame()
    });
  }
  assert.strictEqual(root.visible, true, 'root must be visible after warmup at active preset');
  assert.ok(preset.isActive(sandbox.fx), 'isActive must accept sandbox fx');

  // 离开预设：清理根节点；后续 update 走淡出路径，无异常
  preset.onPresetChange(13, 12, { scene: sandbox.__scene });
  assert.ok(sandbox.__scene.children.length === 0, 'leaving preset must clear the root group');
  sandbox.fx.preset = 12;
  preset.update(1 / 60, { scene: sandbox.__scene, fx: sandbox.fx, audio: audioFrame() });

  // 再次进入：重建无异常
  sandbox.fx.preset = 13;
  preset.onPresetChange(12, 13, { scene: sandbox.__scene });
  preset.update(1 / 60, { scene: sandbox.__scene, fx: sandbox.fx, audio: audioFrame() });
  assert.ok(sandbox.__scene.children.length === 1, 're-entering preset must rebuild the root group');

  // 颜色控件：设置/重置落盘并弹 toast
  sandbox.document.getElementById('lake-rain-water-picker');
  preset.setLakeRainfallColor && typeof preset.setLakeRainfallColor;
  if (typeof sandbox.setLakeRainfallColor !== 'function') throw new Error('setLakeRainfallColor must be global');
  sandbox.setLakeRainfallColor('lakeRainfallWaterColor', '#123456');
  assert.strictEqual(sandbox.fx.lakeRainfallWaterColor, '#123456', 'setLakeRainfallColor must write fx');
  assert.ok(sandbox.__calls.saves.length > 0, 'setLakeRainfallColor must persist via saveLyricLayout');
  assert.ok(sandbox.__calls.toasts.length > 0, 'setLakeRainfallColor must toast');
  sandbox.resetLakeRainfallColor('lakeRainfallWaterColor');
  assert.strictEqual(sandbox.fx.lakeRainfallWaterColor, '#0b2437', 'resetLakeRainfallColor must restore default');

  // 控件显隐：激活时显示、失活时隐藏
  sandbox.fx.preset = 13;
  sandbox.updateLakeRainfallControlVisibility();
  assert.strictEqual(sandbox.__calls.hidden[sandbox.__calls.hidden.length - 1].hidden, false, 'controls visible on active preset');
  sandbox.fx.preset = 5;
  sandbox.updateLakeRainfallControlVisibility();
  assert.strictEqual(sandbox.__calls.hidden[sandbox.__calls.hidden.length - 1].hidden, true, 'controls hidden on inactive preset');
}

function testArchiveRoundTrip() {
  // 存档归一化函数应能读取并钳制湖面雨落键（不加载整个前端，仅做函数级验证）
  const archive = readWorkspaceFile('public/js/modules/07-fx/00-preset-archive-data.js');
  const defaults = [
    ['lakeRainfallRain', 1.0, 0, 2], ['lakeRainfallWind', 0.8, 0, 2],
    ['lakeRainfallRipple', 1.15, 0, 2], ['lakeRainfallGlow', 1.05, 0.25, 2],
    ['lakeRainfallCover', 0.55, 0, 1]
  ];
  defaults.forEach(function (entry) {
    const re = new RegExp(entry[0] + ': archiveNumber\\(raw, \'' + entry[0] + '\', fxDefaults\\.' + entry[0] + ', ' + entry[2] + ', ' + entry[3] + '\\)');
    assert.ok(re.test(archive), 'archive clamp range for ' + entry[0] + ' must be ' + entry[2] + '..' + entry[3]);
  });
}

function run() {
  const tests = [testStaticWiring, testRuntimeSmoke, testArchiveRoundTrip];
  let passed = 0;
  tests.forEach(function (test) {
    test();
    passed++;
    console.log('ok - ' + test.name);
  });
  console.log(passed + ' test group(s) passed');
}

run();
