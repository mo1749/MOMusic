/**
 * Tree Canopy Score visual preset for MOMusic.
 *
 * A quiet tree grows from the lower-left corner. Flowing five-line staves
 * leave its canopy, while note sprites drift upward and react to the song.
 * The layer intentionally stays independent from the base cover particles so
 * the preset can keep the airy illustration-like composition from the visual
 * reference without changing the rest of the player.
 */
(function (global) {
  'use strict';

  var INDEX = 11;
  var DEFAULT_TREE_COLOR = '#b8e4d6';
  var DEFAULT_STAFF_COLOR = '#a9d9ff';
  var DEFAULT_NOTE_COLOR = '#fff0b8';
  var DEFAULT_GLOW = 1.15;
  var DEFAULT_WIND = 0.82;
  var DEFAULT_SWAY = 0.78;
  var DEFAULT_STAFF_COUNT = 5;
  var DEFAULT_NOTE_DENSITY = 1.0;
  var DEFAULT_NOTE_SIZE = 1.0;
  var DEFAULT_BEAT_RESPONSE = 1.1;
  var DEFAULT_AMBIENT = 1.2;

  var STAFF_MIN = 2;
  var STAFF_MAX = 7;
  var STAFF_BASE_Y = 2.62;
  var STAFF_Y_GAP = 1.16;
  var STAFF_LINE_SPACING = 0.115;
  var NOTE_MIN = 14;
  var NOTE_MAX = 68;
  var STAFF_LINE_COUNT = 5;
  var STAFF_POINT_COUNT = 96;
  var NOTE_GLYPHS = ['♪', '♫', '♩', '♬', '✦', '·'];
  var DUST_BASE_COUNT = 220;
  var LEAF_COUNT = 64;
  var BG_NOTE_BASE_COUNT = 10;

  var state = {
    root: null,
    scene: null,
    treeGroup: null,
    branchLine: null,
    branchMat: null,
    leafPoints: null,
    leafMat: null,
    canopyGlow: null,
    staffGroup: null,
    staffs: [],
    notesGroup: null,
    notes: [],
    noteTextures: [],
    dustPoints: null,
    dustGeo: null,
    dustMat: null,
    dustData: [],
    leavesPoints: null,
    leavesGeo: null,
    leavesMat: null,
    leavesData: [],
    bgNotes: [],
    initialized: false,
    settingsKey: '',
    colorKey: '',
    opacity: 0,
    time: 0,
    smoothBass: 0,
    smoothEnergy: 0,
    smoothBeat: 0,
    beatPulse: 0,
    boundRotX: 0,
    boundRotY: 0
  };

  var COLOR_CONTROLS = [
    { key: 'treeCanopyTreeColor', picker: 'tree-canopy-tree-picker', value: 'tree-canopy-tree-value', label: '树梢颜色' },
    { key: 'treeCanopyStaffColor', picker: 'tree-canopy-staff-picker', value: 'tree-canopy-staff-value', label: '五线谱颜色' },
    { key: 'treeCanopyNoteColor', picker: 'tree-canopy-note-picker', value: 'tree-canopy-note-value', label: '音符颜色' }
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
    // 整体提亮：所有线条/音符颜色向白色靠拢，保证在暗背景上清晰
    function brighten(color, amount) {
      return color.clone().lerp(new THREE.Color(1, 1, 1), amount);
    }
    return {
      treeColor: brighten(new THREE.Color(readHex(fx, 'treeCanopyTreeColor', DEFAULT_TREE_COLOR)), 0.16),
      staffColor: brighten(new THREE.Color(readHex(fx, 'treeCanopyStaffColor', DEFAULT_STAFF_COLOR)), 0.24),
      noteColor: brighten(new THREE.Color(readHex(fx, 'treeCanopyNoteColor', DEFAULT_NOTE_COLOR)), 0.22),
      glow: readNumber(fx, 'treeCanopyGlow', DEFAULT_GLOW, 0.2, 2),
      wind: readNumber(fx, 'treeCanopyWind', DEFAULT_WIND, 0, 2),
      sway: readNumber(fx, 'treeCanopySway', DEFAULT_SWAY, 0, 2),
      staffCount: Math.round(readNumber(fx, 'treeCanopyStaffCount', DEFAULT_STAFF_COUNT, STAFF_MIN, STAFF_MAX)),
      noteDensity: readNumber(fx, 'treeCanopyNoteDensity', DEFAULT_NOTE_DENSITY, 0.4, 2),
      noteSize: readNumber(fx, 'treeCanopyNoteSize', DEFAULT_NOTE_SIZE, 0.5, 2),
      beatResponse: readNumber(fx, 'treeCanopyBeatResponse', DEFAULT_BEAT_RESPONSE, 0, 2),
      ambient: readNumber(fx, 'treeCanopyAmbient', DEFAULT_AMBIENT, 0, 2)
    };
  }

  function settingsKeyOf(params) {
    return [params.staffCount, Math.round(params.noteDensity * 20), Math.round(params.ambient * 20)].join('|');
  }

  function colorKeyOf(params) {
    return [params.treeColor.getHexString(), params.staffColor.getHexString(), params.noteColor.getHexString()].join('|');
  }

  function rgba(color, alpha) {
    return 'rgba(' + Math.round(color.r * 255) + ',' + Math.round(color.g * 255) + ',' + Math.round(color.b * 255) + ',' + alpha + ')';
  }

  function makeGlowTexture(color) {
    var canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 160;
    var ctx = canvas.getContext('2d');
    var gradient = ctx.createRadialGradient(80, 80, 0, 80, 80, 80);
    gradient.addColorStop(0, rgba(color, 0.34));
    gradient.addColorStop(0.35, rgba(color, 0.12));
    gradient.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 160, 160);
    var texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  function makeNoteTexture(glyph) {
    var canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 128, 128);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 82px "Segoe UI Symbol", "Arial Unicode MS", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(255,255,255,.75)';
    ctx.shadowBlur = 12;
    ctx.fillText(glyph, 64, 63);
    var texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  function makeBranchPositions() {
    var segments = [];
    function branch(x1, y1, x2, y2, z) {
      segments.push(x1, y1, z || 0, x2, y2, z || 0);
    }

    // Main trunk: the geometry starts at the tree group's origin, so the
    // whole canopy can sway around the base instead of orbiting in place.
    branch(0, 0, 0.14, 1.15, 0);
    branch(0.14, 1.15, -0.08, 2.32, 0);
    branch(-0.08, 2.32, 0.22, 3.45, 0);
    branch(0.22, 3.45, -0.10, 4.48, 0);
    branch(-0.10, 4.48, 0.16, 5.34, 0);
    branch(0.16, 5.34, -0.08, 6.05, 0);

    // Main boughs.
    branch(0.03, 1.15, -1.18, 1.95, 0.01);
    branch(-1.18, 1.95, -2.28, 2.88, 0.01);
    branch(-2.28, 2.88, -3.05, 3.32, 0.01);
    branch(-0.06, 2.30, -1.12, 3.05, 0.01);
    branch(-1.12, 3.05, -1.78, 4.06, 0.01);
    branch(-1.78, 4.06, -2.05, 4.86, 0.01);
    branch(0.18, 3.42, 1.02, 4.05, 0.01);
    branch(1.02, 4.05, 1.58, 4.86, 0.01);
    branch(-0.10, 4.48, -0.82, 5.02, 0.01);
    branch(-0.82, 5.02, -1.12, 5.68, 0.01);
    branch(0.16, 5.34, 0.78, 5.77, 0.01);
    branch(0.78, 5.77, 1.22, 6.30, 0.01);

    // Fine twigs keep the silhouette airy rather than turning it into a solid tree.
    var twigs = [
      [-2.28, 2.88, -2.85, 3.90], [-2.28, 2.88, -1.95, 3.65],
      [-1.12, 3.05, -0.42, 3.92], [-1.78, 4.06, -2.62, 4.72],
      [1.02, 4.05, 0.44, 4.84], [1.02, 4.05, 1.94, 4.58],
      [-0.82, 5.02, -1.58, 5.48], [0.78, 5.77, 0.22, 6.25],
      [0.78, 5.77, 1.64, 6.58], [-0.10, 4.48, 0.42, 5.26]
    ];
    twigs.forEach(function (item) { branch(item[0], item[1], item[2], item[3], 0.02); });
    return new Float32Array(segments);
  }

  function makeLeafPositions() {
    var clusters = [
      [-2.92, 3.45], [-2.16, 4.18], [-1.22, 5.00], [-0.48, 4.00],
      [0.98, 4.42], [1.48, 5.10], [-1.08, 5.72], [0.62, 6.02],
      [-2.56, 2.76], [-1.64, 3.18]
    ];
    var count = 180;
    var positions = new Float32Array(count * 3);
    for (var i = 0; i < count; i++) {
      var cluster = clusters[i % clusters.length];
      var seed = i * 12.9898;
      var rx = Math.sin(seed) * 0.52;
      var ry = Math.sin(seed * 1.71) * 0.36;
      positions[i * 3] = cluster[0] + rx;
      positions[i * 3 + 1] = cluster[1] + ry;
      positions[i * 3 + 2] = -0.02 + Math.sin(seed * 0.73) * 0.16;
    }
    return positions;
  }

  function buildTree(params) {
    state.treeGroup = new THREE.Group();
    state.treeGroup.position.set(-3.55, -3.25, 0.12);

    var branchGeometry = new THREE.BufferGeometry();
    branchGeometry.setAttribute('position', new THREE.BufferAttribute(makeBranchPositions(), 3));
    state.branchMat = new THREE.LineBasicMaterial({
      color: params.treeColor.clone(),
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    state.branchLine = new THREE.LineSegments(branchGeometry, state.branchMat);
    state.branchLine.frustumCulled = false;
    state.branchLine.renderOrder = 7;
    state.treeGroup.add(state.branchLine);

    var leafGeometry = new THREE.BufferGeometry();
    leafGeometry.setAttribute('position', new THREE.BufferAttribute(makeLeafPositions(), 3));
    state.leafMat = new THREE.PointsMaterial({
      color: params.treeColor.clone(),
      size: 0.075,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    state.leafPoints = new THREE.Points(leafGeometry, state.leafMat);
    state.leafPoints.frustumCulled = false;
    state.leafPoints.renderOrder = 6;
    state.treeGroup.add(state.leafPoints);

    state.canopyGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture(params.treeColor),
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    state.canopyGlow.position.set(-0.15, 5.45, -0.08);
    state.canopyGlow.scale.setScalar(2.65);
    state.canopyGlow.renderOrder = 5;
    state.treeGroup.add(state.canopyGlow);
    state.root.add(state.treeGroup);
  }

  function buildStaffs(params) {
    state.staffGroup = new THREE.Group();
    state.staffs = [];
    for (var groupIndex = 0; groupIndex < params.staffCount; groupIndex++) {
      var lines = [];
      // 凌乱感：每组随机上下错位、行距微调、相位不同；谱线保持平直自然
      var yOffset = (Math.random() - 0.5) * 0.55;
      var spacing = STAFF_LINE_SPACING + (Math.random() - 0.5) * 0.028;
      var baseY = STAFF_BASE_Y - groupIndex * STAFF_Y_GAP + yOffset;
      // 谱线起点从树冠区域延伸出来（与树衔接，不凭空出现）
      var startX = -3.10 + (Math.random() - 0.5) * 1.0;
      var endX = 7.85 + groupIndex * 0.22 + (Math.random() - 0.5) * 1.0;
      for (var lineIndex = 0; lineIndex < STAFF_LINE_COUNT; lineIndex++) {
        var positions = new Float32Array(STAFF_POINT_COUNT * 3);
        for (var p = 0; p < STAFF_POINT_COUNT; p++) {
          var ratio = p / (STAFF_POINT_COUNT - 1);
          positions[p * 3] = startX + (endX - startX) * ratio;
          positions[p * 3 + 1] = baseY + lineIndex * spacing;
          positions[p * 3 + 2] = -0.35 - groupIndex * 0.008;
        }
        var geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        var material = new THREE.LineBasicMaterial({
          color: params.staffColor.clone(),
          transparent: true,
          opacity: 0,
          depthTest: false,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        });
        var line = new THREE.Line(geometry, material);
        line.frustumCulled = false;
        line.renderOrder = 8;
        state.staffGroup.add(line);
        lines.push(line);
      }
      state.staffs.push({
        lines: lines,
        groupIndex: groupIndex,
        baseY: baseY,
        spacing: spacing,
        startX: startX,
        endX: endX,
        phase: groupIndex * 1.37 + Math.random() * 1.2,
        speed: 0.55 + groupIndex * 0.08 + Math.random() * 0.2,
        mess: Math.random() * 0.05
      });
    }
    state.root.add(state.staffGroup);
  }

  function buildNotes(params) {
    state.notesGroup = new THREE.Group();
    state.notes = [];
    state.noteTextures = NOTE_GLYPHS.map(makeNoteTexture);
    var count = Math.round(clamp(34 * params.noteDensity, NOTE_MIN, NOTE_MAX));
    for (var i = 0; i < count; i++) {
      var sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: state.noteTextures[i % state.noteTextures.length],
        color: params.noteColor.clone(),
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      }));
      sprite.renderOrder = 10;
      sprite.frustumCulled = false;
      state.notesGroup.add(sprite);
      state.notes.push({
        sprite: sprite,
        progress: (i / count + (i % 5) * 0.037) % 1,
        speed: 0.045 + (i % 7) * 0.007,
        phase: i * 1.917,
        lane: i % params.staffCount,
        line: Math.floor(Math.random() * STAFF_LINE_COUNT),
        frac: 0.08 + Math.random() * 0.72,
        tilt: (i % 2 ? 1 : -1) * (0.08 + (i % 4) * 0.035)
      });
    }
    state.root.add(state.notesGroup);
  }

  // 环境光尘：铺满整个画面的微光粒子，缓慢漂浮 + 随能量/节拍明暗呼吸
  function buildAmbientDust(params) {
    var count = Math.round(DUST_BASE_COUNT * params.ambient);
    if (count <= 0) return;
    var positions = new Float32Array(count * 3);
    var data = [];
    for (var i = 0; i < count; i++) {
      var x = -6.4 + Math.random() * 14.2;
      var y = -3.6 + Math.random() * 10.4;
      var z = -1.6 + Math.random() * 1.6;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      data.push({
        baseX: x, baseY: y, baseZ: z,
        phase: Math.random() * Math.PI * 2,
        size: 0.02 + Math.random() * 0.03,
        bright: 0.5 + Math.random() * 0.5
      });
    }
    var geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    state.dustMat = new THREE.PointsMaterial({
      color: params.noteColor.clone().lerp(params.staffColor, 0.4),
      size: 0.028,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    state.dustPoints = new THREE.Points(geometry, state.dustMat);
    state.dustPoints.frustumCulled = false;
    state.dustPoints.renderOrder = 2;
    state.root.add(state.dustPoints);
    state.dustGeo = geometry;
    state.dustData = data;
  }

  // 飘落树叶：从树冠持续飘出，随风向右上漂移，环绕循环
  function buildFallingLeaves(params) {
    var positions = new Float32Array(LEAF_COUNT * 3);
    var data = [];
    for (var i = 0; i < LEAF_COUNT; i++) {
      var x = -3.2 + Math.random() * 1.6;
      var y = 3.2 + Math.random() * 3.2;
      var z = -0.3 + Math.random() * 0.6;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      data.push({
        phase: Math.random() * Math.PI * 2,
        speed: 0.35 + Math.random() * 0.75,
        size: 0.035 + Math.random() * 0.045
      });
    }
    var geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    state.leavesMat = new THREE.PointsMaterial({
      color: params.treeColor.clone(),
      size: 0.055,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    state.leavesPoints = new THREE.Points(geometry, state.leavesMat);
    state.leavesPoints.frustumCulled = false;
    state.leavesPoints.renderOrder = 3;
    state.root.add(state.leavesPoints);
    state.leavesGeo = geometry;
    state.leavesData = data;
  }

  // 背景淡音符：散布在画面中的大号微弱音符，缓慢漂移填充空旷背景
  function buildBackgroundNotes(params) {
    var count = Math.round(BG_NOTE_BASE_COUNT * params.ambient) + 4;
    state.bgNotes = [];
    for (var i = 0; i < count; i++) {
      var sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: state.noteTextures[i % state.noteTextures.length],
        color: params.noteColor.clone(),
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      }));
      sprite.renderOrder = 1;
      sprite.frustumCulled = false;
      state.root.add(sprite);
      state.bgNotes.push({
        sprite: sprite,
        progress: Math.random(),
        speed: 0.012 + Math.random() * 0.02,
        phase: i * 2.31,
        scale: 0.55 + Math.random() * 0.65,
        tilt: (i % 2 ? 1 : -1) * (0.1 + Math.random() * 0.25)
      });
    }
  }

  function clearLayer() {
    if (state.root && state.scene) state.scene.remove(state.root);
    if (state.root) {
      state.root.traverse(function (object) {
        if (object.geometry && object.geometry.dispose) object.geometry.dispose();
        if (object.material) {
          if (object.material.map && object.material.map.dispose) object.material.map.dispose();
          if (object.material.dispose) object.material.dispose();
        }
      });
    }
    state.root = null;
    state.scene = null;
    state.treeGroup = null;
    state.branchLine = null;
    state.branchMat = null;
    state.leafPoints = null;
    state.leafMat = null;
    state.canopyGlow = null;
    state.staffGroup = null;
    state.staffs = [];
    state.notesGroup = null;
    state.notes = [];
    state.noteTextures = [];
    state.dustPoints = null;
    state.dustGeo = null;
    state.dustMat = null;
    state.dustData = [];
    state.leavesPoints = null;
    state.leavesGeo = null;
    state.leavesMat = null;
    state.leavesData = [];
    state.bgNotes = [];
    state.initialized = false;
    state.settingsKey = '';
    state.colorKey = '';
  }

  function ensureLayer(scene, params) {
    var key = settingsKeyOf(params);
    if (state.initialized && state.settingsKey === key) return;
    var oldOpacity = state.opacity;
    clearLayer();
    state.root = new THREE.Group();
    state.root.name = 'MOMusicTreeCanopyScore';
    state.scene = scene;
    buildTree(params);
    buildStaffs(params);
    buildNotes(params);
    buildAmbientDust(params);
    buildFallingLeaves(params);
    buildBackgroundNotes(params);
    state.root.visible = false;
    scene.add(state.root);
    state.settingsKey = key;
    state.initialized = true;
    state.opacity = oldOpacity;
  }

  function isActive(fx) {
    return !!(fx && Number(fx.preset) === INDEX);
  }

  function bindVisualRotation(context) {
    var rotation = context && context.visualRotation;
    state.boundRotX = rotation && isFinite(Number(rotation.x)) ? Number(rotation.x) : 0;
    state.boundRotY = rotation && isFinite(Number(rotation.y)) ? Number(rotation.y) : 0;
  }

  function refreshColors(params) {
    var key = colorKeyOf(params);
    if (key === state.colorKey) return;
    state.colorKey = key;
    if (state.branchMat) state.branchMat.color.copy(params.treeColor);
    if (state.leafMat) state.leafMat.color.copy(params.treeColor);
    if (state.canopyGlow && state.canopyGlow.material.map && state.canopyGlow.material.map.dispose) {
      state.canopyGlow.material.map.dispose();
      state.canopyGlow.material.map = makeGlowTexture(params.treeColor);
      state.canopyGlow.material.needsUpdate = true;
    }
    state.staffs.forEach(function (staff) {
      staff.lines.forEach(function (line) { line.material.color.copy(params.staffColor); });
    });
    state.notes.forEach(function (note) { note.sprite.material.color.copy(params.noteColor); });
    if (state.dustMat) state.dustMat.color.copy(params.noteColor).lerp(params.staffColor, 0.4);
    if (state.leavesMat) state.leavesMat.color.copy(params.treeColor);
    state.bgNotes.forEach(function (note) { note.sprite.material.color.copy(params.noteColor); });
  }

  function updateTree(params, dt, beat) {
    if (!state.treeGroup) return;
    var wind = params.wind;
    var sway = params.sway;
    var treeWave = Math.sin(state.time * (0.35 + wind * 0.42)) * 0.025 * sway;
    var beatSway = beat * 0.035 * sway;
    state.treeGroup.rotation.z = treeWave + beatSway;
    state.treeGroup.rotation.y = Math.sin(state.time * 0.19 + 0.7) * 0.015 * sway;
    var leafPulse = 1 + (0.03 + beat * 0.12 * params.beatResponse) * Math.sin(state.time * 1.6 + 0.4);
    state.treeGroup.scale.set(1, leafPulse, 1);
    if (state.branchMat) state.branchMat.opacity = Math.min(1, state.opacity * params.glow * 0.95);
    if (state.leafMat) {
      state.leafMat.opacity = Math.min(1, state.opacity * params.glow * (0.72 + beat * 0.25));
      state.leafMat.size = 0.075 * (1 + beat * 0.35 * params.beatResponse);
    }
    if (state.canopyGlow) {
      state.canopyGlow.material.opacity = Math.min(1, state.opacity * params.glow * (0.42 + beat * 0.2));
      state.canopyGlow.scale.setScalar(2.65 * (1 + beat * 0.18 * params.beatResponse));
    }
  }

  function updateStaffs(params, beat) {
    var waveAmp = 0.05 + params.wind * 0.10 + beat * 0.09 * params.beatResponse;
    state.staffs.forEach(function (staff, groupIndex) {
      var messAmp = waveAmp * (1 + staff.mess);
      staff.lines.forEach(function (line, lineIndex) {
        var positions = line.geometry.attributes.position.array;
        for (var i = 0; i < STAFF_POINT_COUNT; i++) {
          var ratio = i / (STAFF_POINT_COUNT - 1);
          var x = staff.startX + (staff.endX - staff.startX) * ratio;
          var wave = Math.sin(state.time * (staff.speed + params.wind * 0.55) + x * (0.42 + params.wind * 0.1) + staff.phase + lineIndex * 0.05);
          var slow = Math.sin(state.time * 0.23 + groupIndex * 1.7) * 0.05;
          // 谱线保持平直自然：基础高度 + 轻微波纹漂移
          positions[i * 3] = x;
          positions[i * 3 + 1] = staff.baseY + lineIndex * staff.spacing + wave * messAmp + slow;
          positions[i * 3 + 2] = -0.35 - groupIndex * 0.008;
        }
        line.geometry.attributes.position.needsUpdate = true;
        line.material.opacity = Math.min(1, state.opacity * params.glow * (0.85 + beat * 0.15));
      });
    });
  }

  // 与 updateStaffs 用同一波动公式，求谱线在指定位置/时刻的高度，保证音符骑在谱线上
  function staffLineYAt(staff, lineIndex, x, wind, waveAmp) {
    var wave = Math.sin(state.time * (staff.speed + wind * 0.55) + x * (0.42 + wind * 0.1) + staff.phase + lineIndex * 0.05) * waveAmp * (1 + staff.mess);
    var slow = Math.sin(state.time * 0.23 + staff.groupIndex * 1.7) * 0.05;
    return staff.baseY + lineIndex * staff.spacing + wave + slow;
  }

  function updateNotes(params, dt, beat) {
    var laneCount = Math.max(1, params.staffCount);
    var t = state.time;
    var waveAmp = 0.05 + params.wind * 0.10 + beat * 0.09 * params.beatResponse;
    state.notes.forEach(function (note) {
      var lane = note.lane % laneCount;
      var staff = state.staffs[lane] || state.staffs[0];
      if (!staff) return;
      // 音符的落点：五线谱某一条线上的固定位置
      var lineY = staffLineYAt(staff, note.line, staff.startX + note.frac * (staff.endX - staff.startX), params.wind, waveAmp);
      var targetX = staff.startX + note.frac * (staff.endX - staff.startX);

      var next = note.progress + dt * (note.speed + params.wind * 0.018) * (0.55 + state.smoothEnergy * 0.3);
      if (next >= 1) {
        // 循环回到树梢：随机换一条谱线和落点
        note.lane = Math.floor(Math.random() * laneCount);
        note.line = Math.floor(Math.random() * STAFF_LINE_COUNT);
        note.frac = 0.08 + Math.random() * 0.72;
        next = next % 1;
      }
      note.progress = next;
      var progress = note.progress;

      var beatBounce = beat * (0.05 + 0.12 * params.beatResponse) * (0.6 + 0.4 * Math.abs(Math.sin(note.phase)));
      var x, y, alpha;
      if (progress < 0.24) {
        // 第一阶段：从树梢飞向谱线落点（缓入缓出）
        var landT = progress / 0.24;
        var ease = landT * landT * (3 - 2 * landT);
        x = -3.28 + (targetX + 3.28) * ease + Math.sin(t * 0.4 + note.phase) * 0.08;
        y = 3.42 + (lineY - 3.42) * ease - Math.sin(landT * Math.PI) * 0.6;
        alpha = ease;
      } else {
        // 第二阶段：落在谱线上，随谱面漂移后淡出
        var rideT = (progress - 0.24) / 0.76;
        var fadeIn = Math.min(1, rideT * 4);
        var fadeOut = rideT > 0.82 ? Math.max(0, (1 - rideT) / 0.18) : 1;
        x = targetX + rideT * (1.5 + params.wind * 1.1) + Math.sin(t * 0.5 + note.phase) * 0.1;
        // 音符骑在谱线上：y 跟随该处谱线当前的波动高度
        y = staffLineYAt(staff, note.line, x, params.wind, waveAmp) + beatBounce + Math.sin(t * 1.1 + note.phase) * 0.03;
        alpha = Math.min(fadeIn, fadeOut);
      }
      note.sprite.position.set(x, y, -0.10 + (lane % 7) * 0.012);
      note.sprite.rotation.z = note.tilt + Math.sin(t * 0.6 + note.phase) * 0.06;
      var scale = 0.32 * params.noteSize * (1 + beat * 0.4 * params.beatResponse + Math.sin(t * 2 + note.phase) * 0.05);
      note.sprite.scale.setScalar(Math.max(0.08, scale));
      note.sprite.material.opacity = Math.min(1, state.opacity * params.glow * alpha * (0.80 + beat * 0.2));
    });
  }

  function updateDust(params, beat) {
    if (!state.dustPoints || !state.dustGeo) return;
    var positions = state.dustGeo.attributes.position.array;
    var energy = state.smoothEnergy;
    var t = state.time;
    for (var i = 0; i < state.dustData.length; i++) {
      var d = state.dustData[i];
      var w = d.phase;
      positions[i * 3] = d.baseX + Math.sin(t * 0.24 + w) * 0.42 + Math.sin(t * 0.11 + w * 2.0) * 0.30;
      positions[i * 3 + 1] = d.baseY + Math.cos(t * 0.18 + w * 1.3) * 0.38 + energy * 0.12;
      positions[i * 3 + 2] = d.baseZ + Math.sin(t * 0.31 + w * 0.7) * 0.12;
    }
    state.dustGeo.attributes.position.needsUpdate = true;
    state.dustMat.opacity = Math.min(1, state.opacity * params.glow * (0.40 + energy * 0.30 + beat * 0.12));
    state.dustMat.size = 0.028 * (1 + beat * 0.5 * params.beatResponse);
  }

  function updateFallingLeaves(params, dt, beat) {
    if (!state.leavesPoints || !state.leavesGeo) return;
    var positions = state.leavesGeo.attributes.position.array;
    var energy = state.smoothEnergy;
    var wind = params.wind;
    var t = state.time;
    for (var i = 0; i < state.leavesData.length; i++) {
      var leaf = state.leavesData[i];
      var x = positions[i * 3];
      var y = positions[i * 3 + 1];
      x += dt * leaf.speed * (0.16 + wind * 0.22);
      y += dt * leaf.speed * (0.05 + energy * 0.14) + Math.sin(t * 1.4 + leaf.phase) * dt * 0.12;
      if (x > 7.6) {
        x = -3.6 - Math.random() * 0.8;
        y = 3.0 + Math.random() * 3.4;
      }
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = -0.3 + Math.sin(t * 0.9 + leaf.phase) * 0.25;
    }
    state.leavesGeo.attributes.position.needsUpdate = true;
    state.leavesMat.opacity = Math.min(1, state.opacity * params.glow * (0.50 + energy * 0.20 + beat * 0.15));
    state.leavesMat.size = 0.055 * (1 + beat * 0.3 * params.beatResponse);
  }

  function updateBackgroundNotes(params, dt) {
    var t = state.time;
    var energy = state.smoothEnergy;
    for (var i = 0; i < state.bgNotes.length; i++) {
      var note = state.bgNotes[i];
      note.progress = (note.progress + dt * note.speed) % 1;
      var x = -6.0 + note.progress * 13.6 + Math.sin(t * 0.16 + note.phase) * 0.8;
      var y = -2.8 + Math.sin(note.progress * Math.PI) * 2.6 + Math.cos(t * 0.12 + note.phase) * 0.6;
      note.sprite.position.set(x, y, -1.9);
      note.sprite.rotation.z = note.tilt + Math.sin(t * 0.22 + note.phase) * 0.08;
      note.sprite.scale.setScalar(note.scale * (1 + state.beatPulse * 0.15));
      note.sprite.material.opacity = Math.min(0.95, state.opacity * params.glow * params.ambient * (0.12 + energy * 0.07));
    }
  }

  function update(dt, context) {
    context = context || {};
    var fx = context.fx || {};
    var active = isActive(fx);
    var targetOpacity = active ? 1 : 0;
    state.opacity += (targetOpacity - state.opacity) * Math.min(1, dt * (active ? 3.5 : 4.5));
    if (!active && state.opacity < 0.005) {
      if (state.root) state.root.visible = false;
      return;
    }
    if (!context.scene) return;
    var params = readParams(fx);
    ensureLayer(context.scene, params);
    if (!state.root) return;
    var audio = context.audio || {};
    var bass = clamp(audio.bass, 0, 1.4);
    var energy = clamp(audio.energy, 0, 1.4);
    var beat = clamp(audio.beat, 0, 1.4);
    state.smoothBass += (bass - state.smoothBass) * Math.min(1, dt * 8);
    state.smoothEnergy += (energy - state.smoothEnergy) * Math.min(1, dt * 6);
    state.smoothBeat += (beat - state.smoothBeat) * Math.min(1, dt * 18);
    state.smoothBeat *= 0.86;
    state.beatPulse += (state.smoothBeat - state.beatPulse) * Math.min(1, dt * 20);
    state.time += dt * (0.75 + params.wind * 0.55);
    bindVisualRotation(context);
    refreshColors(params);
    state.root.rotation.x = state.boundRotX;
    state.root.rotation.y = state.boundRotY;
    state.root.visible = state.opacity > 0.01;
    updateTree(params, dt, state.beatPulse);
    updateStaffs(params, state.beatPulse);
    updateNotes(params, dt, state.beatPulse);
    updateDust(params, state.beatPulse);
    updateFallingLeaves(params, dt, state.beatPulse);
    updateBackgroundNotes(params, dt);
  }

  function onPresetChange(prev, next, context) {
    if (prev === INDEX && next !== INDEX) clearLayer();
    if (next === INDEX && context && context.scene) {
      if (state.initialized) clearLayer();
      ensureLayer(context.scene, readParams(context.fx || {}));
      state.opacity = 0;
    }
  }

  function normalizeColor(value, fallback) {
    if (typeof normalizeHexColor === 'function') return normalizeHexColor(value || fallback, fallback);
    return /^#[0-9a-fA-F]{6}$/.test(String(value || '')) ? String(value) : fallback;
  }

  function updateTreeCanopyColorControls() {
    COLOR_CONTROLS.forEach(function (item) {
      var fallback = fxDefaults[item.key] || '#ffffff';
      var color = normalizeColor(fx && fx[item.key], fallback);
      var picker = document.getElementById(item.picker);
      var value = document.getElementById(item.value);
      if (picker) picker.value = color;
      if (value) value.textContent = color.toUpperCase();
    });
  }

  function setTreeCanopyColor(key, color, silent) {
    var item = COLOR_CONTROLS.find(function (control) { return control.key === key || control.picker === key; });
    if (!item) return;
    var fallback = fxDefaults[item.key] || '#ffffff';
    fx[item.key] = normalizeColor(color, fallback);
    updateTreeCanopyColorControls();
    saveLyricLayout({ user: true, reason: item.key });
    if (!silent) showToast(item.label + ': ' + fx[item.key].toUpperCase());
  }

  function resetTreeCanopyColor(key) {
    var item = COLOR_CONTROLS.find(function (control) { return control.key === key || control.picker === key; });
    if (!item) return;
    fx[item.key] = normalizeColor(fxDefaults[item.key], '#ffffff');
    updateTreeCanopyColorControls();
    saveLyricLayout({ user: true, reason: item.key });
    showToast(item.label + '已恢复默认');
  }

  global.updateTreeCanopyColorControls = updateTreeCanopyColorControls;
  global.setTreeCanopyColor = setTreeCanopyColor;
  global.resetTreeCanopyColor = resetTreeCanopyColor;
  global.updateTreeCanopyControlVisibility = function () {
    var ids = [
      'fx-tree-canopy-section', 'tree-canopy-color-section', 'tree-canopy-tree-row',
      'tree-canopy-staff-row', 'tree-canopy-note-row', 'fx-treecanopyglow',
      'fx-treecanopywind', 'fx-treecanopysway', 'fx-treecanopystaffcount',
      'fx-treecanopynotedensity', 'fx-treecanopynotesize', 'fx-treecanopybeat',
      'fx-treecanopyambient'
    ];
    var active = typeof TREE_CANOPY_PRESET_INDEX !== 'undefined' && Number(fx && fx.preset) === TREE_CANOPY_PRESET_INDEX;
    if (typeof setFxPanelControlsHidden === 'function') setFxPanelControlsHidden(ids, !active);
  };

  global.MOMusicTreeCanopy = {
    INDEX: INDEX,
    isActive: isActive,
    update: update,
    clear: clearLayer,
    onPresetChange: onPresetChange
  };
})(typeof window !== 'undefined' ? window : globalThis);
