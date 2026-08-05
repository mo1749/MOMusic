/**
 * Golden Core（几何能量核心）visual preset for MOMusic.
 *
 * 画面：金色多面体线框核心（菲涅尔发光 + 白炽中心）、多条椭圆粒子轨道
 * 呈原子结构交错环绕、深空金色星尘背景、暖橙光晕与镜头光斑、呼吸脉动。
 *
 * 自定义参数（fx.goldenCore*）：
 *   goldenCoreGlow       核心发光强度 0.2–2   (默认 1.0)
 *   goldenCoreColor      核心颜色             (默认 #ffc46b)
 *   goldenCoreHaloColor  光晕颜色             (默认 #ff9a3c)
 *   goldenCoreOrbitCount 轨道数量 2–10        (默认 6)
 *   goldenCoreOrbitSize  轨道尺寸 0.5–2       (默认 1.0)
 *   goldenCoreDensity    粒子密度 0.3–2       (默认 1.0)
 *   goldenCoreSpin       旋转速度 0–2         (默认 0.7)
 *   goldenCoreStardust   星尘浓度 0–1.5       (默认 0.9)
 *   goldenCoreBreath     呼吸脉动 0–1         (默认 0.55)
 *
 * 挂载 window.MOMusicGoldenCore，由 11-main-loop.js 每帧驱动 update()。
 */
