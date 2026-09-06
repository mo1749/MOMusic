/**
 * Lake Rainfall visual preset for MOMusic (湖面雨落).
 *
 * A nocturnal lake suggested purely by waves — no solid water plane. A dense
 * particle field runs a real 2D wave-equation simulation: rain impacts inject
 * impulses that propagate and interfere across the grid, while several
 * criss-crossing drifting wave trains keep the surface dense and restless.
 * Crests glow brightest (moonlight on wave tips); the album cover is laid
 * across the whole lake as a shimmering reflection. Bass transient drops are
 * heavy — they throw splash particles and brighten the moon path; treble
 * drives drizzle density; detected beats launch staggered wave trains across the lake.
 */
(function (global) {
  'use strict';

  var INDEX = 13;
  var WATER_Y = -2.55;             // 波场基准高度
  var GRID_W = 272;                // 波场横向格数（决定封面倒影的采样密度）
  var GRID_D = 152;                // 波场纵向格数
  var GRID_MIN_X = -8.6;           // 波场世界范围
  var GRID_MAX_X = 8.6;
  var GRID_MIN_Z = -7.2;
  var GRID_MAX_Z = 2.6;
  var SPACING_X = (GRID_MAX_X - GRID_MIN_X) / (GRID_W - 1);
  var SPACING_Z = (GRID_MAX_Z - GRID_MIN_Z) / (GRID_D - 1);
  var WAVE_STEPS_PER_SECOND = 63;  // 波动方程步频：细网格下单格世界距离更短，提速补偿扩散速度
  var WAVE_MAX_STEPS_PER_FRAME = 3; // 单帧最多推进步数：长帧后直接丢弃剩余步，避免追帧突进
  var WAVE_DAMP = 0.9915;          // 波能衰减（细网格每格世界距离短，稍弱阻尼保波纹寿命）
  var WAVE_RENDER_SCALE = 0.125;   // 模拟高度 → 世界坐标换算
  var HEAVY_DROP_MAX = 18;         // 低音重雨滴精灵池
  var SPLASH_MAX = 150;            // 溅花粒子池
  var RAIN_MAX = 760;              // 雨丝线段池上限
  var RAIN_AREA_X = 8.4;           // 雨区半宽
  var RAIN_TOP_Y = 3.6;            // 雨丝出生高度
  var MOON_POS = { x: 3.05, y: 2.35, z: -4.6 };
  var COVER_TEX_SIZE = 384;        // 封面采样降采样尺寸（网格加密后同步提高）
  var DEFAULT_WATER_COLOR = '#0b2437';
  var DEFAULT_RAIN_COLOR = '#9fd0e8';
  var DEFAULT_GLOW_COLOR = '#a8e8ff';
  var DEFAULT_RAIN = 1.0;
  var DEFAULT_WIND = 0.8;
  var DEFAULT_RIPPLE = 1.15;
  var DEFAULT_GLOW = 1.05;
  var DEFAULT_COVER = 0.9;

  var state = {
    root: null,
    scene: null,
    initialized: false,
    opacity: 0,
    time: 0,
    smoothBass: 0,
    smoothMid: 0,
    smoothTreble: 0,
    smoothEnergy: 0,
    smoothBeat: 0,
    prevBeat: null,
    prevBass: null,
    lastMainBeatAt: -10,
    lastHeavyAt: -10,
    beatGlow: 0,
    boundRotX: 0,
    boundRotY: 0,
    // 粒子波场
    waterPoints: null,
    waterGeometry: null,
    waveCur: null,
    wavePrev: null,
    baseX: null,
    baseZ: null,
    pendingImpulses: [],
    waveStepAccum: 0,
    // 封面反射采样
    coverCanvas: null,
    coverImageData: null,
    lastCoverImage: null,
    hasCover: false,
    // 逐帧预计算的行/列内层正弦表
    rowInnerA: null,
    rowInnerB: null,
    rowInnerS: null,
    colInnerC: null,
    rowFadeZ: null,
    rowMoonZ: null,
    rowT: null,
    colMoonCore: null,
    colMoonWide: null,
    // 雨系统
    rainLines: null,
    rainGeometry: null,
    rainDrops: [],
    rainActive: 0,
    // 重雨滴与溅花
    heavyDrops: [],
    heavySpriteData: [],
    splashes: null,
    splashGeometry: null,
    splashData: [],
    // 月亮
    moonHalo: null,
    moonCore: null,
    moonSongKey: null,
    moonFormScale: 1.4,
    lastSongCheck: 0,
    glowTexture: null,
    colorFlashWater: 0,
    colorFlashRain: 0,
    colorFlashGlow: 0
  };

  var COLOR_CONTROLS = [
    { key: 'lakeRainfallWaterColor', picker: 'lake-rain-water-picker', value: 'lake-rain-water-value', label: '湖水颜色' },
    { key: 'lakeRainfallRainColor', picker: 'lake-rain-rain-picker', value: 'lake-rain-rain-value', label: '雨丝颜色' },
    { key: 'lakeRainfallGlowColor', picker: 'lake-rain-glow-picker', value: 'lake-rain-glow-value', label: '月光辉光' }
  ];

  function clamp(value, min, max) {
    value = Number(value);
    if (!isFinite(value)) value = min;
    return Math.max(min, Math.min(max, value));
  }

  function smoothstep(a, b, v) {
    var t = clamp((v - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function readNumber(fx, key, fallback, min, max) {
    return clamp(fx && fx[key] != null ? fx[key] : fallback, min, max);
  }

  function readHex(fx, key, fallback) {
    var value = fx && fx[key] != null ? String(fx[key]).trim() : fallback;
    return /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
  }

  function readParams(fx) {
    return {
      water: new THREE.Color(readHex(fx, 'lakeRainfallWaterColor', DEFAULT_WATER_COLOR)),
      rain: new THREE.Color(readHex(fx, 'lakeRainfallRainColor', DEFAULT_RAIN_COLOR)),
      glow: new THREE.Color(readHex(fx, 'lakeRainfallGlowColor', DEFAULT_GLOW_COLOR)),
      rainAmount: readNumber(fx, 'lakeRainfallRain', DEFAULT_RAIN, 0, 2),
      wind: readNumber(fx, 'lakeRainfallWind', DEFAULT_WIND, 0, 2),
      ripple: readNumber(fx, 'lakeRainfallRipple', DEFAULT_RIPPLE, 0, 2),
      glowStrength: readNumber(fx, 'lakeRainfallGlow', DEFAULT_GLOW, 0.25, 2),
      coverStrength: readNumber(fx, 'lakeRainfallCover', DEFAULT_COVER, 0, 1)
    };
  }

  function makeGlowTexture(size) {
    var canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext('2d');
    var half = size / 2;
    var gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.2, 'rgba(255,255,255,.85)');
    gradient.addColorStop(0.55, 'rgba(255,255,255,.22)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    var texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  // --- 月面纹理：按月相绘制明暗界线（半圆+半椭圆）、月海斑块、环形山与边缘暗化，
  //     相位 0=新月 0.25=上弦 0.5=满月 0.75=下弦；歌曲哈希决定月相/色调/大小 ---
  function makeMoonTexture(phase, tintHex) {
    var size = 256;
    var canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext('2d');
    var cx = size / 2;
    var cy = size / 2;
    var R = size * 0.28;
    // 柔和光晕底层（主体光晕由 halo 精灵提供）
    var halo = ctx.createRadialGradient(cx, cy, R * 0.7, cx, cy, R * 2.1);
    halo.addColorStop(0, 'rgba(255,255,255,.32)');
    halo.addColorStop(0.45, 'rgba(255,255,255,.09)');
    halo.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, size, size);
    // 阴影面：隐约可辨的暗面轮廓
    ctx.fillStyle = 'rgba(34,42,58,.5)';
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
    // 受光面：外缘半圆 + 明暗界线椭圆（k>0 娥眉界线鼓向受光侧，k<0 盈凸鼓进阴影侧）
    var k = Math.cos(phase * Math.PI * 2);
    var litRight = phase <= 0.5;
    var rx = Math.max(0.03, Math.abs(k)) * R;
    ctx.beginPath();
    if (litRight) ctx.arc(cx, cy, R, -Math.PI / 2, Math.PI / 2, false);
    else ctx.arc(cx, cy, R, Math.PI / 2, Math.PI * 1.5, false);
    var aStart = litRight ? Math.PI / 2 : Math.PI * 1.5;
    var aDelta = k > 0 ? -Math.PI : Math.PI;
    var steps = 44;
    for (var s2 = 0; s2 <= steps; s2++) {
      var a = aStart + aDelta * (s2 / steps);
      var ex = cx + Math.cos(a) * rx;
      var ey = cy + Math.sin(a) * R;
      if (s2 === 0) ctx.moveTo(ex, ey);
      else ctx.lineTo(ex, ey);
    }
    ctx.closePath();
    var lit = ctx.createRadialGradient(
      cx + (litRight ? R * 0.22 : -R * 0.22), cy - R * 0.18, R * 0.08,
      cx, cy, R
    );
    lit.addColorStop(0, '#fffdf4');
    lit.addColorStop(0.7, '#f1ebd9');
    lit.addColorStop(1, '#d9d3c1');
    ctx.fillStyle = lit;
    ctx.fill();
    // 月海斑块与环形山：低对比细节，裁剪在受光面内
    ctx.save();
    ctx.clip();
    var maria = [[-0.3, -0.22, 0.36], [0.24, 0.06, 0.28], [-0.04, 0.34, 0.2], [0.4, -0.34, 0.16], [-0.46, 0.2, 0.15]];
    for (var m2 = 0; m2 < maria.length; m2++) {
      var blotch = maria[m2];
      var bx = cx + blotch[0] * R;
      var by = cy + blotch[1] * R;
      var br = blotch[2] * R;
      var g2 = ctx.createRadialGradient(bx, by, 0, bx, by, br);
      g2.addColorStop(0, 'rgba(104,116,138,.16)');
      g2.addColorStop(1, 'rgba(104,116,138,0)');
      ctx.fillStyle = g2;
      ctx.fillRect(bx - br, by - br, br * 2, br * 2);
    }
    var craters = [[0.16, -0.36, 0.062], [0.42, 0.2, 0.05], [-0.2, 0.08, 0.048], [-0.34, -0.42, 0.04], [0.05, 0.45, 0.036]];
    for (var c2 = 0; c2 < craters.length; c2++) {
      var crater = craters[c2];
      ctx.fillStyle = 'rgba(58,66,86,.15)';
      ctx.beginPath();
      ctx.arc(cx + crater[0] * R, cy + crater[1] * R, crater[2] * R, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // 歌曲色调：暖金 ↔ 冷蓝白 轻染月面与光晕
    var tintNum = parseInt(tintHex.slice(1), 16);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(' + ((tintNum >> 16) & 255) + ',' + ((tintNum >> 8) & 255) + ',' + (tintNum & 255) + ',.2)';
    ctx.fillRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'source-over';
    var texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  // --- 歌曲决定月亮形态：同一首歌恒定，换歌即换月相/色调/大小 ---
  function hashString(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function applyMoonForm(songKey) {
    var seed = hashString(songKey || 'lake-default-moon');
    var h1 = (seed & 1023) / 1023;
    var h2 = ((seed >>> 10) & 1023) / 1023;
    var h3 = ((seed >>> 20) & 1023) / 1023;
    var phase = 0.18 + h1 * 0.64; // 0.18 娥眉 → 0.82 近满，避开几乎不可见的新月段
    var warm = [255, 224, 178];   // 暖金月
    var cool = [214, 231, 255];   // 冷蓝白月
    var tr = Math.round(cool[0] + (warm[0] - cool[0]) * h2);
    var tg = Math.round(cool[1] + (warm[1] - cool[1]) * h2);
    var tb = Math.round(cool[2] + (warm[2] - cool[2]) * h2);
    var tintHex = '#' + ((1 << 24) + (tr << 16) + (tg << 8) + tb).toString(16).slice(1);
    var scale = 1.2 + h3 * 0.5;
    if (state.moonCore) {
      if (state.moonCore.material.map && state.moonCore.material.map.dispose) state.moonCore.material.map.dispose();
      state.moonCore.material.map = makeMoonTexture(phase, tintHex);
      state.moonCore.material.color.setRGB(1, 1, 1);
      state.moonCore.material.needsUpdate = true;
    }
    state.moonFormScale = scale;
    if (state.moonHalo) state.moonHalo.scale.set(scale * 2.6, scale * 2.6, 1);
  }

  // --- 粒子波场：不再渲染实体水面，湖面完全由波的明暗起伏显现 ---
  // 高度场用经典双缓冲波动方程：next = (四邻均值)*2 - prev（阻尼衰减），
  // 雨滴入水注入负向脉冲后自然扩散成干涉环；环境浪是叠加的渲染项，
  // 与模拟场互不干扰，二者亮度一起决定每个粒子的辉光。
  function buildWaveField(root) {
    var count = GRID_W * GRID_D;
    state.waveCur = new Float32Array(count);
    state.wavePrev = new Float32Array(count);
    state.baseX = new Float32Array(count);
    state.baseZ = new Float32Array(count);
    var positions = new Float32Array(count * 3);
    var colors = new Float32Array(count * 3);
    for (var z = 0; z < GRID_D; z++) {
      for (var x = 0; x < GRID_W; x++) {
        var i = z * GRID_W + x;
        // 随机抖动打破均匀网格感（极小抖动：清晰度优先）
        state.baseX[i] = GRID_MIN_X + x * SPACING_X + (Math.random() - 0.5) * SPACING_X * 0.15;
        state.baseZ[i] = GRID_MIN_Z + z * SPACING_Z + (Math.random() - 0.5) * SPACING_Z * 0.15;
        positions[i * 3] = state.baseX[i];
        positions[i * 3 + 1] = WATER_Y;
        positions[i * 3 + 2] = state.baseZ[i];
      }
    }
    var geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    var material = new THREE.PointsMaterial({
      map: state.glowTexture,
      vertexColors: true,
      size: 0.11,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    var points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    root.add(points);
    state.waterPoints = points;
    state.waterGeometry = geometry;
    state.rowInnerA = new Float32Array(GRID_D);
    state.rowInnerB = new Float32Array(GRID_D);
    state.rowInnerS = new Float32Array(GRID_D);
    state.rowFadeZ = new Float32Array(GRID_D);
    state.rowMoonZ = new Float32Array(GRID_D);
    state.rowT = new Float32Array(GRID_D);
    state.colInnerC = new Float32Array(GRID_W);
    // 月光光路双层衰减只依赖横坐标（常量），构建时算一次：窄亮芯 + 宽柔晕
    state.colMoonCore = new Float32Array(GRID_W);
    state.colMoonWide = new Float32Array(GRID_W);
    for (var mx = 0; mx < GRID_W; mx++) {
      var nx = GRID_MIN_X + mx * SPACING_X;
      var dx = nx - MOON_POS.x;
      state.colMoonCore[mx] = Math.exp(-(dx * dx) / 0.55);
      state.colMoonWide[mx] = Math.exp(-(dx * dx) / 2.6);
    }
  }

  // 雨滴入水：向波场注入负向脉冲（中心 + 四邻 + 对角），涟漪圆润地自然扩散
  function injectDrop(x, z, strength) {
    if (!state.waveCur) return;
    var gx = Math.round((x - GRID_MIN_X) / SPACING_X);
    var gz = Math.round((z - GRID_MIN_Z) / SPACING_Z);
    gx = clamp(gx, 1, GRID_W - 2);
    gz = clamp(gz, 1, GRID_D - 2);
    var i = gz * GRID_W + gx;
    state.waveCur[i] -= strength;
    state.waveCur[i - 1] -= strength * 0.38;
    state.waveCur[i + 1] -= strength * 0.38;
    state.waveCur[i - GRID_W] -= strength * 0.38;
    state.waveCur[i + GRID_W] -= strength * 0.38;
    state.waveCur[i - GRID_W - 1] -= strength * 0.16;
    state.waveCur[i - GRID_W + 1] -= strength * 0.16;
    state.waveCur[i + GRID_W - 1] -= strength * 0.16;
    state.waveCur[i + GRID_W + 1] -= strength * 0.16;
  }

  // 延迟注入队列：主拍波列用负延迟错峰，同一中心涌出三圈波
  function queueDrop(x, z, strength, delay) {
    state.pendingImpulses.push({ x: x, z: z, strength: strength, delay: delay || 0 });
    if (state.pendingImpulses.length > 48) state.pendingImpulses.shift();
  }

  function flushImpulses(dt) {
    for (var i = state.pendingImpulses.length - 1; i >= 0; i--) {
      var item = state.pendingImpulses[i];
      item.delay -= dt;
      if (item.delay <= 0) {
        injectDrop(item.x, item.z, item.strength);
        state.pendingImpulses.splice(i, 1);
      }
    }
  }

  function stepWaveField() {
    var cur = state.waveCur;
    var prev = state.wavePrev;
    var damp = WAVE_DAMP;
    for (var z = 0; z < GRID_D; z++) {
      var row = z * GRID_W;
      var rowUp = (z > 0 ? z - 1 : 0) * GRID_W;
      var rowDn = (z < GRID_D - 1 ? z + 1 : GRID_D - 1) * GRID_W;
      for (var x = 0; x < GRID_W; x++) {
        var xl = x > 0 ? x - 1 : 0;
        var xr = x < GRID_W - 1 ? x + 1 : GRID_W - 1;
        var i = row + x;
        prev[i] = ((cur[rowUp + x] + cur[rowDn + x] + cur[row + xl] + cur[row + xr]) * 0.5 - prev[i]) * damp;
      }
    }
    state.waveCur = prev;
    state.wavePrev = cur;
  }

  // 封面反射采样：封面纹理降采样到 64×64 ImageData，封面变更时才重建
  function refreshCoverData() {
    if (typeof coverTex === 'undefined' || !coverTex || !coverTex.image) {
      if (state.hasCover) { state.hasCover = false; state.coverImageData = null; state.lastCoverImage = null; }
      return;
    }
    var image = coverTex.image;
    if (image === state.lastCoverImage) return;
    var width = image.width || image.naturalWidth || 0;
    var height = image.height || image.naturalHeight || 0;
    if (!width || !height) return;
    if (!state.coverCanvas) {
      state.coverCanvas = document.createElement('canvas');
      state.coverCanvas.width = COVER_TEX_SIZE;
      state.coverCanvas.height = COVER_TEX_SIZE;
    }
    var ctx = state.coverCanvas.getContext('2d');
    ctx.clearRect(0, 0, COVER_TEX_SIZE, COVER_TEX_SIZE);
    ctx.drawImage(image, 0, 0, COVER_TEX_SIZE, COVER_TEX_SIZE);
    try {
      state.coverImageData = ctx.getImageData(0, 0, COVER_TEX_SIZE, COVER_TEX_SIZE);
      state.lastCoverImage = image;
      state.hasCover = true;
    } catch (error) {
      state.hasCover = false;
      state.coverImageData = null;
      state.lastCoverImage = null;
    }
  }

  // 波场渲染推进：模拟步进 + 环境浪 + 封面染色 + 月光光路，逐点写位置与颜色
  function updateWaveField(dt, params) {
    flushImpulses(dt);
    // 固定步频推进：涟漪扩散速度与帧率解耦，波纹更从容
    state.waveStepAccum += dt * WAVE_STEPS_PER_SECOND;
    var simSteps = 0;
    while (state.waveStepAccum >= 1 && simSteps < WAVE_MAX_STEPS_PER_FRAME) {
      stepWaveField();
      state.waveStepAccum -= 1;
      simSteps++;
    }
    if (state.waveStepAccum > WAVE_MAX_STEPS_PER_FRAME) state.waveStepAccum = 0;
    var cur = state.waveCur;
    var positions = state.waterGeometry.attributes.position.array;
    var colors = state.waterGeometry.attributes.color.array;
    var time = state.time;
    var energyAmp = 0.5 + state.smoothEnergy * 0.9 + state.smoothTreble * 0.3;
    var shimmerAmp = 0.012 * (0.4 + state.smoothTreble * 1.1);
    var waveScale = WAVE_RENDER_SCALE * (0.75 + params.ripple * 0.45);
    var coverData = state.hasCover ? state.coverImageData.data : null;
    var coverMix = clamp(params.coverStrength * 1.5, 0, 1);
    var moonBoost = 0.4 + state.beatGlow * 0.6;
    var opacity = state.opacity;

    // 逐帧预计算行/列常量：内层正弦、边缘淡出、月光纵深、封面 v 坐标（透视补偿）
    var rowInnerA = state.rowInnerA;
    var rowInnerB = state.rowInnerB;
    var rowInnerS = state.rowInnerS;
    var rowFadeZ = state.rowFadeZ;
    var rowMoonZ = state.rowMoonZ;
    var rowT = state.rowT;
    var colInnerC = state.colInnerC;
    var colMoonCore = state.colMoonCore;
    var colMoonWide = state.colMoonWide;
    for (var rz = 0; rz < GRID_D; rz++) {
      var zn = GRID_MIN_Z + rz * SPACING_Z;
      rowInnerA[rz] = Math.sin(zn * 0.5 - time * 0.8);
      rowInnerB[rz] = Math.sin(zn * 1.2 + time * 0.9);
      rowInnerS[rz] = Math.sin(zn * 5.1 - time * 6.7);
      rowFadeZ[rz] = smoothstep(GRID_MIN_Z + 0.3, GRID_MIN_Z + 2.6, zn) * (1 - smoothstep(1.2, 2.5, zn));
      rowMoonZ[rz] = 0.5 + 0.8 * smoothstep(GRID_MIN_Z, GRID_MAX_Z - 3.2, zn);
      // 透视补偿：远岸行在屏幕上被压缩，让封面远端占更多世界距离，纵向比例更自然
      var tLin = clamp((zn - (GRID_MIN_Z + 0.3)) / (1.2 - (GRID_MIN_Z + 0.3)), 0, 1);
      rowT[rz] = Math.pow(tLin, 1.35);
    }
    for (var rx = 0; rx < GRID_W; rx++) {
      colInnerC[rx] = Math.sin((GRID_MIN_X + rx * SPACING_X) * 1.1 - time * 1.2);
    }

    var i = 0;
    for (var gz = 0; gz < GRID_D; gz++) {
      var innerA = rowInnerA[gz];
      var innerB = rowInnerB[gz];
      var innerS = rowInnerS[gz];
      var fadeZ = rowFadeZ[gz];
      var moonZ = rowMoonZ[gz];
      var rowCoverT = rowT[gz];
      for (var gx = 0; gx < GRID_W; gx++, i++) {
        var x = state.baseX[i];
        var z = state.baseZ[i];
        // 环境浪：一组长涌 + 多组交叉碎浪 + 区域强弱调制 → 密集凌乱的水面
        var amb = Math.sin(x * 0.7 + time * 1.1 + innerA * 1.1) * 0.045
          + Math.sin(x * 1.6 - time * 1.7 + innerB * 1.3) * 0.038
          + Math.sin(z * 1.8 + time * 1.5 + colInnerC[gx] * 1.1) * 0.032
          + Math.sin((x + z) * 1.1 + time * 2.3) * 0.02;
        amb *= energyAmp * (0.65 + 0.5 * Math.sin(x * 0.33 + z * 0.21 + time * 0.45));
        var shimmer = Math.sin(x * 8.3 + time * 9.1 + innerS) * shimmerAmp;
        var simH = cur[i] * waveScale;
        var total = simH + amb + shimmer;
        positions[i * 3 + 1] = WATER_Y + total;

        // 辉光：只点亮真正的波峰，暗谷压黑——月光落在浪尖上
        var crest = clamp((Math.abs(total) - 0.015) * 10.5, 0, 1);
        var fadeX = 1 - smoothstep(6.6, 8.4, x < 0 ? -x : x);
        var moon = (colMoonCore[gx] * 0.55 + colMoonWide[gx] * 0.35) * moonBoost * (0.3 + crest * 0.7) * moonZ;
        var glow = (crest * 0.85 + moon * 1.6 + 0.24) * params.glowStrength * fadeX * fadeZ;

        // 湖面主色 = 封面色 × 封面亮度（明暗忠实于封面，暗封面=暗湖面），深水色按
        // coverMix 保留底色；封面区把辉光罩压低，让封面原色透出来（清晰度优先）
        var blend = coverMix * (0.8 + crest * 0.35);
        if (blend > 1) blend = 1;
        glow *= 1 - blend * 0.6;
        var coverLit = (0.72 + crest * 0.45) * blend;
        var keepWater = 0.5 * (1 - blend);
        var r = params.water.r * keepWater + params.glow.r * glow;
        var g = params.water.g * keepWater + params.glow.g * glow;
        var b = params.water.b * keepWater + params.glow.b * glow;
        if (coverData && coverMix > 0.01) {
          // 封面铺满全湖：横向铺满可见湖面、纵向按透视补偿映射可见水带
          // （远岸=封面顶部，真实反射方位），坐标随波微移产生荡漾
          var u = clamp(0.5 + (x - simH * 0.55) / 14.5, 0.01, 0.99);
          var px = ((rowCoverT * (COVER_TEX_SIZE - 1)) | 0) * COVER_TEX_SIZE + ((u * (COVER_TEX_SIZE - 1)) | 0);
          var pv = px * 4;
          r += (coverData[pv] / 255) * coverLit;
          g += (coverData[pv + 1] / 255) * coverLit;
          b += (coverData[pv + 2] / 255) * coverLit;
        }
        colors[i * 3] = r > 0 ? r : 0;
        colors[i * 3 + 1] = g > 0 ? g : 0;
        colors[i * 3 + 2] = b > 0 ? b : 0;
      }
    }
    state.waterGeometry.attributes.position.needsUpdate = true;
    state.waterGeometry.attributes.color.needsUpdate = true;
    state.waterPoints.material.opacity = opacity;
    state.waterPoints.material.size = 0.1 + state.smoothEnergy * 0.02;
  }

  // --- 雨丝：线段池，活跃数随雨势/能量伸缩，落水后注入波场并重生 ---
  function buildRain(root) {
    var positions = new Float32Array(RAIN_MAX * 2 * 3);
    for (var i = 0; i < RAIN_MAX; i++) {
      state.rainDrops.push({
        x: (Math.random() * 2 - 1) * RAIN_AREA_X,
        z: -5.6 + Math.random() * 7.4,
        y: Math.random() * (RAIN_TOP_Y - WATER_Y),
        speed: 6.4 + Math.random() * 4.2,
        len: 0.34 + Math.random() * 0.4,
        vx: 0
      });
    }
    var geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    var material = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    var lines = new THREE.LineSegments(geometry, material);
    lines.frustumCulled = false;
    root.add(lines);
    state.rainLines = lines;
    state.rainGeometry = geometry;
  }

  function updateRain(dt, params, audio) {
    var material = state.rainLines.material;
    material.color.copy(params.rain);
    var target = Math.round(RAIN_MAX * clamp(params.rainAmount * (0.34 + audio.energy * 0.85 + state.smoothTreble * 0.3), 0.04, 1));
    state.rainActive += (target - state.rainActive) * Math.min(1, dt * 2.2);
    var count = Math.round(state.rainActive);
    var windVx = params.wind * 1.55;
    var positions = state.rainGeometry.attributes.position.array;
    for (var i = 0; i < RAIN_MAX; i++) {
      var drop = state.rainDrops[i];
      if (i >= count || drop.y < WATER_Y) {
        if (i < count) {
          // 落水：细雨按概率注入小脉冲，让波场持续布满细碎干涉环
          if (Math.random() < 0.3 + audio.treble * 0.5) {
            injectDrop(drop.x, drop.z, 0.6 + audio.treble * 0.7);
          }
          drop.x = (Math.random() * 2 - 1) * RAIN_AREA_X;
          drop.z = -5.6 + Math.random() * 7.4;
          drop.y = RAIN_TOP_Y + Math.random() * 1.6;
          drop.speed = 6.4 + Math.random() * 4.2;
          drop.len = 0.34 + Math.random() * 0.4;
        } else {
          drop.y = -60; // 休眠：挪到视锥外
        }
      }
      drop.vx += (windVx - drop.vx) * Math.min(1, dt * 3);
      drop.y -= drop.speed * dt;
      drop.x += drop.vx * dt;
      var stretch = 1 + drop.speed * 0.055;
      positions[i * 6] = drop.x;
      positions[i * 6 + 1] = drop.y;
      positions[i * 6 + 2] = drop.z;
      positions[i * 6 + 3] = drop.x - drop.vx * 0.045;
      positions[i * 6 + 4] = drop.y + drop.len * stretch;
      positions[i * 6 + 5] = drop.z;
    }
    state.rainGeometry.attributes.position.needsUpdate = true;
    material.opacity = state.opacity * clamp(0.16 + params.rainAmount * 0.11, 0, 0.42) * params.glowStrength;
  }

  // --- 低音重雨滴：拉伸精灵，粗大坠落，砸出强波纹 + 溅花 ---
  function buildHeavyDrops(root) {
    for (var i = 0; i < HEAVY_DROP_MAX; i++) {
      var sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: state.glowTexture,
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      }));
      sprite.scale.set(0.055, 0.5, 1);
      sprite.visible = false;
      root.add(sprite);
      state.heavyDrops.push(sprite);
      state.heavySpriteData.push({ life: 0, x: 0, y: 0, z: 0, vy: 0, strength: 0 });
    }
  }

  function spawnHeavyDrop(strength) {
    for (var i = 0; i < state.heavySpriteData.length; i++) {
      var drop = state.heavySpriteData[i];
      if (drop.life > 0) continue;
      drop.life = 1;
      drop.x = ((Math.random() * 2 - 1) * 7.4) * 0.9;
      drop.z = -5.4 + Math.random() * 6.6;
      drop.y = RAIN_TOP_Y + 0.4;
      drop.vy = 8.5 + Math.random() * 3.5;
      drop.strength = strength;
      return;
    }
  }

  function updateHeavyDrops(dt, params) {
    for (var i = 0; i < state.heavySpriteData.length; i++) {
      var drop = state.heavySpriteData[i];
      var sprite = state.heavyDrops[i];
      if (drop.life <= 0) { sprite.visible = false; continue; }
      drop.y -= drop.vy * dt;
      if (drop.y <= WATER_Y) {
        // 入水：大脉冲砸进波场 + 溅花 + 月光路径短暂增亮
        injectDrop(drop.x, drop.z, (3.2 + drop.strength * 2.6) * clamp(params.ripple, 0.2, 2));
        spawnSplash(drop.x, drop.z, drop.strength);
        state.beatGlow = Math.min(1.4, state.beatGlow + 0.22 + drop.strength * 0.14);
        drop.life = 0;
        sprite.visible = false;
        continue;
      }
      sprite.visible = true;
      sprite.position.set(drop.x, drop.y, drop.z);
      sprite.material.color.copy(params.rain).lerp(scratchColor, 0.4);
      sprite.material.opacity = state.opacity * 0.85 * params.glowStrength;
      sprite.scale.set(0.05 + drop.strength * 0.028, 0.42 + drop.strength * 0.24, 1);
    }
  }

  // --- 溅花粒子池：入水时向上抛洒，受重力回落渐隐 ---
  function buildSplashes(root) {
    var positions = new Float32Array(SPLASH_MAX * 3);
    var colors = new Float32Array(SPLASH_MAX * 3);
    for (var i = 0; i < SPLASH_MAX; i++) {
      state.splashData.push({ life: 0, maxLife: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 });
      positions[i * 3 + 1] = -60;
    }
    var geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    var points = new THREE.Points(geometry, new THREE.PointsMaterial({
      map: state.glowTexture,
      vertexColors: true,
      size: 0.055,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    points.frustumCulled = false;
    root.add(points);
    state.splashes = points;
    state.splashGeometry = geometry;
  }

  function spawnSplash(x, z, strength) {
    var count = strength > 0.9 ? 9 : 6;
    var spawned = 0;
    for (var i = 0; i < state.splashData.length && spawned < count; i++) {
      var sp = state.splashData[i];
      if (sp.life > 0) continue;
      sp.maxLife = 0.45 + Math.random() * 0.3;
      sp.life = sp.maxLife;
      sp.x = x + (Math.random() - 0.5) * 0.12;
      sp.y = WATER_Y + 0.02;
      sp.z = z + (Math.random() - 0.5) * 0.12;
      var angle = Math.random() * Math.PI * 2;
      var speed = (0.5 + Math.random() * 0.8) * (0.6 + strength * 0.6);
      sp.vx = Math.cos(angle) * speed * 0.4;
      sp.vz = Math.sin(angle) * speed * 0.4;
      sp.vy = 1.1 + Math.random() * 1.3 * (0.7 + strength * 0.5);
      spawned++;
    }
  }

  var scratchColor = (typeof THREE !== 'undefined') ? new THREE.Color(1, 1, 1) : null;

  function updateSplashes(dt, params) {
    if (!state.splashGeometry) return;
    var positions = state.splashGeometry.attributes.position.array;
    var colors = state.splashGeometry.attributes.color.array;
    for (var i = 0; i < state.splashData.length; i++) {
      var sp = state.splashData[i];
      if (sp.life <= 0) { positions[i * 3 + 1] = -60; continue; }
      sp.life -= dt;
      sp.vy -= 5.6 * dt;
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.z += sp.vz * dt;
      colors[i * 3] = params.glow.r;
      colors[i * 3 + 1] = params.glow.g;
      colors[i * 3 + 2] = params.glow.b;
    }
    state.splashGeometry.attributes.position.needsUpdate = true;
    state.splashGeometry.attributes.color.needsUpdate = true;
    state.splashes.material.opacity = state.opacity * 0.8 * params.glowStrength;
    state.splashes.material.size = 0.045 + state.smoothEnergy * 0.03;
  }

  function buildMoon(root) {
    state.moonHalo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: state.glowTexture,
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    state.moonHalo.scale.set(4.6, 4.6, 1);
    state.moonHalo.position.set(MOON_POS.x, MOON_POS.y, MOON_POS.z);
    root.add(state.moonHalo);
    state.moonCore = new THREE.Sprite(new THREE.SpriteMaterial({
      map: state.glowTexture,
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    state.moonCore.scale.set(1.35, 1.35, 1);
    state.moonCore.position.set(MOON_POS.x, MOON_POS.y, MOON_POS.z + 0.01);
    root.add(state.moonCore);
  }

  function ensureLayer(scene) {
    if (state.initialized && state.root) { state.root.visible = true; return; }
    var root = new THREE.Group();
    state.glowTexture = makeGlowTexture(96);
    buildWaveField(root);
    buildRain(root);
    buildHeavyDrops(root);
    buildSplashes(root);
    buildMoon(root);
    scene.add(root);
    state.root = root;
    state.scene = scene;
    state.initialized = true;
    state.opacity = 0;
    state.pendingImpulses.length = 0;
    refreshCoverData();
  }

  function clearLayer() {
    if (!state.root) return;
    if (state.scene) state.scene.remove(state.root);
    var geometries = [];
    var materials = [];
    var textures = [];
    state.root.traverse(function (object) {
      if (object.geometry && geometries.indexOf(object.geometry) === -1) geometries.push(object.geometry);
      var objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
      objectMaterials.forEach(function (material) {
        if (!material || materials.indexOf(material) !== -1) return;
        materials.push(material);
        if (material.map && textures.indexOf(material.map) === -1) textures.push(material.map);
      });
    });
    geometries.forEach(function (geometry) { geometry.dispose(); });
    materials.forEach(function (material) { material.dispose(); });
    textures.forEach(function (texture) { texture.dispose(); });
    state.root = null;
    state.scene = null;
    state.initialized = false;
    state.waterPoints = null;
    state.waterGeometry = null;
    state.waveCur = null;
    state.wavePrev = null;
    state.baseX = null;
    state.baseZ = null;
    state.rowInnerA = null;
    state.rowInnerB = null;
    state.rowInnerS = null;
    state.colInnerC = null;
    state.rowFadeZ = null;
    state.rowMoonZ = null;
    state.rowT = null;
    state.colMoonCore = null;
    state.colMoonWide = null;
    state.pendingImpulses.length = 0;
    state.waveStepAccum = 0;
    state.coverImageData = null;
    state.lastCoverImage = null;
    state.hasCover = false;
    state.rainLines = null;
    state.rainGeometry = null;
    state.rainDrops = [];
    state.rainActive = 0;
    state.heavyDrops = [];
    state.heavySpriteData = [];
    state.splashes = null;
    state.splashGeometry = null;
    state.splashData = [];
    state.moonHalo = null;
    state.moonCore = null;
    state.moonSongKey = null;
    state.lastSongCheck = 0;
    state.glowTexture = null;
    state.prevBeat = null;
    state.prevBass = null;
    state.lastMainBeatAt = -10;
    state.lastHeavyAt = -10;
    state.beatGlow = 0;
    state.smoothBass = 0;
    state.smoothMid = 0;
    state.smoothTreble = 0;
    state.smoothEnergy = 0;
    state.smoothBeat = 0;
  }

  function isActive(fx) {
    return !!fx && Number(fx.preset) === INDEX;
  }

  function bindVisualRotation(context) {
    var rotation = context && context.visualRotation;
    if (!rotation && typeof particles !== 'undefined' && particles && particles.rotation) rotation = particles.rotation;
    state.boundRotX = rotation && isFinite(Number(rotation.x)) ? Number(rotation.x) : 0;
    state.boundRotY = rotation && isFinite(Number(rotation.y)) ? Number(rotation.y) : 0;
  }

  // 主拍波列：同一中心错峰投下三记脉冲，涌出数圈扩散波
  function triggerWaveTrain(strength, params) {
    var cx = ((Math.random() * 2 - 1) * 7.4) * 0.6;
    var cz = (-5.4 + Math.random() * 6.6) * 0.6;
    var base = (1.9 + strength * 1.4) * clamp(params.ripple, 0.2, 2);
    queueDrop(cx, cz, base, 0);
    queueDrop(cx, cz, base * 0.75, 0.13);
    queueDrop(cx, cz, base * 0.55, 0.26);
  }

  function update(dt, context) {
    context = context || {};
    var fx = context.fx || {};
    var active = isActive(fx);
    state.opacity += ((active ? 1 : 0) - state.opacity) * Math.min(1, dt * (active ? 3.4 : 4.6));
    if (!active && state.opacity < 0.005) {
      if (state.root) state.root.visible = false;
      return;
    }
    if (!context.scene) return;
    ensureLayer(context.scene);
    if (!state.root) return;

    var params = readParams(fx);
    var audio = context.audio || {};
    var bass = clamp(audio.bass, 0, 1.4);
    var mid = clamp(audio.mid, 0, 1.4);
    var treble = clamp(audio.treble, 0, 1.4);
    var energy = clamp(audio.energy, 0, 1.4);
    var beat = clamp(audio.beat, 0, 1.4);
    state.smoothBass += (bass - state.smoothBass) * Math.min(1, dt * 8);
    state.smoothMid += (mid - state.smoothMid) * Math.min(1, dt * 7);
    state.smoothTreble += (treble - state.smoothTreble) * Math.min(1, dt * 9);
    state.smoothEnergy += (energy - state.smoothEnergy) * Math.min(1, dt * 5);
    state.smoothBeat += (beat - state.smoothBeat) * Math.min(1, dt * 18);
    state.smoothBeat *= Math.max(0, 1 - dt * 2.5);
    state.beatGlow *= Math.max(0, 1 - dt * 2.2);
    state.colorFlashWater = Math.max(0, state.colorFlashWater - dt * 1.5);
    state.colorFlashRain = Math.max(0, state.colorFlashRain - dt * 1.5);
    state.colorFlashGlow = Math.max(0, state.colorFlashGlow - dt * 1.5);
    state.time += dt;

    // 主拍检测：上升沿 + 不应期（与心跳监护同款，避免指数拖尾重复计数）
    var beatRise = beat - (state.prevBeat == null ? beat : state.prevBeat);
    state.prevBeat = beat;
    if (beat > 0.2 && beatRise > 0.04 && state.time - state.lastMainBeatAt > 0.26) {
      triggerWaveTrain(clamp(0.25 + bass * 0.4 + beat * 0.35, 0.3, 1.3), params);
      state.beatGlow = Math.min(1.4, state.beatGlow + 0.55);
      state.lastMainBeatAt = state.time;
    }
    // 低音瞬态：投放重雨滴
    var bassRise = bass - (state.prevBass == null ? bass : state.prevBass);
    state.prevBass = bass;
    if (bass > 0.3 && bassRise > 0.05 && state.time - state.lastHeavyAt > 0.18 && state.smoothEnergy > 0.1) {
      spawnHeavyDrop(clamp(bass * 0.7, 0.25, 1.2));
      state.lastHeavyAt = state.time;
    }

    bindVisualRotation(context);
    // 湖面必须保持水平：只取偏航，俯仰压缩到 15% 做轻微视差
    state.root.rotation.y = state.boundRotY;
    state.root.rotation.x = state.boundRotX * 0.15;
    state.root.visible = state.opacity > 0.01;

    // 歌曲切换 → 月亮形态随之变化（月相/色调/大小由歌曲身份哈希决定，恒定可复现）
    if (state.time - state.lastSongCheck > 0.4) {
      state.lastSongCheck = state.time;
      var songKey = '';
      if (typeof playlist !== 'undefined' && typeof currentIdx !== 'undefined' && playlist && playlist[currentIdx]) {
        var songNow = playlist[currentIdx];
        songKey = String(songNow.id == null ? '' : songNow.id) + '|' + String(songNow.name || '') + '|' + String(songNow.artist || songNow.artists || '');
      }
      if (songKey !== state.moonSongKey) {
        state.moonSongKey = songKey;
        applyMoonForm(songKey);
      }
    }

    refreshCoverData();
    updateWaveField(dt, params);
    updateRain(dt, params, { energy: state.smoothEnergy, treble: state.smoothTreble });
    updateHeavyDrops(dt, params);
    updateSplashes(dt, params);
    state.moonHalo.material.color.copy(params.glow).lerp(scratchColor, 0.6);
    state.moonHalo.material.opacity = state.opacity * (0.1 + state.smoothEnergy * 0.08 + state.beatGlow * 0.05) * params.glowStrength;
    // 月面纹理自带色调与明暗，核心精灵保持纯白，形态缩放由歌曲哈希决定
    state.moonCore.material.opacity = state.opacity * (0.9 + state.beatGlow * 0.1) * Math.min(1.2, params.glowStrength);
    state.moonCore.scale.setScalar(state.moonFormScale * (1 + state.beatGlow * 0.05 + state.smoothBass * 0.03));
  }

  function onPresetChange(previous, next, context) {
    if (previous === INDEX && next !== INDEX) clearLayer();
    if (next === INDEX && context && context.scene) {
      if (state.initialized) clearLayer();
      ensureLayer(context.scene);
      state.opacity = 0;
    }
  }

  function normalizeColor(value, fallback) {
    if (typeof normalizeHexColor === 'function') return normalizeHexColor(value || fallback, fallback);
    return /^#[0-9a-fA-F]{6}$/.test(String(value || '')) ? String(value) : fallback;
  }

  function updateLakeRainfallColorControls() {
    COLOR_CONTROLS.forEach(function (item) {
      var fallback = fxDefaults[item.key] || '#ffffff';
      var color = normalizeColor(fx && fx[item.key], fallback);
      var picker = document.getElementById(item.picker);
      var value = document.getElementById(item.value);
      if (picker) picker.value = color;
      if (value) value.textContent = color.toUpperCase();
    });
  }

  function setLakeRainfallColor(key, color, silent) {
    var item = COLOR_CONTROLS.find(function (control) { return control.key === key || control.picker === key; });
    if (!item) return;
    var fallback = fxDefaults[item.key] || '#ffffff';
    fx[item.key] = normalizeColor(color, fallback);
    if (item.key === 'lakeRainfallWaterColor') state.colorFlashWater = 1;
    else if (item.key === 'lakeRainfallRainColor') state.colorFlashRain = 1;
    else state.colorFlashGlow = 1;
    updateLakeRainfallColorControls();
    saveLyricLayout({ user: true, reason: item.key });
    if (!silent) showToast(item.label + ': ' + fx[item.key].toUpperCase());
  }

  function resetLakeRainfallColor(key) {
    var item = COLOR_CONTROLS.find(function (control) { return control.key === key || control.picker === key; });
    if (!item) return;
    fx[item.key] = normalizeColor(fxDefaults[item.key], '#ffffff');
    updateLakeRainfallColorControls();
    saveLyricLayout({ user: true, reason: item.key });
    showToast(item.label + '已恢复默认');
  }

  global.updateLakeRainfallColorControls = updateLakeRainfallColorControls;
  global.setLakeRainfallColor = setLakeRainfallColor;
  global.resetLakeRainfallColor = resetLakeRainfallColor;
  global.updateLakeRainfallControlVisibility = function () {
    var ids = [
      'fx-lake-rain-section', 'lake-rain-color-section', 'lake-rain-water-row',
      'lake-rain-rain-row', 'lake-rain-glow-row', 'fx-lakerainrain',
      'fx-lakerainwind', 'fx-lakerainripple', 'fx-lakerainflowglow', 'fx-lakeraincover'
    ];
    var active = typeof LAKE_RAINFALL_PRESET_INDEX !== 'undefined' && Number(fx && fx.preset) === LAKE_RAINFALL_PRESET_INDEX;
    if (typeof setFxPanelControlsHidden === 'function') setFxPanelControlsHidden(ids, !active);
  };

  global.MOMusicLakeRainfall = {
    INDEX: INDEX,
    isActive: isActive,
    update: update,
    clear: clearLayer,
    onPresetChange: onPresetChange
  };
})(typeof window !== 'undefined' ? window : globalThis);
