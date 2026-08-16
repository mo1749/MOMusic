/**
 * Heart Pulse visual preset for MOMusic.
 *
 * A music-reactive cardiac monitor: every detected beat injects a PQRST
 * wave packet at the right edge of a rolling ECG trace (the pen head).
 * The upper-right heart follows the classic love_heart look: particles
 * ride the heart outline in random pink variants, converge from below on
 * entrance, thump with a breath + beat envelope, and strong beats throw
 * sparks off the contour. The monitor label reports the BPM measured from
 * real beat intervals; quiet passages fall back to a calm ~65 BPM rhythm.
 */
(function (global) {
  'use strict';

  var INDEX = 12;
  var TRACE_POINTS = 321;
  var TRACE_PARTICLE_STEP = 4;
  var TRACE_CYCLES = 3.36;          // 心电相位单位下整屏的宽度（1 个周期 = 1 次 PQRST）
  var PACKET_SPAN_CLINICAL = 1.0;   // 临床波形：单个波包占用的相位长度
  var PACKET_SPAN_DOUBLE = 1.36;    // 双峰波形：主峰 + 滞后次峰
  var PACKET_DOUBLE_DELAY = 0.36;
  var IDLE_BEAT_INTERVAL = 0.92;    // 空闲心率 ~65 BPM，与波形速度解耦
  var DEFAULT_LINE_COLOR = '#3dffa0';
  var DEFAULT_GLOW_COLOR = '#7af7dc';
  var DEFAULT_HEART_COLOR = '#ff4d78';
  var DEFAULT_SPEED = 1.0;
  var DEFAULT_BEAT_RESPONSE = 1.15;
  var DEFAULT_GLOW = 1.1;
  var DEFAULT_GRID = 0.72;
  var DEFAULT_TRAIL = 0.9;

  var state = {
    root: null,
    scene: null,
    initialized: false,
    opacity: 0,
    time: 0,
    scroll: 0,
    smoothBass: 0,
    smoothMid: 0,
    smoothTreble: 0,
    smoothEnergy: 0,
    smoothBeat: 0,
    heartKick: 0,
    beatArmed: true,
    prevBeat: null,
    prevBass: null,
    lastMainBeatAt: -10,
    lastMiniBeatAt: -10,
    nextIdleBeatAt: 0,
    packets: [],
    beatTimes: [],
    bpmTarget: 72,
    waveformMode: 'clinical',
    boundRotX: 0,
    boundRotY: 0,
    gridMinor: null,
    gridMajor: null,
    traceGeometry: null,
    traceCore: null,
    traceGlow: null,
    tracePoints: null,
    tracePointGeometry: null,
    scanHead: null,
    heartGroup: null,
    heartParticles: null,
    heartParticleData: [],
    heartBaseColors: null,
    heartSparks: null,
    heartSparkData: [],
    heartColorKey: '',
    heartIntroClock: 0,
    colorFlashHeart: 0,
    colorFlashLine: 0,
    colorFlashGlow: 0,
    heartParticleTexture: null,
    beatClock: 10,
    heartHalo: null,
    monitorLabel: null,
    monitorLabelTexture: null,
    lastLabelKey: '',
    bpm: 72,
    pulseRings: []
  };

  var COLOR_CONTROLS = [
    { key: 'heartPulseLineColor', picker: 'heart-pulse-line-picker', value: 'heart-pulse-line-value', label: '心电颜色' },
    { key: 'heartPulseGlowColor', picker: 'heart-pulse-glow-picker', value: 'heart-pulse-glow-value', label: '脉冲辉光' },
    { key: 'heartPulseHeartColor', picker: 'heart-pulse-heart-picker', value: 'heart-pulse-heart-value', label: '爱心颜色' }
  ];

  function clamp(value, min, max) {
    value = Number(value);
    if (!isFinite(value)) value = min;
    return Math.max(min, Math.min(max, value));
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
      line: new THREE.Color(readHex(fx, 'heartPulseLineColor', DEFAULT_LINE_COLOR)),
      glow: new THREE.Color(readHex(fx, 'heartPulseGlowColor', DEFAULT_GLOW_COLOR)),
      heart: new THREE.Color(readHex(fx, 'heartPulseHeartColor', DEFAULT_HEART_COLOR)),
      speed: readNumber(fx, 'heartPulseSpeed', DEFAULT_SPEED, 0.35, 2.4),
      beatResponse: readNumber(fx, 'heartPulseBeatResponse', DEFAULT_BEAT_RESPONSE, 0, 2),
      glowStrength: readNumber(fx, 'heartPulseGlow', DEFAULT_GLOW, 0.25, 2),
      grid: readNumber(fx, 'heartPulseGrid', DEFAULT_GRID, 0, 1),
      trail: readNumber(fx, 'heartPulseTrail', DEFAULT_TRAIL, 0.15, 1.5)
    };
  }

  // 预采样 PQRST 模板：P 波 - Q 谷 + R 尖峰 - S 谷 + T 波，
  // 波形逐帧对 321 个点 × 多个波包求值，查表代替 exp 保证帧耗稳定
  var ECG_LUT_SIZE = 512;
  var ECG_LUT = (function () {
    function bell(phase, center, width, amplitude) {
      var distance = (phase - center) / width;
      return Math.exp(-distance * distance) * amplitude;
    }
    var lut = new Float32Array(ECG_LUT_SIZE + 1);
    for (var i = 0; i <= ECG_LUT_SIZE; i++) {
      var phase = i / ECG_LUT_SIZE;
      lut[i] = bell(phase, 0.11, 0.042, 0.15)
        - bell(phase, 0.225, 0.016, 0.22)
        + bell(phase, 0.25, 0.012, 1.30)
        - bell(phase, 0.286, 0.022, 0.38)
        + bell(phase, 0.50, 0.082, 0.30);
    }
    return lut;
  })();

  function ecgTemplate(phase) {
    if (phase < 0 || phase >= 1) return 0;
    var index = phase * ECG_LUT_SIZE;
    var low = index | 0;
    var frac = index - low;
    return ECG_LUT[low] + (ECG_LUT[low + 1] - ECG_LUT[low]) * frac;
  }

  function packetAmpValue(packet, phase) {
    var wave = ecgTemplate(phase);
    if (packet.double && phase >= PACKET_DOUBLE_DELAY) {
      wave += 0.55 * ecgTemplate(phase - PACKET_DOUBLE_DELAY);
    }
    return wave;
  }

  function makeGlowTexture(size) {
    var canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext('2d');
    var half = size / 2;
    var gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.16, 'rgba(255,255,255,.96)');
    gradient.addColorStop(0.48, 'rgba(255,255,255,.30)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    var texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  function makeMonitorLabel() {
    var canvas = document.createElement('canvas');
    canvas.width = 720; canvas.height = 180;
    var texture = new THREE.CanvasTexture(canvas);
    var sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
    sprite.scale.set(4.8, 1.2, 1);
    sprite.position.set(3.95, 2.35, 0.12);
    sprite.userData.canvas = canvas;
    return sprite;
  }

  function updateMonitorLabel(fx, params) {
    if (!state.monitorLabel) return;
    // 透明度必须每帧更新：内容 key 未变时下方会早退，否则预设渐入时标签停留在旧透明度
    state.monitorLabel.material.opacity = state.opacity * 0.88;
    var title = String(fx.heartPulseTitle == null ? fxDefaults.heartPulseTitle : fx.heartPulseTitle).slice(0, 28);
    var subtitle = String(fx.heartPulseSubtitle == null ? fxDefaults.heartPulseSubtitle : fx.heartPulseSubtitle).slice(0, 36);
    var status = String(fx.heartPulseStatus == null ? fxDefaults.heartPulseStatus : fx.heartPulseStatus).slice(0, 24);
    var bpmText = fx.heartPulseShowBpm === false ? '' : Math.round(state.bpm) + ' BPM';
    var key = title + '|' + subtitle + '|' + status + '|' + bpmText + '|' + params.line.getHexString() + '|' + params.glow.getHexString();
    if (key === state.lastLabelKey) return;
    state.lastLabelKey = key;
    var canvas = state.monitorLabel.userData.canvas;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '700 34px Arial, sans-serif';
    ctx.fillStyle = '#' + params.glow.getHexString();
    ctx.fillText(title.toUpperCase(), 18, 48);
    ctx.font = '500 22px Arial, sans-serif';
    ctx.fillStyle = '#' + params.line.getHexString();
    ctx.fillText(subtitle.toUpperCase(), 18, 82);
    ctx.font = '600 18px Arial, sans-serif';
    ctx.fillStyle = '#' + params.glow.getHexString();
    ctx.fillText(status.toUpperCase(), 390, 48);
    if (bpmText) { ctx.font = '700 46px Arial, sans-serif'; ctx.fillText(bpmText, 18, 142); }
    state.monitorLabelTexture.needsUpdate = true;
  }

  function makeGridLines(step, major) {
    var positions = [];
    var minX = -7.15, maxX = 7.15, minY = -3.65, maxY = 3.65;
    var x, y;
    for (x = minX; x <= maxX + 0.001; x += step) {
      positions.push(x, minY, -2.2, x, maxY, -2.2);
    }
    for (y = minY; y <= maxY + 0.001; y += step) {
      positions.push(minX, y, -2.2, maxX, y, -2.2);
    }
    var geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    var material = new THREE.LineBasicMaterial({
      color: major ? 0xffffff : 0x8ef6e5,
      transparent: true,
      opacity: major ? 0.12 : 0.055,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    var lines = new THREE.LineSegments(geometry, material);
    lines.frustumCulled = false;
    return lines;
  }

  // --- 3D 粒子爱心（love_heart 风格）：粒子沿心形轮廓带分布、随机粉色变体、
  //     开场从底部弹簧汇聚、心跳重击时向外甩出火星 ---
  var HEART_OUTLINE_SCALE = 0.082;
  var HEART_CENTROID_Y = 0.1;
  var HEART_PARTICLE_COUNT = 7200;  // 轮廓带 + 表面壳 + 内芯 + 掉落粒子总数
  var HEART_CONTOUR_COUNT = 520;    // 轮廓带粒子（最亮，勾出心形）
  var HEART_DRIP_COUNT = 700;       // 持续向下掉落的粒子
  var HEART_SPARK_COUNT = 110;      // 火星碎屑池
  var HEART_RIBBON_INSET = 0.15;    // 轮廓带最大内偏
  var HEART_HALF_DEPTH = 0.78;      // 枕形半厚：饱满立体
  var HEART_DEPTH_REF = 0.55;       // 深度达到满值所需的离边距离

  function pointInHeartPolygon(px, py, polygon) {
    var inside = false;
    for (var i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      var xi = polygon[i].x, yi = polygon[i].y, xj = polygon[j].x, yj = polygon[j].y;
      if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function distanceToHeartPolygon(px, py, polygon) {
    var best = Infinity;
    for (var i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      var ax = polygon[j].x, ay = polygon[j].y;
      var dx = polygon[i].x - ax, dy = polygon[i].y - ay;
      var t = dx || dy ? ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy) : 0;
      t = Math.max(0, Math.min(1, t));
      var ex = ax + dx * t - px, ey = ay + dy * t - py;
      var d2 = ex * ex + ey * ey;
      if (d2 < best) best = d2;
    }
    return Math.sqrt(best);
  }

  // 枕形深度剖面：sqrt 过渡让边缘圆润收薄、中心保持厚度
  function heartHalfDepth(distanceToEdge) {
    return HEART_HALF_DEPTH * Math.sqrt(Math.max(0, Math.min(1, distanceToEdge / HEART_DEPTH_REF)));
  }

  function heartOutline2D(t) {
    return {
      x: 16 * Math.pow(Math.sin(t), 3) * HEART_OUTLINE_SCALE,
      y: (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * HEART_OUTLINE_SCALE
    };
  }

  // 轮廓点处的单位内法线（朝向质心一侧）
  function heartInwardNormal(t) {
    var p = heartOutline2D(t);
    var q = heartOutline2D(t + 0.012);
    var tx = q.x - p.x, ty = q.y - p.y;
    var len = Math.sqrt(tx * tx + ty * ty) || 1;
    var nx = -ty / len, ny = tx / len;
    if ((HEART_CENTROID_Y - p.y) * ny + (0 - p.x) * nx < 0) { nx = -nx; ny = -ny; }
    return { x: nx, y: ny, px: p.x, py: p.y };
  }

  // 掉落粒子出生点：三次随机取均值 → 钟形分布，集中在底部尖端、向两侧递减
  function heartDripSpawnT() {
    return (0.5 + (Math.random() + Math.random() + Math.random()) / 3) * Math.PI;
  }

    function buildHeartParticles() {
    var polygon = [];
    for (var g = 0; g < 96; g++) polygon.push(heartOutline2D(g / 96 * Math.PI * 2));
    var data = [];
    var positions = new Float32Array(HEART_PARTICLE_COUNT * 3);
    var colors = new Float32Array(HEART_PARTICLE_COUNT * 3);

    function addParticle(x, y, z, glow) {
      var index = data.length;
      data.push({
        bx: x, by: y, bz: z,
        glow: glow,
        // 参照 love_heart 的随机粉色系：mode 0 提亮 / 1 压暗 / 2 提饱和 / 3 近白闪光
        mode: (Math.random() * 4) | 0,
        mix: 0.25 + Math.random() * 0.55,
        phase: Math.random() * Math.PI * 2,
        speed: 0.6 + Math.random() * 0.8,
        drift: 0.6 + Math.random() * 0.4,
        delay: Math.random() * 0.5,
        duration: 0.8 + Math.random() * 0.55,
        sx: (Math.random() - 0.5) * 0.6,
        syDrop: 1.9 + Math.random() * 2.1
      });
      // 开场位置：屏幕下方，等待弹簧汇聚
      positions[index * 3] = x + data[index].sx;
      positions[index * 3 + 1] = y - data[index].syDrop;
      positions[index * 3 + 2] = z;
    }

    // 1) 轮廓带：最亮，勾出清晰心形轮廓（圆润厚边）
    for (var c = 0; c < HEART_CONTOUR_COUNT; c++) {
      var n = heartInwardNormal(Math.random() * Math.PI * 2);
      var inset = Math.pow(Math.random(), 1.7) * HEART_RIBBON_INSET;
      var half = heartHalfDepth(inset);
      var z = (Math.random() < 0.5 ? -1 : 1) * half * (0.7 + 0.3 * Math.random());
      addParticle(n.px + n.x * inset, n.py + n.y * inset, z, 1);
    }

    // 2) 表面壳（读出立体形）+ 内芯填充（饱满体积），拒绝采样内部点
    var attempts = 0;
    var fillTarget = HEART_PARTICLE_COUNT - HEART_DRIP_COUNT;
    while (data.length < fillTarget && attempts < 90000) {
      attempts++;
      var sx = (Math.random() * 2 - 1) * 1.35;
      var sy = HEART_CENTROID_Y + (Math.random() * 2 - 1) * 1.45;
      if (!pointInHeartPolygon(sx, sy, polygon)) continue;
      var d = distanceToHeartPolygon(sx, sy, polygon);
      var depth = heartHalfDepth(d);
      if (Math.random() < 0.55) {
        // 表面壳：贴前后弧面
        var sz = (Math.random() < 0.5 ? -1 : 1) * depth * (0.82 + 0.18 * Math.random());
        addParticle(sx, sy, sz, 0.98);
      } else {
        // 内芯：体积填充
        var iz = (Math.random() * 2 - 1) * depth * 0.85;
        addParticle(sx, sy, iz, 0.66 + Math.random() * 0.3);
      }
    }

    // 3) 掉落粒子：从心形下半轮廓持续洒落、加速下坠、渐隐后重生
    for (var dripIndex = 0; dripIndex < HEART_DRIP_COUNT && data.length < HEART_PARTICLE_COUNT; dripIndex++) {
      var dn = heartInwardNormal(heartDripSpawnT());
      var dInset = Math.random() * HEART_RIBBON_INSET;
      addParticle(dn.px + dn.x * dInset, dn.py + dn.y * dInset, (Math.random() - 0.5) * 0.1, 0.92);
      var dp = data[data.length - 1];
      dp.drip = true;
      dp.dripProgress = Math.random();
      dp.dripSpeed = 0.16 + Math.random() * 0.22;
      dp.dropDist = 2.2 + Math.random() * 2.6;
    }

    var geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    state.heartParticleTexture = makeGlowTexture(64);
    state.heartParticles = new THREE.Points(geometry, new THREE.PointsMaterial({
      map: state.heartParticleTexture,
      vertexColors: true,
      size: 0.07,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    state.heartParticles.frustumCulled = false;
    state.heartParticleData = data;
    state.heartBaseColors = new Float32Array(data.length * 3);
    state.heartGroup.add(state.heartParticles);
    buildHeartSparks();
  }

  function buildHeartSparks() {
    var positions = new Float32Array(HEART_SPARK_COUNT * 3);
    var colors = new Float32Array(HEART_SPARK_COUNT * 3);
    var data = [];
    for (var i = 0; i < HEART_SPARK_COUNT; i++) {
      data.push({ life: 0, maxLife: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 });
    }
    var geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    state.heartSparks = new THREE.Points(geometry, new THREE.PointsMaterial({
      map: state.heartParticleTexture,
      vertexColors: true,
      size: 0.058,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    state.heartSparks.frustumCulled = false;
    state.heartSparkData = data;
    state.heartGroup.add(state.heartSparks);
  }

  // 重击时从轮廓随机点向外甩出火星（强拍多、弱拍少、空闲不甩）
  function spawnHeartSparks(strength) {
    var list = state.heartSparkData;
    if (!list.length) return;
    var count = strength > 0.85 ? 16 : 9;
    var spawned = 0;
    for (var i = 0; i < list.length && spawned < count; i++) {
      var spark = list[i];
      if (spark.life > 0) continue;
      var n = heartInwardNormal(Math.random() * Math.PI * 2);
      spark.x = n.px;
      spark.y = n.py;
      spark.z = (Math.random() - 0.5) * 0.12;
      var speed = (0.8 + Math.random() * 0.9) * (0.7 + 0.5 * strength);
      spark.vx = -n.x * speed + (Math.random() - 0.5) * 0.3;
      spark.vy = -n.y * speed + 0.25 + Math.random() * 0.4;
      spark.vz = (Math.random() - 0.5) * 0.4;
      spark.maxLife = 0.7 + Math.random() * 0.45;
      spark.life = spark.maxLife;
      spawned++;
    }
  }

  function updateHeartSparks(dt, params, opacity) {
    if (!state.heartSparks) return;
    var positionAttr = state.heartSparks.geometry.attributes.position;
    var colorAttr = state.heartSparks.geometry.attributes.color;
    var positions = positionAttr.array;
    var colors = colorAttr.array;
    var base = params.heart;
    var alive = 0;
    for (var i = 0; i < state.heartSparkData.length; i++) {
      var spark = state.heartSparkData[i];
      if (spark.life <= 0) continue;
      spark.life -= dt;
      spark.vy -= dt * 1.5;
      spark.x += spark.vx * dt;
      spark.y += spark.vy * dt;
      spark.z += spark.vz * dt;
      var k = spark.life <= 0 ? 0 : Math.min(1, spark.life / spark.maxLife);
      positions[i * 3] = spark.x;
      positions[i * 3 + 1] = spark.y;
      positions[i * 3 + 2] = spark.z;
      colors[i * 3] = base.r * k;
      colors[i * 3 + 1] = base.g * k;
      colors[i * 3 + 2] = base.b * k;
      if (spark.life > 0) alive++;
    }
    positionAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
    state.heartSparks.material.opacity = alive > 0 ? opacity * 0.95 * params.glowStrength : 0;
  }

  // 每粒子粉色变体着色（基于用户选的爱心颜色做提亮/压暗/提饱和/近白抖动），
  // 再乘以层亮度（轮廓亮 / 表面壳中 / 内芯暗）写入基色；每帧闪烁只改活动色
  function refreshHeartParticleColors(params) {
    if (!state.heartParticles) return;
    var key = params.heart.getHexString();
    if (key === state.heartColorKey) return;
    state.heartColorKey = key;
    var attr = state.heartParticles.geometry.attributes.color;
    var colors = attr.array;
    var baseColors = state.heartBaseColors;
    var base = params.heart;
    for (var i = 0; i < state.heartParticleData.length; i++) {
      var d = state.heartParticleData[i];
      var r = base.r, g = base.g, b = base.b;
      if (d.mode === 0) {
        r += (1 - r) * d.mix; g += (1 - g) * d.mix; b += (1 - b) * d.mix;
      } else if (d.mode === 1) {
        var dark = 1 - 0.32 * d.mix;
        r *= dark; g *= dark; b *= dark;
      } else if (d.mode === 2) {
        var boost = 1 + 0.35 * d.mix;
        r = Math.min(1, r * boost); g = Math.min(1, g * boost); b = Math.min(1, b * boost);
      } else {
        var white = 0.55 + 0.35 * d.mix;
        r += (1 - r) * white; g += (1 - g) * white; b += (1 - b) * white;
      }
      baseColors[i * 3] = r * d.glow;
      baseColors[i * 3 + 1] = g * d.glow;
      baseColors[i * 3 + 2] = b * d.glow;
      colors[i * 3] = baseColors[i * 3];
      colors[i * 3 + 1] = baseColors[i * 3 + 1];
      colors[i * 3 + 2] = baseColors[i * 3 + 2];
    }
    attr.needsUpdate = true;
  }

  // lub-dub 双峰心跳包络（参照 love_heart 的呼吸+重击节奏，由真实节拍触发）
  function heartBeatEnvelope(t) {
    if (t < 0 || t > 1.2) return 0;
    var lub = Math.exp(-Math.pow((t - 0.075) / 0.07, 2));
    var dub = 0.55 * Math.exp(-Math.pow((t - 0.32) / 0.09, 2));
    return lub + dub;
  }

  // 持续运动：常驻粒子绕基准点三轴李萨如漂移，心跳时沿质心方向径向外推
  // （动效由粒子运动实现）；掉落粒子加速下坠渐隐后重生；亮度随相位闪烁
  function updateHeartParticles(env, dt) {
    if (!state.heartParticles) return;
    var geometry = state.heartParticles.geometry;
    var positions = geometry.attributes.position.array;
    var colors = geometry.attributes.color.array;
    var baseColors = state.heartBaseColors;
    var time = state.time;
    var clock = state.heartIntroClock;
    var introActive = clock < 2.2;
    for (var i = 0; i < state.heartParticleData.length; i++) {
      var d = state.heartParticleData[i];
      var t = time * d.speed;
      var x, y, z, bright;
      if (d.drip) {
        d.dripProgress += dt * d.dripSpeed * (0.7 + env * 0.6);
        if (d.dripProgress >= 1) {
          d.dripProgress = 0;
          var dn = heartInwardNormal(heartDripSpawnT());
          d.bx = dn.px;
          d.by = dn.py;
          d.bz = (Math.random() - 0.5) * 0.1;
        }
        var fall = d.dripProgress * d.dripProgress * 0.6 + d.dripProgress * 0.4;
        // 风中摇摆：双频摆动（越落摆幅越大）+ 全场慢变风向漂移（粒子间共享风向、响应各异）
        var swayAmp = 0.045 + d.dripProgress * 0.16;
        var sway = Math.sin(d.dripProgress * 5.2 + d.phase) + 0.5 * Math.sin(d.dripProgress * 11 + d.phase * 1.7);
        var wind = Math.sin(state.time * 0.7 + d.phase * 0.15) * 0.5 + Math.sin(state.time * 0.23) * 0.3;
        x = d.bx + sway * swayAmp + wind * d.dripProgress * 0.45 * d.drift;
        y = d.by - d.dropDist * fall;
        z = d.bz + Math.sin(d.dripProgress * 7 + d.phase * 2.1) * 0.04;
        bright = (1 - d.dripProgress * 0.85) * (0.85 + 0.15 * Math.sin(t * 2.4 + d.phase));
      } else {
        var drift = d.drift * (0.75 + 0.5 * env);
        var rx = d.bx, ry = d.by - HEART_CENTROID_Y, rz = d.bz;
        var dist = Math.sqrt(rx * rx + ry * ry + rz * rz) || 1;
        var push = env * (0.05 + 0.1 * d.glow);
        x = d.bx + (rx / dist) * push + Math.sin(t * 1.35 + d.phase) * 0.05 * drift;
        y = d.by + (ry / dist) * push + Math.sin(t * 1.65 + d.phase * 1.7) * 0.055 * drift;
        z = d.bz + (rz / dist) * push + Math.sin(t * 1.1 + d.phase * 2.3) * 0.065 * drift;
        bright = 0.92 + 0.18 * Math.sin(t * 2.2 + d.phase * 3.1);
      }
      if (introActive) {
        var p = (clock - d.delay) / d.duration;
        if (p < 1) {
          var e = p <= 0 ? 0 : 1 - Math.pow(1 - p, 3);
          var sxp = d.bx + d.sx;
          var syp = d.by - d.syDrop;
          x = sxp + (x - sxp) * e;
          y = syp + (y - syp) * e;
          z = d.bz * e;
        }
      }
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      colors[i * 3] = baseColors[i * 3] * bright;
      colors[i * 3 + 1] = baseColors[i * 3 + 1] * bright;
      colors[i * 3 + 2] = baseColors[i * 3 + 2] * bright;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
  }

  function makePulseRing(index) {
    var points = [];
    for (var i = 0; i <= 72; i++) {
      var angle = i / 72 * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(angle), Math.sin(angle) * 0.72, 0));
    }
    var geometry = new THREE.BufferGeometry().setFromPoints(points);
    var material = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    var ring = new THREE.Line(geometry, material);
    ring.userData.progress = 1;
    ring.userData.delay = index * 0.16;
    ring.frustumCulled = false;
    return ring;
  }

  function ensureLayer(scene) {
    if (state.initialized && state.scene === scene) return;
    clearLayer();

    var root = new THREE.Group();
    root.visible = false;
    state.gridMinor = makeGridLines(0.42, false);
    state.gridMajor = makeGridLines(1.68, true);
    root.add(state.gridMinor);
    root.add(state.gridMajor);

    state.traceGeometry = new THREE.BufferGeometry();
    state.traceGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Array(TRACE_POINTS * 3).fill(0), 3));
    var glowMaterial = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    var coreMaterial = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    state.traceGlow = new THREE.Line(state.traceGeometry, glowMaterial);
    state.traceCore = new THREE.Line(state.traceGeometry, coreMaterial);
    state.traceGlow.position.z = -0.08;
    state.traceCore.position.z = -0.02;
    state.traceGlow.frustumCulled = false;
    state.traceCore.frustumCulled = false;
    root.add(state.traceGlow);
    root.add(state.traceCore);

    var particleCount = Math.ceil(TRACE_POINTS / TRACE_PARTICLE_STEP);
    state.tracePointGeometry = new THREE.BufferGeometry();
    state.tracePointGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Array(particleCount * 3).fill(0), 3));
    state.tracePoints = new THREE.Points(state.tracePointGeometry, new THREE.PointsMaterial({
      map: makeGlowTexture(64),
      color: 0xffffff,
      transparent: true,
      opacity: 0.58,
      size: 0.064,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    state.tracePoints.position.z = 0.02;
    state.tracePoints.frustumCulled = false;
    root.add(state.tracePoints);

    state.scanHead = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture(128),
      color: 0xffffff,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    state.scanHead.scale.set(0.54, 0.54, 1);
    state.scanHead.position.z = 0.08;
    root.add(state.scanHead);

    state.heartGroup = new THREE.Group();
    state.heartGroup.position.set(3.95, 1.22, -0.16);
    state.heartHalo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture(256),
      color: 0xffffff,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    state.heartHalo.scale.set(3.5, 3.5, 1);
    state.heartHalo.position.z = -0.08;
    state.heartGroup.add(state.heartHalo);
    buildHeartParticles();
    for (var ringIndex = 0; ringIndex < 3; ringIndex++) {
      var ring = makePulseRing(ringIndex);
      state.heartGroup.add(ring);
      state.pulseRings.push(ring);
    }
    root.add(state.heartGroup);
    state.monitorLabel = makeMonitorLabel();
    state.monitorLabelTexture = state.monitorLabel.material.map;
    root.add(state.monitorLabel);

    scene.add(root);
    state.root = root;
    state.scene = scene;
    state.initialized = true;
    state.opacity = 0;
    state.nextIdleBeatAt = 0;
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
    state.gridMinor = null;
    state.gridMajor = null;
    state.traceGeometry = null;
    state.traceCore = null;
    state.traceGlow = null;
    state.tracePoints = null;
    state.tracePointGeometry = null;
    state.scanHead = null;
    state.heartGroup = null;
    state.heartParticles = null;
    state.heartParticleData = [];
    state.heartBaseColors = null;
    state.heartSparks = null;
    state.heartSparkData = [];
    state.heartColorKey = '';
    state.heartIntroClock = 0;
    state.heartParticleTexture = null;
    state.beatClock = 10;
    state.heartHalo = null;
    state.monitorLabel = null;
    state.monitorLabelTexture = null;
    state.lastLabelKey = '';
    state.pulseRings = [];
    state.packets = [];
    state.beatTimes = [];
    state.bpmTarget = 72;
    state.waveformMode = 'clinical';
    state.prevBeat = null;
    state.prevBass = null;
    state.lastMainBeatAt = -10;
    state.lastMiniBeatAt = -10;
    state.smoothMid = 0;
    state.smoothTreble = 0;
  }

  function isActive(fx) {
    return !!fx && Number(fx.preset) === INDEX;
  }

  function triggerHeartbeat(strength, opts) {
    opts = opts || {};
    var mini = !!opts.mini;
    state.heartKick = Math.max(state.heartKick, mini ? 0.4 : 1);
    if (!mini) state.beatClock = 0;
    // 强拍才甩火星：空闲补拍与低音轻拍保持安静
    if (!mini && (strength == null || strength > 0.45)) spawnHeartSparks(strength == null ? 0.6 : strength);
    if (!mini) {
      state.pulseRings.forEach(function (ring) {
        ring.userData.progress = -ring.userData.delay;
      });
      // BPM 只统计主拍，不被低音轻拍污染
      var now = state.time;
      state.beatTimes.push(now);
      if (state.beatTimes.length > 10) state.beatTimes.shift();
      if (state.beatTimes.length >= 3) {
        var intervals = [];
        for (var i = 1; i < state.beatTimes.length; i++) {
          intervals.push(state.beatTimes[i] - state.beatTimes[i - 1]);
        }
        intervals.sort(function (a, b) { return a - b; });
        var median = intervals[Math.floor(intervals.length / 2)];
        if (median > 0.12) state.bpmTarget = clamp(60 / median, 42, 208);
      }
    }
    // 波包幅度随当拍音乐能量变化：轻拍小波、强拍大波，不再千篇一律
    var amp = (mini ? 0.42 : 0.62) + clamp(strength == null ? state.smoothBeat : strength, 0, 1.4) * 0.5;
    state.packets.push({ age: 0, amp: amp, double: state.waveformMode === 'double' });
    if (state.packets.length > 56) state.packets.shift();
  }

  function bindVisualRotation(context) {
    var rotation = context && context.visualRotation;
    if (!rotation && typeof particles !== 'undefined' && particles && particles.rotation) rotation = particles.rotation;
    state.boundRotX = rotation && isFinite(Number(rotation.x)) ? Number(rotation.x) : 0;
    state.boundRotY = rotation && isFinite(Number(rotation.y)) ? Number(rotation.y) : 0;
  }

  // 屏幕位置 ratio ∈ [0,1]（左→右）处的心电值：波包在右缘注入后向左漂移，
  // s = 距右缘的相位距离，波包 age 时刻覆盖 s ∈ [age-span, age]
  function waveformAt(ratio, mode, amplitude) {
    if (mode === 'sine') {
      return Math.sin((ratio * TRACE_CYCLES + state.scroll) * Math.PI * 2) * 0.32 * amplitude;
    }
    var s = (1 - ratio) * TRACE_CYCLES;
    var wave = 0;
    for (var p = 0; p < state.packets.length; p++) {
      var packet = state.packets[p];
      var phase = packet.age - s;
      if (phase < 0 || phase >= (packet.double ? PACKET_SPAN_DOUBLE : PACKET_SPAN_CLINICAL)) continue;
      wave += packet.amp * packetAmpValue(packet, phase);
    }
    return wave * amplitude;
  }

  function traceJitter(ratio) {
    return Math.sin(state.time * 1.15 + ratio * 23) * (0.012 + state.smoothEnergy * 0.03)
      + (Math.random() - 0.5) * 0.016 * (0.3 + state.smoothEnergy + state.smoothTreble * 0.4);
  }

  function updateTrace(params, pulse, fx) {
    if (!state.traceGeometry) return;
    var positions = state.traceGeometry.attributes.position.array;
    var particlePositions = state.tracePointGeometry.attributes.position.array;
    var xMin = -6.92, width = 13.84;
    var baseY = -2.20;
    var pointIndex = 0;
    var amplitudeBase = 1.0 + pulse * (0.30 + params.beatResponse * 0.26) + state.smoothBass * params.beatResponse * 0.16;
    var mode = /^(clinical|sine|double)$/.test(String(fx && fx.heartPulseWaveform)) ? fx.heartPulseWaveform : 'clinical';
    state.waveformMode = mode;
    for (var i = 0; i < TRACE_POINTS; i++) {
      var ratio = i / (TRACE_POINTS - 1);
      var x = xMin + width * ratio;
      // 幅度沿屏幕/时间连续起伏：中频波 + 高频微颤，让波形每一帧都在变
      var amplitude = amplitudeBase * (
        0.86
        + 0.14 * Math.sin(ratio * 13.7 - state.time * 3.1)
        + state.smoothMid * 0.2 * Math.sin(ratio * 23 + state.time * 6.3)
        + state.smoothTreble * 0.12 * Math.sin(ratio * 41 - state.time * 9.7)
      );
      var y = baseY + waveformAt(ratio, mode, amplitude) + traceJitter(ratio);
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = 0;
      if (i % TRACE_PARTICLE_STEP === 0 && pointIndex * 3 < particlePositions.length) {
        particlePositions[pointIndex * 3] = x;
        particlePositions[pointIndex * 3 + 1] = y;
        particlePositions[pointIndex * 3 + 2] = 0.035;
        pointIndex++;
      }
    }
    state.traceGeometry.attributes.position.needsUpdate = true;
    state.tracePointGeometry.attributes.position.needsUpdate = true;

    // 扫描头固定在右缘"笔尖"：新波包在此写入，随后随波形向左流动
    state.scanHead.position.set(
      xMin + width - 0.035,
      baseY + waveformAt(1, mode, amplitude) + traceJitter(1),
      0.10
    );
  }

  // 每帧调用，用模块级白色避免重复 new THREE.Color 造成 GC 压力
  var scratchWhite = new THREE.Color(1, 1, 1);

  function updateColors(params) {
    if (state.gridMinor) {
      state.gridMinor.material.color.copy(params.glow);
      state.gridMajor.material.color.copy(params.glow).lerp(params.line, 0.18);
    }
    if (state.traceCore) state.traceCore.material.color.copy(params.line).lerp(scratchWhite, 0.24);
    if (state.traceGlow) state.traceGlow.material.color.copy(params.line).lerp(params.glow, 0.38);
    if (state.tracePoints) state.tracePoints.material.color.copy(params.glow).lerp(params.line, 0.26);
    if (state.scanHead) state.scanHead.material.color.copy(params.line).lerp(scratchWhite, 0.24);
    refreshHeartParticleColors(params);
    if (state.heartHalo) state.heartHalo.material.color.copy(params.glow).lerp(params.heart, 0.42);
    state.pulseRings.forEach(function (ring, index) {
      ring.material.color.copy(index % 2 ? params.glow : params.heart).lerp(scratchWhite, 0.18);
    });
  }

  function updatePulseRings(params, dt, pulse) {
    state.pulseRings.forEach(function (ring, index) {
      ring.userData.progress += dt * (0.46 + params.speed * 0.24);
      var progress = ring.userData.progress;
      if (progress < 0 || progress > 1) {
        ring.material.opacity = 0;
        return;
      }
      var scale = 0.72 + progress * (2.9 + params.beatResponse * 0.45);
      ring.scale.set(scale, scale, 1);
      ring.material.opacity = Math.max(0, (1 - progress) * (0.30 + pulse * 0.26) * params.glowStrength * state.opacity);
      ring.rotation.z = state.time * 0.12 * (index % 2 ? -1 : 1);
    });
  }

  function update(dt, context) {
    context = context || {};
    var fx = context.fx || {};
    var active = isActive(fx);
    state.opacity += ((active ? 1 : 0) - state.opacity) * Math.min(1, dt * (active ? 3.8 : 4.8));
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
    state.smoothEnergy += (energy - state.smoothEnergy) * Math.min(1, dt * 6);
    state.smoothBeat += (beat - state.smoothBeat) * Math.min(1, dt * 18);
    state.smoothBeat *= Math.max(0, 1 - dt * 2.5);
    state.heartKick *= Math.max(0, 1 - dt * 3.5);
    state.colorFlashHeart = Math.max(0, state.colorFlashHeart - dt * 1.5);
    state.colorFlashLine = Math.max(0, state.colorFlashLine - dt * 1.5);
    state.colorFlashGlow = Math.max(0, state.colorFlashGlow - dt * 1.5);
    state.time += dt;
    // 正弦模式用较缓的视觉滚动；波包漂移按真实监护仪校准：默认档一个 PQRST ≈ 0.6s
    var scrollRate = 0.19 + params.speed * 0.29;
    var travelRate = 0.62 + params.speed * 1.05;
    state.scroll += dt * scrollRate;
    state.bpm += (state.bpmTarget - state.bpm) * Math.min(1, dt * 1.6);
    for (var packetIndex = state.packets.length - 1; packetIndex >= 0; packetIndex--) {
      var packet = state.packets[packetIndex];
      packet.age += dt * travelRate;
      if (packet.age > TRACE_CYCLES + PACKET_SPAN_DOUBLE) state.packets.splice(packetIndex, 1);
    }

    // 主拍 = 上升沿 + 不应期：beatPulse 按指数衰减（拖尾可停留 1 秒以上），
    // 靠"下穿低阈值复位"会把检出率压到 ~60BPM，必须检测快速上升的新拍
    var beatRise = beat - (state.prevBeat == null ? beat : state.prevBeat);
    state.prevBeat = beat;
    if (beat > 0.2 && beatRise > 0.04 && state.time - state.lastMainBeatAt > 0.24) {
      triggerHeartbeat(clamp(0.3 + bass * 0.45 + energy * 0.25 + beat * 0.4, 0.35, 1.4));
      state.lastMainBeatAt = state.time;
      state.nextIdleBeatAt = state.time + 0.84;
    }
    // 低音瞬态轻拍：主拍之间补小波包，让心电图随音乐持续起伏
    var bassRise = bass - (state.prevBass == null ? bass : state.prevBass);
    state.prevBass = bass;
    if (bass > 0.3 && bassRise > 0.05 && state.time - state.lastMiniBeatAt > 0.18 && state.smoothEnergy > 0.1) {
      triggerHeartbeat(clamp(0.2 + bass * 0.55, 0.3, 0.85), { mini: true });
      state.lastMiniBeatAt = state.time;
    }
    if (state.time >= state.nextIdleBeatAt && state.smoothEnergy < 0.12) {
      triggerHeartbeat(0.15);
      state.nextIdleBeatAt = state.time + IDLE_BEAT_INTERVAL;
    }

    var pulse = clamp(state.heartKick * params.beatResponse + state.smoothBeat * 0.56 + state.smoothBass * 0.14, 0, 1.7);
    bindVisualRotation(context);
    state.root.rotation.x = state.boundRotX;
    state.root.rotation.y = state.boundRotY;
    state.root.visible = state.opacity > 0.01;
    updateColors(params);
    updateTrace(params, pulse, fx);

    state.gridMinor.material.opacity = state.opacity * params.grid * (0.042 + state.smoothEnergy * 0.025);
    state.gridMajor.material.opacity = state.opacity * params.grid * (0.10 + state.smoothEnergy * 0.05);
    state.traceCore.material.opacity = Math.min(1.25, state.opacity * clamp(0.64 + pulse * 0.28, 0, 1) * params.glowStrength * (1 + state.colorFlashLine * 0.6));
    state.traceGlow.material.opacity = Math.min(1, state.opacity * (0.14 + pulse * 0.16) * params.glowStrength * (1 + state.colorFlashGlow * 0.7));
    state.tracePoints.material.opacity = state.opacity * (0.24 + pulse * 0.24) * params.trail;
    state.tracePoints.material.size = 0.050 + pulse * 0.035 + params.trail * 0.016;
    state.scanHead.material.opacity = state.opacity * (0.32 + pulse * 0.38) * params.glowStrength;
    state.scanHead.scale.setScalar(0.32 + pulse * 0.24 + params.trail * 0.16);

    // 3D 粒子爱心：粒子径向心跳推挤 + 持续缓慢自转（立体读感）+ 亮度涌现 + 火星
    state.beatClock += dt;
    state.heartIntroClock += dt;
    var beatEnv = heartBeatEnvelope(state.beatClock);
    var breathing = 0.5 + 0.5 * Math.sin(state.time * (1.45 + params.speed * 0.28));
    var heartScale = 1 + beatEnv * (0.07 + 0.08 * params.beatResponse) + (breathing - 0.5) * 0.04;
    state.heartGroup.scale.set(heartScale, heartScale, heartScale);
    // 缓慢连续自转：枕形厚度持续侧面示人
    state.heartGroup.rotation.y = (state.heartGroup.rotation.y + dt * 0.22) % (Math.PI * 2);
    state.heartGroup.rotation.z = Math.sin(state.time * 0.65) * 0.045;
    updateHeartParticles(beatEnv, dt);
    state.heartParticles.material.opacity = Math.min(1.25, state.opacity * Math.min(1, 0.85 + beatEnv * 0.4) * params.glowStrength * (1 + state.colorFlashHeart * 0.6));
    state.heartParticles.material.size = 0.07 * (1 + beatEnv * 0.25);
    state.heartHalo.material.opacity = state.opacity * (0.2 + beatEnv * 0.4 + state.smoothEnergy * 0.1) * params.glowStrength;
    state.heartHalo.scale.setScalar(3.0 + beatEnv * 1.55);
    updateHeartSparks(dt, params, state.opacity);
    updatePulseRings(params, dt, pulse);
    updateMonitorLabel(fx, params);
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

  function updateHeartPulseColorControls() {
    COLOR_CONTROLS.forEach(function (control) {
      var fallback = fxDefaults[control.key] || '#ffffff';
      var color = normalizeColor(fx && fx[control.key], fallback);
      var picker = document.getElementById(control.picker);
      var value = document.getElementById(control.value);
      if (picker) {
        // 取色器现在是按钮：value 兼容旧 input，背景色块实时反映当前颜色
        picker.value = color;
        picker.style.background = color;
      }
      if (value) value.textContent = color.toUpperCase();
    });
  }

  // 换色时让被改的元素闪亮一下，用户能立刻看到改的是哪个部分
  function flashColorTarget(key) {
    if (key === 'heartPulseHeartColor') state.colorFlashHeart = 1;
    else if (key === 'heartPulseLineColor') state.colorFlashLine = 1;
    else state.colorFlashGlow = 1;
  }

  function setHeartPulseColor(key, color, silent) {
    var control = COLOR_CONTROLS.find(function (item) { return item.key === key || item.picker === key; });
    if (!control) return;
    fx[control.key] = normalizeColor(color, fxDefaults[control.key]);
    flashColorTarget(control.key);
    updateHeartPulseColorControls();
    saveLyricLayout({ user: true, reason: control.key });
    if (!silent) showToast(control.label + ': ' + fx[control.key].toUpperCase());
  }

  function resetHeartPulseColor(key) {
    var control = COLOR_CONTROLS.find(function (item) { return item.key === key || item.picker === key; });
    if (!control) return;
    fx[control.key] = normalizeColor(fxDefaults[control.key], '#ffffff');
    flashColorTarget(control.key);
    updateHeartPulseColorControls();
    saveLyricLayout({ user: true, reason: control.key });
    showToast(control.label + '已恢复默认');
  }

  function setHeartPulseWaveform(mode, silent) {
    mode = /^(clinical|sine|double)$/.test(mode) ? mode : 'clinical';
    fx.heartPulseWaveform = mode;
    document.querySelectorAll('#heart-pulse-waveform-seg button').forEach(function (button) {
      button.classList.toggle('active', button.getAttribute('data-heart-pulse-wave') === mode);
    });
    if (!silent) saveLyricLayout({ user: true, reason: 'heartPulseWaveform' });
    if (!silent) showToast('心电波形: ' + mode);
  }

  function updateHeartPulseContentControls() {
    var title = document.getElementById('fx-heartpulsetitle');
    var subtitle = document.getElementById('fx-heartpulsesubtitle');
    var status = document.getElementById('fx-heartpulsestatus');
    if (title) title.value = fx.heartPulseTitle == null ? fxDefaults.heartPulseTitle : fx.heartPulseTitle;
    if (subtitle) subtitle.value = fx.heartPulseSubtitle == null ? fxDefaults.heartPulseSubtitle : fx.heartPulseSubtitle;
    if (status) status.value = fx.heartPulseStatus == null ? fxDefaults.heartPulseStatus : fx.heartPulseStatus;
    setHeartPulseWaveform(fx.heartPulseWaveform, true);
  }

  // --- 取色面板：按钮内联 onclick 触发 + 面板内全内联事件，
  //     不经过任何 addEventListener 绑定链，与快捷色块同一条已验证路径 ---
  var pickerPanel = null;
  var pickerPanelState = { key: '', hue: 0, sat: 1, val: 0.8, dragging: '' };

  function hsvToRgbHex(h, s, v) {
    var f = (h % 360) / 60;
    var i = Math.floor(f);
    var x = v * (1 - s);
    var y = v * (1 - s * (f - i));
    var z = v * (1 - s * (1 - (f - i)));
    var r, g, b;
    if (i === 0) { r = v; g = z; b = x; }
    else if (i === 1) { r = y; g = v; b = x; }
    else if (i === 2) { r = x; g = v; b = z; }
    else if (i === 3) { r = x; g = y; b = v; }
    else if (i === 4) { r = z; g = x; b = v; }
    else { r = v; g = x; b = y; }
    var c = function (n) { return ('0' + Math.round(clamp(n, 0, 1) * 255).toString(16)).slice(-2); };
    return '#' + c(r) + c(g) + c(b);
  }

  function hexToHsv(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return { h: 0, s: 1, v: 1 };
    var n = parseInt(m[1], 16);
    var r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var d = max - min;
    var h = 0;
    if (d > 0.0001) {
      if (max === r) h = 60 * (((g - b) / d) % 6);
      else if (max === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
    }
    if (h < 0) h += 360;
    return { h: h, s: max > 0 ? d / max : 0, v: max };
  }

  function heartPickerRefs() {
    return {
      panel: document.getElementById('heart-picker-panel'),
      sv: document.getElementById('heart-picker-sv'),
      svCursor: document.getElementById('heart-picker-sv-cursor'),
      hue: document.getElementById('heart-picker-hue'),
      hueCursor: document.getElementById('heart-picker-hue-cursor'),
      hex: document.getElementById('heart-picker-hex'),
      preview: document.getElementById('heart-picker-preview')
    };
  }

  function heartPickerUpdateUI(hex) {
    var refs = heartPickerRefs();
    if (!refs.panel) return;
    refs.sv.style.backgroundColor = hsvToRgbHex(pickerPanelState.hue, 1, 1);
    refs.svCursor.style.left = (pickerPanelState.sat * 100) + '%';
    refs.svCursor.style.top = ((1 - pickerPanelState.val) * 100) + '%';
    refs.hueCursor.style.left = (pickerPanelState.hue / 360 * 100) + '%';
    if (document.activeElement !== refs.hex) refs.hex.value = hex.toUpperCase();
    refs.preview.style.backgroundColor = hex;
  }

  function heartPickerApply(silent) {
    var hex = hsvToRgbHex(pickerPanelState.hue, pickerPanelState.sat, pickerPanelState.val);
    if (pickerPanelState.set) pickerPanelState.set(hex, silent);
    heartPickerUpdateUI(hex);
  }

  function heartPickerHandlePoint(e) {
    var refs = heartPickerRefs();
    if (pickerPanelState.dragging === 'sv') {
      var svRect = refs.sv.getBoundingClientRect();
      pickerPanelState.sat = clamp((e.clientX - svRect.left) / Math.max(1, svRect.width), 0, 1);
      pickerPanelState.val = 1 - clamp((e.clientY - svRect.top) / Math.max(1, svRect.height), 0, 1);
    } else {
      var hueRect = refs.hue.getBoundingClientRect();
      pickerPanelState.hue = clamp((e.clientX - hueRect.left) / Math.max(1, hueRect.width), 0, 1) * 360;
    }
    heartPickerApply(true);
  }

  function heartPickerDragStart(e, mode) {
    pickerPanelState.dragging = mode;
    heartPickerHandlePoint(e);
    if (e.preventDefault) e.preventDefault();
  }

  function heartPickerDragMove(e) {
    if (!pickerPanelState.dragging) return;
    heartPickerHandlePoint(e);
  }

  function heartPickerDragEnd() {
    if (!pickerPanelState.dragging) return;
    pickerPanelState.dragging = '';
    heartPickerApply(false);
  }

  function heartPickerHexChange(value) {
    value = String(value || '').trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(value)) return;
    var hsv = hexToHsv(value);
    pickerPanelState.hue = hsv.h;
    pickerPanelState.sat = hsv.s < 0.02 ? 0.02 : hsv.s;
    pickerPanelState.val = hsv.v < 0.05 ? 0.6 : hsv.v;
    heartPickerApply(false);
  }

  function buildHeartPickerPanel() {
    if (document.getElementById('heart-picker-panel')) return;
    var panel = document.createElement('div');
    panel.id = 'heart-picker-panel';
    panel.className = 'heart-picker-panel';
    panel.innerHTML =
      '<div class="heart-picker-sv" id="heart-picker-sv" onpointerdown="heartPickerDragStart(event,\'sv\')">' +
      '<div class="heart-picker-sv-cursor" id="heart-picker-sv-cursor"></div></div>' +
      '<div class="heart-picker-hue" id="heart-picker-hue" onpointerdown="heartPickerDragStart(event,\'hue\')">' +
      '<div class="heart-picker-hue-cursor" id="heart-picker-hue-cursor"></div></div>' +
      '<div class="heart-picker-row">' +
      '<div class="heart-picker-preview" id="heart-picker-preview"></div>' +
      '<input id="heart-picker-hex" class="heart-picker-hex" type="text" maxlength="7" spellcheck="false" onchange="heartPickerHexChange(this.value)">' +
      '<button class="fx-mini-btn ghost" type="button" onclick="closeHeartPickerPanel()">完成</button>' +
      '</div>';
    document.body.appendChild(panel);
    window.addEventListener('pointermove', heartPickerDragMove);
    window.addEventListener('pointerup', heartPickerDragEnd);
  }

  function openColorPanelWith(key, anchorEl, current, setValue) {
    buildHeartPickerPanel();
    var refs = heartPickerRefs();
    pickerPanelState.key = key;
    pickerPanelState.set = setValue;
    var hsv = hexToHsv(current);
    pickerPanelState.hue = hsv.h;
    pickerPanelState.sat = hsv.s < 0.02 ? 0.02 : hsv.s;
    pickerPanelState.val = hsv.v < 0.05 ? 0.6 : hsv.v;
    pickerPanel = refs.panel;
    pickerPanel.classList.add('open');
    var rect = anchorEl.getBoundingClientRect();
    var panelW = 244, panelH = 272;
    var left = clamp(rect.left, 8, Math.max(8, window.innerWidth - panelW - 8));
    var top = rect.bottom + 8;
    if (top + panelH > window.innerHeight - 8) top = Math.max(8, rect.top - panelH - 8);
    pickerPanel.style.left = left + 'px';
    pickerPanel.style.top = top + 'px';
    heartPickerUpdateUI(current);
  }

  function openHeartPickerPanel(key, anchorEl) {
    var control = null;
    for (var i = 0; i < COLOR_CONTROLS.length; i++) {
      if (COLOR_CONTROLS[i].key === key) { control = COLOR_CONTROLS[i]; break; }
    }
    if (!control) return;
    openColorPanelWith(control.key, anchorEl, normalizeColor(fx && fx[control.key], fxDefaults[control.key]), function (hex, silent) {
      setHeartPulseColor(control.key, hex, silent);
    });
  }

  // 通用入口：任意预设可用同一取色面板（几何能量核心等共用）
  function openMOMusicColorPicker(key, anchorEl, getValue, setValue) {
    var current = normalizeColor(getValue ? getValue() : '#ffffff', '#ffffff');
    openColorPanelWith(key, anchorEl, current, setValue || null);
  }

  function closeHeartPickerPanel() {
    if (!pickerPanel) return;
    pickerPanel.classList.remove('open');
    pickerPanel = null;
  }

  global.openHeartPickerPanel = openHeartPickerPanel;
  global.openMOMusicColorPicker = openMOMusicColorPicker;
  global.closeHeartPickerPanel = closeHeartPickerPanel;
  global.heartPickerDragStart = heartPickerDragStart;
  global.heartPickerHexChange = heartPickerHexChange;

  // --- 控件绑定：document 级事件委托 ---
  // 不依赖 bindFxPanel 的执行链（上游任何异常都会让后续绑定静默丢失），
  // 且元素被控制台重组/搬移后监听依然有效
  function handleHeartPulsePickerEvent(event) {
    var target = event.target;
    if (!target || !target.id) return;
    var control = null;
    for (var i = 0; i < COLOR_CONTROLS.length; i++) {
      if (COLOR_CONTROLS[i].picker === target.id) { control = COLOR_CONTROLS[i]; break; }
    }
    if (!control) return;
    setHeartPulseColor(control.key, target.value, event.type === 'input');
  }

  var DELEGATED_CONTROLS = {
    'fx-heartpulsespeed': { key: 'heartPulseSpeed', min: 0.35, max: 2.4 },
    'fx-heartpulsebeat': { key: 'heartPulseBeatResponse', min: 0, max: 2 },
    'fx-heartpulseglow': { key: 'heartPulseGlow', min: 0.25, max: 2 },
    'fx-heartpulsegrid': { key: 'heartPulseGrid', min: 0, max: 1 },
    'fx-heartpulsetrail': { key: 'heartPulseTrail', min: 0.15, max: 1.5 },
    'fx-heartpulsetitle': { key: 'heartPulseTitle', text: 28 },
    'fx-heartpulsesubtitle': { key: 'heartPulseSubtitle', text: 36 },
    'fx-heartpulsestatus': { key: 'heartPulseStatus', text: 24 }
  };

  function handleHeartPulseControlEvent(event) {
    var target = event.target;
    if (!target || !target.id) return;
    var spec = DELEGATED_CONTROLS[target.id];
    if (!spec) return;
    if (spec.text) {
      fx[spec.key] = String(target.value || '').slice(0, spec.text);
    } else {
      var value = parseFloat(target.value);
      if (!isFinite(value)) return;
      fx[spec.key] = Math.max(spec.min, Math.min(spec.max, value));
    }
    if (event.type === 'change') saveLyricLayout({ user: true, reason: spec.key });
  }

  function handleHeartPulseDelegatedEvent(event) {
    handleHeartPulsePickerEvent(event);
    handleHeartPulseControlEvent(event);
  }

  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('input', handleHeartPulseDelegatedEvent, false);
    document.addEventListener('change', handleHeartPulseDelegatedEvent, false);
  }

  global.updateHeartPulseColorControls = updateHeartPulseColorControls;
  global.updateHeartPulseContentControls = updateHeartPulseContentControls;
  global.setHeartPulseWaveform = setHeartPulseWaveform;
  global.resetHeartPulseContent = function () {
    fx.heartPulseTitle = fxDefaults.heartPulseTitle;
    fx.heartPulseSubtitle = fxDefaults.heartPulseSubtitle;
    fx.heartPulseStatus = fxDefaults.heartPulseStatus;
    fx.heartPulseShowBpm = fxDefaults.heartPulseShowBpm;
    fx.heartPulseWaveform = fxDefaults.heartPulseWaveform;
    updateHeartPulseContentControls();
    var bpmToggle = document.getElementById('t-heartPulseShowBpm');
    if (bpmToggle) bpmToggle.classList.toggle('on', fx.heartPulseShowBpm !== false);
    saveLyricLayout({ user: true, reason: 'heartPulseContentReset' });
    showToast('监护内容已恢复默认');
  };
  global.setHeartPulseColor = setHeartPulseColor;
  global.resetHeartPulseColor = resetHeartPulseColor;
  global.updateHeartPulseControlVisibility = function () {
    var ids = [
      'fx-heart-pulse-section', 'heart-pulse-color-section', 'heart-pulse-line-row', 'heart-pulse-glow-row', 'heart-pulse-heart-row',
      'fx-heartpulsespeed', 'fx-heartpulsebeat', 'fx-heartpulseglow', 'fx-heartpulsegrid', 'fx-heartpulsetrail', 'fx-heartpulsetitle', 'fx-heartpulsesubtitle', 'fx-heartpulsestatus', 'heart-pulse-waveform-seg', 't-heartPulseShowBpm'
    ];
    var active = typeof HEART_PULSE_PRESET_INDEX !== 'undefined' && Number(fx && fx.preset) === HEART_PULSE_PRESET_INDEX;
    // 控制区放在独立折叠页里，预设未激活时也保持可编辑（与其它预设的隐藏式区块不同）
    if (typeof setFxPanelControlsHidden === 'function') setFxPanelControlsHidden(ids, false);
    // 仅在预设激活时自动展开；用户手动收起/展开的选择不被覆盖
    var fold = document.getElementById('fx-heart-pulse-fold');
    if (fold && active) fold.classList.add('open');
  };

  global.MOMusicHeartPulse = {
    INDEX: INDEX,
    isActive: isActive,
    update: update,
    clear: clearLayer,
    onPresetChange: onPresetChange
  };
})(typeof window !== 'undefined' ? window : globalThis);