(function (global) {
  'use strict';

  var INDEX = 9;

  var DEFAULT_GLOW = 1.0;
  var DEFAULT_COLOR = '#ffc46b';
  var DEFAULT_HALO_COLOR = '#ff9a3c';
  var DEFAULT_ORBIT_COUNT = 6;
  var DEFAULT_ORBIT_SIZE = 1.0;
  var DEFAULT_DENSITY = 1.0;
  var DEFAULT_SPIN = 0.7;
  var DEFAULT_STARDUST = 0.9;
  var DEFAULT_BREATH = 0.55;

  var ORBIT_MIN = 2;
  var ORBIT_MAX = 10;
  var ORBIT_BASE_RADIUS = 2.35;   // 最内圈轨道半径
  var ORBIT_RADIUS_STEP = 0.46;   // 每圈递增
  var CORE_RADIUS = 1.5;

  var state = {
    root: null,
    coreGroup: null,
    coreSolid: null,
    coreSolidMat: null,
    coreWireInner: null,
    coreWireOuter: null,
    haloSprite: null,
    coreGlowSprite: null,
    streakSprite: null,
    orbitGroup: null,
    orbits: [],          // { pivot, points, mat, speed, dir }
    stardust: null,
    stardustMat: null,
    scene: null,
    opacity: 0,
    initialized: false,
    settingsKey: '',
    colorKey: '',
    time: 0,
    breathPhase: 0,
    smoothBass: 0,
    smoothEnergy: 0,
    boundRotX: 0,
    boundRotY: 0
  };

  // ─────────────────────── 工具 ───────────────────────

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function fxNum(fx, key, fallback, min, max) {
    var v = fx && fx[key] != null ? Number(fx[key]) : fallback;
    if (!Number.isFinite(v)) v = fallback;
    return clamp(v, min, max);
  }

  function hexToVec3(hex, fallback) {
    var h = typeof hex === 'string' ? hex.replace('#', '') : '';
    if (!/^[0-9a-fA-F]{6}$/.test(h)) h = (fallback || '#ffffff').replace('#', '');
    return new THREE.Color(
      parseInt(h.slice(0, 2), 16) / 255,
      parseInt(h.slice(2, 4), 16) / 255,
      parseInt(h.slice(4, 6), 16) / 255
    );
  }

  /** 生成径向渐变发光贴图 */
  function makeGlowTexture(size, stops) {
    var canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext('2d');
    var g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    var tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  /** 横向镜头光斑贴图 */
  function makeStreakTexture() {
    var w = 256, h = 32;
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    var g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(255,190,110,0)');
    g.addColorStop(0.5, 'rgba(255,230,190,0.9)');
    g.addColorStop(1, 'rgba(255,190,110,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // 垂直方向羽化
    var gv = ctx.createLinearGradient(0, 0, 0, h);
    gv.addColorStop(0, 'rgba(0,0,0,1)');
    gv.addColorStop(0.5, 'rgba(0,0,0,0)');
    gv.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = gv;
    ctx.fillRect(0, 0, w, h);
    var tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  function rgba(hex, a) {
    var h = hex.replace('#', '');
    var r = parseInt(h.slice(0, 2), 16);
    var g = parseInt(h.slice(2, 4), 16);
    var b = parseInt(h.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  // ─────────────────── 着色器 ───────────────────

  var CORE_VERT = [
    'varying vec3 vN;',
    'varying vec3 vV;',
    'void main() {',
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
    '  vN = normalize(normalMatrix * normal);',
    '  vV = -mv.xyz;',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  var CORE_FRAG = [
    'uniform vec3 uColor;',
    'uniform vec3 uHalo;',
    'uniform float uGlow;',
    'uniform float uPulse;',
    'uniform float uOpacity;',
    'varying vec3 vN;',
    'varying vec3 vV;',
    'void main() {',
    '  float fr = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.9);',
    '  vec3 col = mix(uColor * 0.35, uHalo, fr) * (0.5 + fr * 1.9) * uGlow * uPulse;',
    '  col += vec3(1.0, 0.97, 0.88) * pow(fr, 5.0) * 1.1 * uGlow * uPulse;',
    '  float a = (0.10 + fr * 0.9) * uOpacity;',
    '  gl_FragColor = vec4(col * a, a);',
    '}'
  ].join('\n');

  // 轨道粒子：位置在 shader 内由角度计算，uFlow 驱动沿轨道流动
  var ORBIT_VERT = [
    'attribute float aRand;',
    'uniform float uTime;',
    'uniform float uFlow;',
    'uniform float uRx;',
    'uniform float uRz;',
    'uniform float uSize;',
    'uniform float uPixelRatio;',
    'varying float vTw;',
    'void main() {',
    '  float a = aRand * 6.28318 + uFlow;',
    '  vec3 p = vec3(cos(a) * uRx, 0.0, sin(a) * uRz);',
    '  float j = sin(aRand * 91.0 + uTime * 0.7) * 0.022;',
    '  p.xz *= (1.0 + j);',
    '  p.y += (aRand - 0.5) * 0.05;',
    '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
    '  float tw = 0.60 + 0.40 * sin(uTime * (1.7 + aRand * 2.6) + aRand * 43.0);',
    '  vTw = tw;',
    '  gl_PointSize = uSize * uPixelRatio * tw * (160.0 / max(0.1, -mv.z));',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  var POINT_FRAG = [
    'uniform vec3 uColor;',
    'uniform float uOpacity;',
    'uniform float uBright;',
    'varying float vTw;',
    'void main() {',
    '  vec2 uv = gl_PointCoord - 0.5;',
    '  float d = length(uv) * 2.0;',
    '  if (d > 1.0) discard;',
    '  float a = smoothstep(1.0, 0.12, d);',
    '  float core = smoothstep(0.42, 0.0, d);',
    '  vec3 col = mix(uColor, vec3(1.0, 0.98, 0.92), core * 0.85);',
    '  gl_FragColor = vec4(col * (0.55 + 0.45 * vTw) * uBright, a * uOpacity * (0.42 + 0.58 * vTw));',
    '}'
  ].join('\n');

  // 轨道环绕粒子：围绕轨道线做管状环绕流动（螺旋缠线效果）
  var HALO_VERT = [
    'attribute float aRand;',
    'attribute float aRand2;',
    'uniform float uTime;',
    'uniform float uFlow;',
    'uniform float uRx;',
    'uniform float uRz;',
    'uniform float uSize;',
    'uniform float uPixelRatio;',
    'varying float vTw;',
    'void main() {',
    '  float a = aRand * 6.28318 + uFlow;',
    '  vec3 base = vec3(cos(a) * uRx, 0.0, sin(a) * uRz);',
    '  vec3 radial = normalize(vec3(cos(a), 0.0, sin(a)));',
    '  float b = aRand2 * 6.28318 + uTime * (0.9 + aRand * 1.6);',
    '  float tube = 0.05 + aRand2 * 0.13;',
    '  vec3 p = base + radial * cos(b) * tube + vec3(0.0, 1.0, 0.0) * sin(b) * tube;',
    '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
    '  float tw = 0.45 + 0.55 * sin(uTime * (2.1 + aRand2 * 3.2) + aRand * 57.0);',
    '  vTw = tw;',
    '  gl_PointSize = uSize * uPixelRatio * (0.5 + 0.5 * tw) * (160.0 / max(0.1, -mv.z));',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  // 星尘：静态球壳位置 + 闪烁 + 缓慢漂移
  var DUST_VERT = [
    'attribute float aRand;',
    'uniform float uTime;',
    'uniform float uSize;',
    'uniform float uPixelRatio;',
    'varying float vTw;',
    'void main() {',
    '  vec3 p = position;',
    '  p.x += sin(uTime * 0.10 + aRand * 31.0) * 0.35;',
    '  p.y += cos(uTime * 0.08 + aRand * 47.0) * 0.35;',
    '  p.z += sin(uTime * 0.06 + aRand * 13.0) * 0.30;',
    '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
    '  float tw = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * (0.5 + aRand * 1.4) + aRand * 25.0), 3.0);',
    '  vTw = tw;',
    '  gl_PointSize = uSize * uPixelRatio * (0.55 + aRand * 0.9) * tw * (150.0 / max(0.1, -mv.z));',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  // ─────────────────── 参数读取 ───────────────────

  function readParams(fx) {
    return {
      glow: fxNum(fx, 'goldenCoreGlow', DEFAULT_GLOW, 0.2, 2),
      color: hexToVec3(fx && fx.goldenCoreColor, DEFAULT_COLOR),
      halo: hexToVec3(fx && fx.goldenCoreHaloColor, DEFAULT_HALO_COLOR),
      orbitCount: Math.round(fxNum(fx, 'goldenCoreOrbitCount', DEFAULT_ORBIT_COUNT, ORBIT_MIN, ORBIT_MAX)),
      orbitSize: fxNum(fx, 'goldenCoreOrbitSize', DEFAULT_ORBIT_SIZE, 0.5, 2),
      density: fxNum(fx, 'goldenCoreDensity', DEFAULT_DENSITY, 0.3, 2),
      spin: fxNum(fx, 'goldenCoreSpin', DEFAULT_SPIN, 0, 2),
      stardust: fxNum(fx, 'goldenCoreStardust', DEFAULT_STARDUST, 0, 1.5),
      breath: fxNum(fx, 'goldenCoreBreath', DEFAULT_BREATH, 0, 1)
    };
  }

  /** 结构参数指纹：变化时才重建几何 */
  function settingsKeyOf(p) {
    return [p.orbitCount, Math.round(p.orbitSize * 20), Math.round(p.density * 20), Math.round(p.stardust * 20)].join('|');
  }

  /** 颜色指纹：变化时仅重生发光贴图（不动几何） */
  function colorKeyOf(p) {
    return p.color.getHexString() + '|' + p.halo.getHexString();
  }

  /** 重生核心高光与大光晕贴图（响应颜色调节） */
  function refreshSpriteTextures(p) {
    if (!state.coreGlowSprite || !state.haloSprite) return;
    var glowTex = makeGlowTexture(128, [
      [0, 'rgba(255,255,250,1)'],
      [0.25, rgba('#' + p.color.getHexString(), 0.55)],
      [0.6, rgba('#' + p.halo.getHexString(), 0.16)],
      [1, 'rgba(255,150,60,0)']
    ]);
    var haloTex = makeGlowTexture(256, [
      [0, rgba('#' + p.color.getHexString(), 0.5)],
      [0.3, rgba('#' + p.halo.getHexString(), 0.22)],
      [0.65, rgba('#' + p.halo.getHexString(), 0.06)],
      [1, 'rgba(255,140,50,0)']
    ]);
    if (state.coreGlowSprite.material.map) state.coreGlowSprite.material.map.dispose();
    if (state.haloSprite.material.map) state.haloSprite.material.map.dispose();
    state.coreGlowSprite.material.map = glowTex;
    state.haloSprite.material.map = haloTex;
    state.coreGlowSprite.material.needsUpdate = true;
    state.haloSprite.material.needsUpdate = true;
  }

  // ─────────────────── 场景构建 ───────────────────

  function buildCore(p) {
    var group = new THREE.Group();

    // 实体内核（菲涅尔发光）
    state.coreSolidMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: p.color.clone() },
        uHalo: { value: p.halo.clone() },
        uGlow: { value: p.glow },
        uPulse: { value: 1 },
        uOpacity: { value: 0 }
      },
      vertexShader: CORE_VERT,
      fragmentShader: CORE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    state.coreSolid = new THREE.Mesh(new THREE.IcosahedronGeometry(CORE_RADIUS, 2), state.coreSolidMat);
    state.coreSolid.frustumCulled = false;
    group.add(state.coreSolid);

    // 内层线框（细密，亮金白）
    var wireInnerGeo = new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(CORE_RADIUS * 1.01, 2));
    state.coreWireInner = new THREE.LineSegments(wireInnerGeo, new THREE.LineBasicMaterial({
      color: p.color.clone().lerp(new THREE.Color(1, 0.98, 0.9), 0.55),
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    state.coreWireInner.frustumCulled = false;
    group.add(state.coreWireInner);

    // 外层线框（稍大略疏，暖橙，反向慢转）
    var wireOuterGeo = new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(CORE_RADIUS * 1.14, 1));
    state.coreWireOuter = new THREE.LineSegments(wireOuterGeo, new THREE.LineBasicMaterial({
      color: p.halo.clone(),
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    state.coreWireOuter.frustumCulled = false;
    group.add(state.coreWireOuter);

    // 白炽中心高光
    var glowTex = makeGlowTexture(128, [
      [0, 'rgba(255,255,250,1)'],
      [0.25, rgba('#' + p.color.getHexString(), 0.55)],
      [0.6, rgba('#' + p.halo.getHexString(), 0.16)],
      [1, 'rgba(255,150,60,0)']
    ]);
    state.coreGlowSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending
    }));
    state.coreGlowSprite.scale.setScalar(2.1);
    state.coreGlowSprite.renderOrder = 5;
    group.add(state.coreGlowSprite);

    return group;
  }

  function buildOrbits(p) {
    var group = new THREE.Group();
    state.orbits = [];
    var n = p.orbitCount;
    var perOrbit = Math.round(clamp(320 * p.density, 80, 780));

    for (var i = 0; i < n; i++) {
      var fr = n === 1 ? 0.5 : i / (n - 1);
      var radius = (ORBIT_BASE_RADIUS + i * ORBIT_RADIUS_STEP) * p.orbitSize;
      var ecc = 0.62 + 0.22 * Math.abs(Math.sin(i * 2.39));   // 椭圆扁率
      var rx = radius;
      var rz = radius * ecc;

      var count = perOrbit;
      var rands = new Float32Array(count);
      var positions = new Float32Array(count * 3); // 占位，实际位置在 shader 内由角度算出
      for (var k = 0; k < count; k++) rands[k] = k / count + (Math.sin(k * 12.9898) * 0.5) / count;

      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('aRand', new THREE.BufferAttribute(rands, 1));

      var mat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uFlow: { value: Math.random() * 6.283 },
          uRx: { value: rx },
          uRz: { value: rz },
          uSize: { value: 0.62 },
          uPixelRatio: { value: 1 },
          uColor: { value: p.color.clone().lerp(new THREE.Color(1, 1, 1), 0.12) },
          uOpacity: { value: 0 },
          uBright: { value: 1.4 }
        },
        vertexShader: ORBIT_VERT,
        fragmentShader: POINT_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });

      var points = new THREE.Points(geo, mat);
      points.frustumCulled = false;

      // 环绕轨道线的缠线粒子（管状螺旋分布，沿轨道缓慢流动）
      var haloCount = Math.round(count * 0.7);
      var haloRands = new Float32Array(haloCount);
      var haloRands2 = new Float32Array(haloCount);
      var haloPositions = new Float32Array(haloCount * 3);
      for (var h = 0; h < haloCount; h++) {
        haloRands[h] = Math.random();
        haloRands2[h] = Math.random();
      }
      var haloGeo = new THREE.BufferGeometry();
      haloGeo.setAttribute('position', new THREE.BufferAttribute(haloPositions, 3));
      haloGeo.setAttribute('aRand', new THREE.BufferAttribute(haloRands, 1));
      haloGeo.setAttribute('aRand2', new THREE.BufferAttribute(haloRands2, 1));

      var haloMat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uFlow: { value: Math.random() * 6.283 },
          uRx: { value: rx },
          uRz: { value: rz },
          uSize: { value: 0.42 },
          uPixelRatio: { value: 1 },
          uColor: { value: p.color.clone().lerp(new THREE.Color(1, 1, 1), 0.3) },
          uOpacity: { value: 0 },
          uBright: { value: 1.15 }
        },
        vertexShader: HALO_VERT,
        fragmentShader: POINT_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });

      var haloPoints = new THREE.Points(haloGeo, haloMat);
      haloPoints.frustumCulled = false;

      // 原子结构式交错倾角
      var pivot = new THREE.Group();
      pivot.rotation.x = -0.95 + 1.9 * fr + Math.sin(i * 5.13) * 0.28;
      pivot.rotation.z = Math.sin(i * 3.71) * 0.55;
      pivot.rotation.y = i * 0.7;
      pivot.add(points);
      pivot.add(haloPoints);
      group.add(pivot);

      state.orbits.push({
        pivot: pivot,
        points: points,
        mat: mat,
        haloPoints: haloPoints,
        haloMat: haloMat,
        dir: i % 2 === 0 ? 1 : -1,
        flowSpeed: 0.55 + 0.45 * Math.abs(Math.sin(i * 1.97)),
        wobblePhase: i * 1.31
      });
    }
    return group;
  }

  function buildStardust(p) {
    var count = Math.round(clamp(1500 * p.stardust, 0, 2600));
    if (count <= 0) return null;

    var positions = new Float32Array(count * 3);
    var rands = new Float32Array(count);
    for (var i = 0; i < count; i++) {
      // 球壳分布 7~26，偏外层
      var r = 7 + Math.pow(Math.random(), 0.72) * 19;
      var theta = Math.random() * Math.PI * 2;
      var phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi) * 0.72;
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      rands[i] = Math.random();
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aRand', new THREE.BufferAttribute(rands, 1));

    state.stardustMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: 0.85 },
        uPixelRatio: { value: 1 },
        uColor: { value: p.color.clone().lerp(new THREE.Color(1, 1, 1), 0.3) },
        uOpacity: { value: 0 },
        uBright: { value: 1.0 }
      },
      vertexShader: DUST_VERT,
      fragmentShader: POINT_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    var points = new THREE.Points(geo, state.stardustMat);
    points.frustumCulled = false;
    return points;
  }

  function buildSprites(p) {
    // 大光晕（暖橙体积光感）
    var haloTex = makeGlowTexture(256, [
      [0, rgba('#' + p.color.getHexString(), 0.5)],
      [0.3, rgba('#' + p.halo.getHexString(), 0.22)],
      [0.65, rgba('#' + p.halo.getHexString(), 0.06)],
      [1, 'rgba(255,140,50,0)']
    ]);
    state.haloSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: haloTex,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending
    }));
    state.haloSprite.scale.setScalar(4.6);
    state.haloSprite.renderOrder = 4;

    // 镜头光斑横线
    state.streakSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeStreakTexture(),
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending
    }));
    state.streakSprite.scale.set(7.0, 0.42, 1);
    state.streakSprite.renderOrder = 6;
  }

  function ensureLayer(scene, fx) {
    var p = readParams(fx);
    var key = settingsKeyOf(p);
    if (state.initialized && state.settingsKey === key) return;
    clearLayer();

    state.root = new THREE.Group();
    state.coreGroup = buildCore(p);
    state.root.add(state.coreGroup);
    state.orbitGroup = buildOrbits(p);
    state.root.add(state.orbitGroup);
    state.stardust = buildStardust(p);
    if (state.stardust) state.root.add(state.stardust);
    buildSprites(p);
    state.root.add(state.haloSprite);
    state.root.add(state.streakSprite);

    state.root.visible = false;
    scene.add(state.root);
    state.scene = scene;
    state.settingsKey = key;
    state.initialized = true;
    state.opacity = 0;
  }

  function clearLayer() {
    if (!state.root) return;
    if (state.scene) state.scene.remove(state.root);
    state.root.traverse(function (obj) {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (obj.material.map) obj.material.map.dispose();
        obj.material.dispose();
      }
    });
    state.root = null;
    state.coreGroup = null;
    state.coreSolid = null;
    state.coreSolidMat = null;
    state.coreWireInner = null;
    state.coreWireOuter = null;
    state.haloSprite = null;
    state.coreGlowSprite = null;
    state.streakSprite = null;
    state.orbitGroup = null;
    state.orbits = [];
    state.stardust = null;
    state.stardustMat = null;
    state.initialized = false;
    state.settingsKey = '';
  }

  function isActive(fx) {
    return !!fx && Number(fx.preset) === INDEX;
  }

  // ─────────────────── 帧更新 ───────────────────

  function bindVisualRotation(ctx) {
    var src = ctx && ctx.visualRotation;
    if (!src && typeof particles !== 'undefined' && particles && particles.rotation) src = particles.rotation;
    state.boundRotX = src && Number.isFinite(Number(src.x)) ? Number(src.x) : 0;
    state.boundRotY = src && Number.isFinite(Number(src.y)) ? Number(src.y) : 0;
  }

  function update(dt, ctx) {
    ctx = ctx || {};
    var fx = ctx.fx || {};
    var scene = ctx.scene;
    var active = isActive(fx);
    var target = active ? 1 : 0;
    state.opacity += (target - state.opacity) * Math.min(1, dt * (active ? 2.6 : 3.2));
    if (!active && state.opacity < 0.01) {
      if (state.root) state.root.visible = false;
      return;
    }
    if (!scene) return;
    ensureLayer(scene, fx);
    if (!state.root) return;

    var p = readParams(fx);
    var dpr = ctx.dpr || (global.devicePixelRatio || 1);
    state.time += dt;
    var t = state.time;

    // 颜色调节时仅重生发光贴图
    var colorKey = colorKeyOf(p);
    if (state.colorKey !== colorKey) {
      state.colorKey = colorKey;
      refreshSpriteTextures(p);
    }

    // 音频平滑
    var audio = ctx.audio || {};
    var bass = clamp(Number(audio.bass) || 0, 0, 1.4);
    var energy = clamp(Number(audio.energy) || 0, 0, 1.4);
    state.smoothBass += (bass - state.smoothBass) * Math.min(1, dt * 7);
    state.smoothEnergy += (energy - state.smoothEnergy) * Math.min(1, dt * 5);

    // 呼吸脉动（缓慢正弦 + 低频敲击叠加）
    state.breathPhase += dt * (0.9 + p.spin * 0.35);
    var breathWave = 0.5 + 0.5 * Math.sin(state.breathPhase * 1.35);
    var breathAmp = p.breath * 0.30 + state.smoothBass * 0.22;
    var pulse = 1 + breathAmp * (breathWave - 0.5) * 2;

    bindVisualRotation(ctx);
    state.root.rotation.x = state.boundRotX;
    state.root.rotation.y = state.boundRotY;
    state.root.visible = state.opacity > 0.02;

    // ── 核心 ──
    if (state.coreGroup) {
      state.coreGroup.rotation.y += dt * (0.16 + p.spin * 0.22);
      state.coreGroup.rotation.x = Math.sin(t * 0.21) * 0.12;
      state.coreGroup.scale.setScalar(1 + (pulse - 1) * 0.35);
    }
    if (state.coreSolidMat) {
      var cu = state.coreSolidMat.uniforms;
      cu.uColor.value.copy(p.color);
      cu.uHalo.value.copy(p.halo);
      cu.uGlow.value = p.glow * (0.8 + state.smoothEnergy * 0.35);
      cu.uPulse.value = pulse;
      cu.uOpacity.value = state.opacity;
    }
    if (state.coreWireInner) {
      state.coreWireInner.rotation.y -= dt * (0.10 + p.spin * 0.14);
      state.coreWireInner.material.color.copy(p.color).lerp(new THREE.Color(1, 0.98, 0.9), 0.55);
      state.coreWireInner.material.opacity = (0.38 + 0.30 * breathWave * p.breath + state.smoothBass * 0.16) * p.glow * state.opacity;
    }
    if (state.coreWireOuter) {
      state.coreWireOuter.rotation.y += dt * (0.07 + p.spin * 0.09);
      state.coreWireOuter.rotation.x -= dt * 0.05;
      state.coreWireOuter.material.color.copy(p.halo);
      state.coreWireOuter.material.opacity = (0.20 + 0.18 * breathWave * p.breath) * p.glow * state.opacity;
    }
    if (state.coreGlowSprite) {
      state.coreGlowSprite.material.opacity = clamp(0.55 + 0.45 * breathWave * p.breath + state.smoothBass * 0.3, 0, 1.2) * p.glow * state.opacity;
      state.coreGlowSprite.scale.setScalar(2.1 * (1 + (pulse - 1) * 0.8));
    }
    if (state.haloSprite) {
      state.haloSprite.material.opacity = (0.42 + 0.30 * breathWave * p.breath + state.smoothEnergy * 0.18) * p.glow * state.opacity;
      state.haloSprite.scale.setScalar(4.6 * (1 + (pulse - 1) * 0.5));
    }
    if (state.streakSprite) {
      state.streakSprite.material.opacity = (0.16 + 0.22 * breathWave * p.breath) * p.glow * state.opacity;
      state.streakSprite.material.rotation = Math.sin(t * 0.11) * 0.35;
    }

    // ── 轨道 ──
    for (var i = 0; i < state.orbits.length; i++) {
      var o = state.orbits[i];
      var ou = o.mat.uniforms;
      ou.uTime.value = t;
      ou.uFlow.value += dt * o.dir * o.flowSpeed * p.spin * (1 + state.smoothEnergy * 0.35);
      ou.uPixelRatio.value = dpr;
      ou.uColor.value.copy(p.color).lerp(new THREE.Color(1, 1, 1), 0.12);
      ou.uOpacity.value = state.opacity * clamp(p.glow, 0.4, 1.4);
      if (o.haloMat) {
        var hu = o.haloMat.uniforms;
        hu.uTime.value = t;
        hu.uFlow.value += dt * o.dir * o.flowSpeed * p.spin * 0.55 * (1 + state.smoothEnergy * 0.35);
        hu.uPixelRatio.value = dpr;
        hu.uColor.value.copy(p.color).lerp(new THREE.Color(1, 1, 1), 0.3);
        hu.uOpacity.value = state.opacity * clamp(p.glow, 0.4, 1.4) * 0.75;
      }
      // 轨道整体缓慢章动，三维空间优雅旋转
      o.pivot.rotation.y += dt * 0.05 * p.spin * o.dir;
      o.pivot.rotation.x += Math.sin(t * 0.16 + o.wobblePhase) * dt * 0.02 * p.spin;
    }

    // ── 星尘 ──
    if (state.stardust && state.stardustMat) {
      var su = state.stardustMat.uniforms;
      su.uTime.value = t;
      su.uPixelRatio.value = dpr;
      su.uColor.value.copy(p.color).lerp(new THREE.Color(1, 1, 1), 0.3);
      su.uOpacity.value = state.opacity * clamp(p.stardust, 0, 1.5) * 0.62;
      state.stardust.rotation.y += dt * 0.008 * (0.4 + p.spin);
      state.stardust.visible = p.stardust > 0.02;
    }
  }

  function onPresetChange(prev, next, ctx) {
    if (prev === INDEX && next !== INDEX) clearLayer();
    if (next === INDEX && ctx && ctx.scene) {
      if (state.initialized) clearLayer();
      ensureLayer(ctx.scene, ctx.fx || {});
      state.opacity = 0;
    }
  }

  global.MOMusicGoldenCore = {
    INDEX: INDEX,
    isActive: isActive,
    update: update,
    clear: clearLayer,
    onPresetChange: onPresetChange
  };
})(typeof window !== 'undefined' ? window : globalThis);
