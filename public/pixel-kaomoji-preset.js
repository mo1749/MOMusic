/**
 * Pixel Kaomoji（像素颜文字粒子）visual preset for MOMusic. v3
 *
 * 核心设计：用密集 3D 方形粒子（THREE.Points + ShaderMaterial，NormalBlending）
 * 直接构成颜文字字符形状。不透明硬边方块 -> 清晰可辨，告别光晕。
 *
 * 工作原理：
 *   1. 将颜文字文本渲染到离屏 Canvas（高分辨率）
 *   2. 逐像素采样非透明区域 -> 提取为 3D 世界坐标
 *   3. 粒子 lerp 飞向目标坐标，形成颜文字形状
 *   4. 切换颜文字时粒子先散开（爆炸）再聚拢到新形状
 *   5. 每个情绪对应不同动态效果（弹跳/摇摆/脉动/抖动/漂浮）
 *   6. 节拍驱动粒子膨胀、尺寸脉冲、颜色随音乐变化
 *
 * 颜文字按歌曲情感（bass/energy/beat）动态切换。
 * 颜文字正下方叠加像素小表情，随情感联动。背景为繁星粒子层。
 * pixelKaomojiEnabled 控制颜文字粒子显隐；pixelKaomojiLyrics 独立控制
 * 歌词像素字体效果（两者互不影响）。
 *
 * 挂载 window.MOMusicPixelKaomoji，由 11-main-loop.js 每帧驱动 update()。
 */
(function (global) {
  'use strict';

  var INDEX = 10;

  var DEFAULT_COLOR = '#ff6b9d';
  var DEFAULT_SIZE = 1.0;
  var DEFAULT_SPEED = 1.0;
  var DEFAULT_BG_MODE = 'stars';

  var MAX_PARTICLES = 14000;
  var BG_PARTICLE_COUNT = 800;
  var SAMPLE_STEP = 1;
  var TEXT_CANVAS_W = 1000;
  var TEXT_CANVAS_H = 320;
  var TEXT_FONT_SIZE = 180;
  var WORLD_W = 7.0;
  var WORLD_H = 2.4;
  var Z_SPREAD = 0.12;
  var LERP_SPEED = 6.0;
  var SCATTER_FORCE = 2.5;
  var SCATTER_DECAY = 2.8;

  var KAOMOJI = {
    happy: ["(๑'▽'๑)","(≧∇≦)","ヾ(〃'▽'〃)ﾉ","(｡•̀ᴗ-)✧","(｡･ω･｡*)","(๑´ㅂ`๑)","ᕱ^‿^ᕱ","(｡•ᴗ‑｡)","٩(ˊωˋ*)و","✧‿✧","ʕ•ᴥ•ʔ","(〃•ω•〃)","( ´•³•` )","|•³•)。","(〃´•ω•`〃)","♪('ε':)","ʘ‿ʘ","(⁎•ᗗ•⁎)","(´･ω･`)","ヾ(•ω•`)o","✌'ω'✌","◐○◑","(:3っ)っ"],
    love: ["♡♡♡","ε('｡•ᗗ•`)っ♡","ヽ(♡‿♡)ﾉ","ヽ(❀∩///∩❀)ﾉ","꒰˘̩̩̩⌣˘̩̩̩꒱"],
    excited: ["ヽ(>ω<)/","ʘ>ᗗ<ʘ","ヽ(〃•ᵕ•〃)ﾉ","≧∪≦","✩⋆>∇<⋆✧","✧>□<✧","(≧Ω≦)゛","ᕙ(•̤᷆ ॒ ູ॒•̤᷇)ᕘ","꒰˃͈ꒂ˂͈꒱"],
    cool: ["<(ºOº)>","⊗ω⊗","^▨┬▨^","^▨_▨^","(´⊕⊖⊕`)","⊕ω⊕","⋔⊗⋔","(≖﹏≖)"],
    sad: ["( ´•̥ω•̥` )","˚‧º·(˚ ˃̣̣̥᷄⌓˂̣̣̥᷅ )‧º·˚","(∩´﹏`∩)","<(｡•́︿•̀｡)>","(///>﹏<///)","(>﹏<)"],
    surprised: ["(⊙_⊙)","(☉д☉)","{⋆>□<⋆}","༺>⊗<༻","(｡•́︿•̀｡)"],
    sleepy: ["zZ(^‑ω‑^)","ZZzᶻ","(-ω‑)","○_○","□~□"],
    silly: ["(´┐｀)","(‑θ‑)","(•θ•)","> ^ <","≡^□^≡","ʘ•∞•ʘ","(□ ∧ □)","(∩••∩)"],
    cat: ["(:3っ)っ","ʕ•ᴥ•ʔ","ᕱ^‿^ᕱ"]
  };
  var MOOD_KEYS = Object.keys(KAOMOJI);
  var MOOD_ANIM = { happy:0, love:1, excited:0, cool:4, sad:4, surprised:3, sleepy:4, silly:1, cat:1 };

  var EMOJI_BITMAPS = {
    smile: ["...XXXXXXX...",".X.........X.","X...........X","X..XX...XX..X","X...........X","X...........X","X.X.......X.X","X..XXXXXXX..X","X...........X",".X.........X.","...XXXXXXX..."],
    heart: [".XX...XX.","XXXXXXXXX","XXXXXXXXX","XXXXXXXXX",".XXXXXXX.","..XXXXX..","...XXX...","....X...."],
    star: ["....X....","....X....","...XXX...","XXXXXXXXX",".XXXXXXX.","..XXXXX..",".XX.X.XX.","XX.....XX","X.......X"],
    note: ["...XXX...","..X...X..","..X...X..","..X...X..","..X...X..","..X...X..","..XXXXX..","..X......",".XXX....."]
  };
  var EMOJI_KEYS = Object.keys(EMOJI_BITMAPS);
  var EMOJI_MAX_PARTICLES = 1600;
  var EMOJI_WORLD_W = 1.8;
  var EMOJI_WORLD_H = 1.3;
  var EMOJI_Y_OFFSET = -1.75;
  var EMOJI_Z_SPREAD = 0.15;

  // ════════════════════════════════════════
  //  自定义 Shader
  // ════════════════════════════════════════
  var KAOMOJI_VERT = [
    'attribute float aRand;',
    'attribute float aScatter;',
    'uniform float uTime;',
    'uniform float uBeat;',
    'uniform float uSize;',
    'uniform float uPixelRatio;',
    'uniform float uOpacity;',
    'uniform float uAnimMode;',
    'varying float vAlpha;',
    'varying float vBeat;',
    'varying float vRand;',
    'void main() {',
    '  vRand = aRand;',
    '  vBeat = uBeat;',
    '  vec3 pos = position;',
    // 节拍散开：径向偏移
    '  float scatter = aScatter * uBeat;',
    '  float angle = aRand * 6.28318 + uTime * 0.4;',
    '  pos.x += cos(angle) * scatter * 0.20;',
    '  pos.y += sin(angle) * scatter * 0.15;',
    // 动态表情效果（按情绪模式）
    '  float t = uTime;',
    '  if (uAnimMode < 0.5) {',
    '    pos.y += abs(sin(t * 3.2)) * 0.18 * (0.6 + uBeat * 0.6);',
    '  } else if (uAnimMode < 1.5) {',
    '    pos.x += sin(t * 4.5 + aRand * 6.28) * 0.10;',
    '    pos.y += cos(t * 2.5) * 0.06;',
    '  } else if (uAnimMode < 2.5) {',
    '    float s = 1.0 + sin(t * 3.5) * 0.04 + uBeat * 0.10;',
    '    pos *= s;',
    '  } else if (uAnimMode < 3.5) {',
    '    pos.x += sin(t * 22.0 + aRand * 100.0) * 0.025 * (0.3 + uBeat);',
    '    pos.y += cos(t * 20.0 + aRand * 80.0) * 0.025 * (0.3 + uBeat);',
    '  } else {',
    '    pos.y += sin(t * 1.6 + aRand * 6.28) * 0.07;',
    '    pos.x += cos(t * 1.3 + aRand * 6.28) * 0.05;',
    '  }',
    // 节拍膨胀
    '  pos *= 1.0 + uBeat * 0.04;',
    '  vec4 mv = modelViewMatrix * vec4(pos, 1.0);',
    '  float sz = uSize * (0.6 + aRand * 0.5) * (1.0 + uBeat * 0.30);',
    '  gl_PointSize = sz * uPixelRatio * (200.0 / max(0.1, -mv.z));',
    '  vAlpha = uOpacity * (0.80 + 0.20 * aRand);',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  var KAOMOJI_FRAG = [
    'uniform vec3 uColor;',
    'uniform vec3 uAccent;',
    'uniform float uBass;',
    'uniform float uEnergy;',
    'varying float vAlpha;',
    'varying float vBeat;',
    'varying float vRand;',
    'void main() {',
    '  vec2 uv = gl_PointCoord - 0.5;',
    '  float d = max(abs(uv.x), abs(uv.y)) * 2.0;',
    '  if (d > 1.0) discard;',
    '  float a = 1.0 - smoothstep(0.82, 1.0, d);',
    '  float mixT = clamp(uBass * 0.6 + uEnergy * 0.30, 0.0, 1.0);',
    '  vec3 col = mix(uColor, uAccent, mixT);',
    '  col = mix(col, vec3(1.0), vBeat * 0.25 * vRand);',
    '  gl_FragColor = vec4(col, a * vAlpha);',
    '}'
  ].join('\n');

  // 背景繁星 shader
  var BG_VERT = [
    'attribute float aRand;',
    'uniform float uTime;',
    'uniform float uBeat;',
    'uniform float uSize;',
    'uniform float uPixelRatio;',
    'uniform float uOpacity;',
    'varying float vTwinkle;',
    'varying float vBeat;',
    'void main() {',
    '  vec3 pos = position;',
    '  pos.y += uTime * (0.01 + aRand * 0.03);',
    '  pos.x += sin(uTime * (0.2 + aRand * 0.4) + aRand * 30.0) * 0.15;',
    '  if (pos.y > 6.0) pos.y -= 12.0;',
    '  vec4 mv = modelViewMatrix * vec4(pos, 1.0);',
    '  float tw = 0.3 + 0.7 * sin(uTime * (1.5 + aRand * 5.0) + aRand * 50.0);',
    '  vTwinkle = tw;',
    '  vBeat = uBeat;',
    '  float sz = uSize * (0.4 + aRand * 0.9) * (1.0 + uBeat * 0.2 * aRand);',
    '  gl_PointSize = sz * uPixelRatio * (140.0 / max(0.1, -mv.z));',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  var BG_FRAG = [
    'uniform vec3 uColor;',
    'uniform float uOpacity;',
    'varying float vTwinkle;',
    'varying float vBeat;',
    'void main() {',
    '  vec2 uv = gl_PointCoord - 0.5;',
    '  float d = length(uv) * 2.0;',
    '  if (d > 1.0) discard;',
    '  float a = smoothstep(1.0, 0.1, d);',
    '  float core = smoothstep(0.35, 0.0, d);',
    '  vec3 col = uColor + vec3(core * 0.6 * vTwinkle);',
    '  col = mix(col, vec3(1.0), vBeat * 0.15 * vTwinkle);',
    '  gl_FragColor = vec4(col * a * vTwinkle * uOpacity * 0.7, a * vTwinkle * uOpacity * 0.7);',
    '}'
  ].join('\n');

  // ════════════════════════════════════════
  //  内部状态
  // ════════════════════════════════════════
  var state = {
    root: null, scene: null, initialized: false, opacity: 0,
    points: null, geo: null, mat: null,
    positions: null, targets: null, activeCount: 0,
    bgPoints: null, bgGeo: null, bgMat: null,
    emojiPoints: null, emojiGeo: null, emojiMat: null,
    emojiPositions: null, emojiTargets: null, emojiActiveCount: 0,
    currentEmoji: null, emojiScatterImpulse: 0,
    canvas: null, ctx: null,
    currentKaomoji: null, currentMood: 'happy', switchTimer: 0,
    time: 0, smoothBass: 0, smoothEnergy: 0, smoothBeat: 0, beatPulse: 0,
    scatterImpulse: 0, bgPhase: 0,
    prevLyricFont: null, prevPixelEnabled: null, prevLyricsEnabled: null,
    colorKey: '', animMode: 0,
    drivingLyricPalette: false, lyricPaletteTimer: 0, lyricHue: 0,
  };

  // ════════════════════════════════════════
  //  工具
  // ════════════════════════════════════════
  function clamp01(v) { return Math.max(0, Math.min(1, Number(v) || 0)); }
  function clampR(v, lo, hi) { return Math.max(lo, Math.min(hi, Number(v) || lo)); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // 鲁棒颜色解析：支持 #hex / rgb() / rgba() / {r,g,b}，绝不返回 NaN。
  // 关键修复：stageLyrics.coverPalette.primary 是 rgbCss() 产生的 "rgb(r,g,b)" 字符串，
  // 旧版仅解析 hex -> parseInt("rg",16)=NaN -> THREE.Color.set(NaN) -> WebGL 渲染为黑色（"黑影"）。
  function hexToRgb(hex) {
    if (hex && typeof hex === 'object') {
      var or = Number(hex.r), og = Number(hex.g), ob = Number(hex.b);
      if (isFinite(or) && isFinite(og) && isFinite(ob)) {
        if (or <= 1 && og <= 1 && ob <= 1) return { r: or, g: og, b: ob };
        return { r: or / 255, g: og / 255, b: ob / 255 };
      }
    }
    var s = String(hex == null ? '' : hex).trim();
    var m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(s);
    if (m) {
      var rr = parseFloat(m[1]), gg = parseFloat(m[2]), bb = parseFloat(m[3]);
      if (isFinite(rr) && isFinite(gg) && isFinite(bb)) {
        if (rr <= 1 && gg <= 1 && bb <= 1) return { r: rr, g: gg, b: bb };
        return { r: rr / 255, g: gg / 255, b: bb / 255 };
      }
    }
    var h = s.replace('#', '').trim();
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (h.length >= 6) {
      var R = parseInt(h.slice(0, 2), 16), G = parseInt(h.slice(2, 4), 16), B = parseInt(h.slice(4, 6), 16);
      if (!isNaN(R) && !isNaN(G) && !isNaN(B)) return { r: R / 255, g: G / 255, b: B / 255 };
    }
    // 安全回退：绝不返回 NaN（DEFAULT_COLOR #ff6b9d）
    return { r: 1.0, g: 0.42, b: 0.62 };
  }

  function resolveColor(fx) {
    var base;
    if (fx && fx.pixelKaomojiColorMode === 'custom' && fx.pixelKaomojiCustomColor) {
      base = hexToRgb(fx.pixelKaomojiCustomColor);
    } else {
      var palette = (global.stageLyrics && global.stageLyrics.coverPalette) || (global.stageLyrics && global.stageLyrics.palette) || {};
      base = hexToRgb(palette.primary || (fx && fx.visualTintColor) || DEFAULT_COLOR);
    }
    // 始终增亮：杜绝封面取色偏暗时颜文字变成黑影
    return brightenRgb(base.r, base.g, base.b, 0.60, 0.75);
  }

  function resolveAccent(fx) {
    var palette = (global.stageLyrics && global.stageLyrics.coverPalette) || (global.stageLyrics && global.stageLyrics.palette) || {};
    var acc = hexToRgb(palette.highlight || palette.secondary || '#ffffff');
    return brightenRgb(acc.r, acc.g, acc.b, 0.72, 0.85);
  }

  function hslToHex(h, s, l) {
    h = ((h % 1) + 1) % 1; s = clamp01(s); l = clamp01(l);
    var c = (1 - Math.abs(2 * l - 1)) * s;
    var x = c * (1 - Math.abs((h * 6) % 2 - 1));
    var m = l - c / 2;
    var r, g, b;
    if (h < 1/6) { r=c; g=x; b=0; } else if (h < 2/6) { r=x; g=c; b=0; }
    else if (h < 3/6) { r=0; g=c; b=x; } else if (h < 4/6) { r=0; g=x; b=c; }
    else if (h < 5/6) { r=x; g=0; b=c; } else { r=c; g=0; b=x; }
    function hx(v) { return Math.max(0, Math.min(255, Math.round((v + m) * 255))).toString(16).padStart(2, '0'); }
    return '#' + hx(r) + hx(g) + hx(b);
  }

  // RGB <-> HSL 转换 + 颜色增亮（保证颜文字在任何封面下都鲜艳可辨，绝非黑影）
  function rgbToHsl(r, g, b) {
    r = clamp01(r); g = clamp01(g); b = clamp01(b);
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var hh = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) hh = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) hh = (b - r) / d + 2;
      else hh = (r - g) / d + 4;
      hh /= 6;
    }
    return { h: hh, s: s, l: l };
  }

  function hslToRgb(h, s, l) {
    h = ((h % 1) + 1) % 1; s = clamp01(s); l = clamp01(l);
    if (s === 0) { return { r: l, g: l, b: l }; }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    function hue2(t) { t = ((t % 1) + 1) % 1; if (t < 1/6) return p + (q - p) * 6 * t; if (t < 1/2) return q; if (t < 2/3) return p + (q - p) * (2/3 - t) * 6; return p; }
    return { r: hue2(h + 1/3), g: hue2(h), b: hue2(h - 1/3) };
  }

  // 强制增亮：饱和度拉高、亮度抬高，杜绝黑影
  function brightenRgb(r, g, b, minL, minS) {
    if (!isFinite(r) || !isFinite(g) || !isFinite(b)) { r = 1; g = 0.42; b = 0.62; }
    var hsl = rgbToHsl(r, g, b);
    if (!(hsl.s >= 0) || hsl.s < 0.12) hsl.h = 0.95; // 近灰/异常时退回温暖色相，避免脏灰
    if (!isFinite(hsl.h)) hsl.h = 0.95;
    if (!isFinite(hsl.s)) hsl.s = 0.85;
    if (!isFinite(hsl.l)) hsl.l = 0.66;
    hsl.s = Math.max(hsl.s, minS != null ? minS : 0.78);
    hsl.l = Math.max(hsl.l, minL != null ? minL : 0.62);
    var out = hslToRgb(hsl.h, hsl.s, hsl.l);
    if (!isFinite(out.r) || !isFinite(out.g) || !isFinite(out.b)) return { r: 1.0, g: 0.42, b: 0.62 };
    return out;
  }

  // 各情绪对应的色相，颜文字颜色随音乐情绪实时切换
  var MOOD_HUE = {
    happy: 0.10, love: 0.95, excited: 0.06, cool: 0.52,
    sad: 0.62, surprised: 0.78, sleepy: 0.66, silly: 0.33, cat: 0.42
  };

  // ════════════════════════════════════════
  //  Canvas 文本采样
  // ════════════════════════════════════════
  function ensureCanvas() {
    if (state.canvas) return;
    state.canvas = document.createElement('canvas');
    state.canvas.width = TEXT_CANVAS_W;
    state.canvas.height = TEXT_CANVAS_H;
    state.ctx = state.canvas.getContext('2d', { willReadFrequently: true });
  }

  function sampleKaomoji(text) {
    ensureCanvas();
    var ctx = state.ctx, w = TEXT_CANVAS_W, h = TEXT_CANVAS_H;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var baseSize = TEXT_FONT_SIZE;
    var fontStack = 'bold #Fpx "Segoe UI Symbol","Arial Unicode MS","Noto Sans SC","Microsoft YaHei","Apple Color Emoji","Segoe UI Emoji",monospace';
    ctx.font = fontStack.replace('#F', baseSize);
    var measured = ctx.measureText(text);
    var fitScale = Math.min(1, (w * 0.90) / Math.max(1, measured.width));
    var fontSize = Math.floor(baseSize * fitScale);
    ctx.font = fontStack.replace('#F', fontSize);
    ctx.fillText(text, w / 2, h / 2);
    var imgData = ctx.getImageData(0, 0, w, h);
    var pixels = imgData.data;
    var points = [];
    for (var y = 0; y < h; y += SAMPLE_STEP) {
      for (var x = 0; x < w; x += SAMPLE_STEP) {
        var idx = (y * w + x) * 4;
        if (pixels[idx + 3] > 50) {
          points.push((x / w - 0.5) * WORLD_W, -(y / h - 0.5) * WORLD_H, (Math.random() - 0.5) * Z_SPREAD * 2);
          if (points.length / 3 >= MAX_PARTICLES) break;
        }
      }
      if (points.length / 3 >= MAX_PARTICLES) break;
    }
    if (points.length === 0) {
      var r = WORLD_H * 0.42;
      for (var fi = 0; fi < MAX_PARTICLES; fi++) {
        var ft = (fi / MAX_PARTICLES) * Math.PI * 2;
        points.push((16 * Math.pow(Math.sin(ft), 3) / 16) * r * 1.6, ((13 * Math.cos(ft) - 5 * Math.cos(2*ft) - 2 * Math.cos(3*ft) - Math.cos(4*ft)) / 16) * r * 1.6, (Math.random() - 0.5) * Z_SPREAD * 2);
      }
    }
    return { points: new Float32Array(points), count: points.length / 3 };
  }

  function sampleEmoji(bitmap) {
    var rows = bitmap.length, cols = 0;
    for (var r = 0; r < rows; r++) cols = Math.max(cols, bitmap[r].length);
    var pts = [];
    for (var ry = 0; ry < rows; ry++) {
      var line = bitmap[ry];
      for (var rx = 0; rx < line.length; rx++) {
        if (line.charAt(rx) !== 'X') continue;
        pts.push((rx / Math.max(1, cols - 1) - 0.5) * EMOJI_WORLD_W, -(ry / Math.max(1, rows - 1) - 0.5) * EMOJI_WORLD_H + EMOJI_Y_OFFSET, (Math.random() - 0.5) * EMOJI_Z_SPREAD * 2);
        if (pts.length / 3 >= EMOJI_MAX_PARTICLES) break;
      }
      if (pts.length / 3 >= EMOJI_MAX_PARTICLES) break;
    }
    return { points: new Float32Array(pts), count: pts.length / 3 };
  }

  // ════════════════════════════════════════
  //  Three.js 场景构建
  // ════════════════════════════════════════
  function ensurePoints() {
    if (state.points) return;
    state.positions = new Float32Array(MAX_PARTICLES * 3);
    state.targets = new Float32Array(MAX_PARTICLES * 3);
    for (var i = 0; i < MAX_PARTICLES; i++) {
      state.positions[i*3] = (Math.random()-0.5)*9;
      state.positions[i*3+1] = (Math.random()-0.5)*6;
      state.positions[i*3+2] = (Math.random()-0.5)*3;
    }
    var rands = new Float32Array(MAX_PARTICLES);
    var scatters = new Float32Array(MAX_PARTICLES);
    for (var j = 0; j < MAX_PARTICLES; j++) { rands[j] = Math.random(); scatters[j] = 0.4 + Math.random()*0.6; }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(state.positions, 3));
    geo.setAttribute('aRand', new THREE.BufferAttribute(rands, 1));
    geo.setAttribute('aScatter', new THREE.BufferAttribute(scatters, 1));
    geo.setDrawRange(0, 0);
    var color = resolveColor(global.fx), accent = resolveAccent(global.fx);
    var mat = new THREE.ShaderMaterial({
      vertexShader: KAOMOJI_VERT, fragmentShader: KAOMOJI_FRAG,
      uniforms: {
        uTime:{value:0}, uBeat:{value:0}, uSize:{value:0.24}, uPixelRatio:{value:1},
        uOpacity:{value:0}, uBass:{value:0}, uEnergy:{value:0}, uAnimMode:{value:0},
        uColor:{value:new THREE.Color(color.r,color.g,color.b)},
        uAccent:{value:new THREE.Color(accent.r,accent.g,accent.b)}
      },
      blending: THREE.NormalBlending, depthTest: false, depthWrite: false, transparent: true
    });
    state.points = new THREE.Points(geo, mat);
    state.points.renderOrder = 10;
    state.points.frustumCulled = false;
    state.geo = geo; state.mat = mat;
    if (state.root) state.root.add(state.points);
  }

  function ensureBgPoints() {
    if (state.bgPoints) return;
    var positions = new Float32Array(BG_PARTICLE_COUNT * 3);
    var rands = new Float32Array(BG_PARTICLE_COUNT);
    for (var i = 0; i < BG_PARTICLE_COUNT; i++) {
      positions[i*3] = (Math.random()-0.5)*16;
      positions[i*3+1] = (Math.random()-0.5)*12;
      positions[i*3+2] = (Math.random()-0.5)*8 - 3;
      rands[i] = Math.random();
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aRand', new THREE.BufferAttribute(rands, 1));
    var color = resolveColor(global.fx);
    var mat = new THREE.ShaderMaterial({
      vertexShader: BG_VERT, fragmentShader: BG_FRAG,
      uniforms: { uTime:{value:0}, uBeat:{value:0}, uSize:{value:2.2}, uPixelRatio:{value:1}, uOpacity:{value:0}, uColor:{value:new THREE.Color(color.r,color.g,color.b)} },
      blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true
    });
    state.bgPoints = new THREE.Points(geo, mat);
    state.bgPoints.renderOrder = 4;
    state.bgPoints.frustumCulled = false;
    state.bgGeo = geo; state.bgMat = mat;
    if (state.root) state.root.add(state.bgPoints);
  }

  function ensureEmojiPoints() {
    if (state.emojiPoints) return;
    state.emojiPositions = new Float32Array(EMOJI_MAX_PARTICLES * 3);
    state.emojiTargets = new Float32Array(EMOJI_MAX_PARTICLES * 3);
    for (var i = 0; i < EMOJI_MAX_PARTICLES; i++) {
      state.emojiPositions[i*3] = (Math.random()-0.5)*5;
      state.emojiPositions[i*3+1] = EMOJI_Y_OFFSET + (Math.random()-0.5)*3;
      state.emojiPositions[i*3+2] = (Math.random()-0.5)*2;
    }
    var rands = new Float32Array(EMOJI_MAX_PARTICLES);
    var scatters = new Float32Array(EMOJI_MAX_PARTICLES);
    for (var j = 0; j < EMOJI_MAX_PARTICLES; j++) { rands[j] = Math.random(); scatters[j] = 0.4 + Math.random()*0.6; }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(state.emojiPositions, 3));
    geo.setAttribute('aRand', new THREE.BufferAttribute(rands, 1));
    geo.setAttribute('aScatter', new THREE.BufferAttribute(scatters, 1));
    geo.setDrawRange(0, 0);
    var color = resolveColor(global.fx), accent = resolveAccent(global.fx);
    var mat = new THREE.ShaderMaterial({
      vertexShader: KAOMOJI_VERT, fragmentShader: KAOMOJI_FRAG,
      uniforms: {
        uTime:{value:0}, uBeat:{value:0}, uSize:{value:0.34}, uPixelRatio:{value:1},
        uOpacity:{value:0}, uBass:{value:0}, uEnergy:{value:0}, uAnimMode:{value:1},
        uColor:{value:new THREE.Color(color.r,color.g,color.b)},
        uAccent:{value:new THREE.Color(accent.r,accent.g,accent.b)}
      },
      blending: THREE.NormalBlending, depthTest: false, depthWrite: false, transparent: true
    });
    state.emojiPoints = new THREE.Points(geo, mat);
    state.emojiPoints.renderOrder = 11;
    state.emojiPoints.frustumCulled = false;
    state.emojiGeo = geo; state.emojiMat = mat;
    if (state.root) state.root.add(state.emojiPoints);
  }

  // ════════════════════════════════════════
  //  颜文字 / 表情切换
  // ════════════════════════════════════════
  function switchKaomoji(text, mood) {
    var result = sampleKaomoji(text);
    var count = result.count;
    for (var i = 0; i < count && i < MAX_PARTICLES; i++) {
      state.targets[i*3] = result.points[i*3];
      state.targets[i*3+1] = result.points[i*3+1];
      state.targets[i*3+2] = result.points[i*3+2];
    }
    for (var j = count; j < MAX_PARTICLES; j++) {
      state.targets[j*3] = (Math.random()-0.5)*14;
      state.targets[j*3+1] = (Math.random()-0.5)*12;
      state.targets[j*3+2] = -6;
    }
    state.activeCount = Math.min(count, MAX_PARTICLES);
    state.geo.setDrawRange(0, state.activeCount);
    state.scatterImpulse = 1.0;
    state.currentKaomoji = text;
    state.currentMood = mood || 'happy';
    state.animMode = MOOD_ANIM[state.currentMood] != null ? MOOD_ANIM[state.currentMood] : 4;
    switchEmoji(state.currentMood);
  }

  function moodEmojiKey(mood) {
    if (mood === 'love') return 'heart';
    if (mood === 'sad' || mood === 'sleepy') return 'note';
    if (mood === 'cool' || mood === 'surprised') return 'star';
    return 'smile';
  }

  function switchEmoji(mood) {
    if (!state.emojiGeo) return;
    var key = moodEmojiKey(mood);
    if (key === state.currentEmoji && state.emojiActiveCount > 0) return;
    var bm = EMOJI_BITMAPS[key] || EMOJI_BITMAPS.smile;
    var result = sampleEmoji(bm);
    var count = result.count;
    for (var i = 0; i < count && i < EMOJI_MAX_PARTICLES; i++) {
      state.emojiTargets[i*3] = result.points[i*3];
      state.emojiTargets[i*3+1] = result.points[i*3+1];
      state.emojiTargets[i*3+2] = result.points[i*3+2];
    }
    for (var j = count; j < EMOJI_MAX_PARTICLES; j++) {
      state.emojiTargets[j*3] = (Math.random()-0.5)*7;
      state.emojiTargets[j*3+1] = EMOJI_Y_OFFSET + (Math.random()-0.5)*5;
      state.emojiTargets[j*3+2] = -6;
    }
    state.emojiActiveCount = Math.min(count, EMOJI_MAX_PARTICLES);
    state.emojiGeo.setDrawRange(0, state.emojiActiveCount);
    state.emojiScatterImpulse = 1.0;
    state.currentEmoji = key;
  }

  function pickMood(fx, dt) {
    var speed = clampR((fx && fx.pixelKaomojiSpeed) || DEFAULT_SPEED, 0.5, 2);
    var holdTime = 2.4 / speed;
    state.switchTimer += dt;
    if (state.switchTimer < holdTime && state.currentKaomoji) return;
    state.switchTimer = 0;
    var bass = state.smoothBass, energy = state.smoothEnergy, beat = state.smoothBeat;
    var mood;
    if (beat > 0.65 && energy > 0.55) mood = Math.random() < 0.5 ? 'excited' : 'happy';
    else if (beat > 0.45 && energy > 0.35) mood = 'happy';
    else if (energy > 0.55 && bass < 0.4) mood = 'love';
    else if (bass > 0.5 && energy < 0.4) mood = 'cool';
    else if (energy < 0.12) mood = 'sad';
    else if (energy < 0.22) mood = 'sleepy';
    else if (beat > 0.6 && Math.random() < 0.3) mood = 'surprised';
    else if (Math.random() < 0.15) mood = 'cat';
    else if (Math.random() < 0.10) mood = 'silly';
    else mood = 'happy';
    var pool = KAOMOJI[mood] || KAOMOJI.happy;
    var pick = pool[Math.floor(Math.random() * pool.length)];
    if (pick === state.currentKaomoji && pool.length > 1) pick = pool[(pool.indexOf(state.currentKaomoji) + 1) % pool.length];
    switchKaomoji(pick, mood);
  }

  // ════════════════════════════════════════
  //  粒子位置更新
  // ════════════════════════════════════════
  function updatePositions(dt) {
    if (!state.geo) return;
    var posArr = state.geo.attributes.position.array;
    var scatterArr = state.geo.attributes.aScatter.array;
    var lerpFactor = Math.min(1, dt * LERP_SPEED);
    if (state.scatterImpulse > 0) { state.scatterImpulse *= Math.max(0, 1 - dt * SCATTER_DECAY); if (state.scatterImpulse < 0.01) state.scatterImpulse = 0; }
    for (var i = 0; i < state.activeCount; i++) {
      var idx = i * 3;
      var tx = state.targets[idx], ty = state.targets[idx+1], tz = state.targets[idx+2];
      if (state.scatterImpulse > 0.01) {
        var sv = scatterArr[i] || 1;
        var angle = (i * 2.39996) % 6.28318;
        var dist = state.scatterImpulse * SCATTER_FORCE * sv;
        tx += Math.cos(angle) * dist * 0.5;
        ty += Math.sin(angle) * dist * 0.4;
        tz += Math.sin(i * 1.7) * dist * 0.2;
      }
      posArr[idx] = lerp(posArr[idx], tx, lerpFactor);
      posArr[idx+1] = lerp(posArr[idx+1], ty, lerpFactor);
      posArr[idx+2] = lerp(posArr[idx+2], tz, lerpFactor);
    }
    state.geo.attributes.position.needsUpdate = true;
  }

  function updateEmojiPositions(dt) {
    if (!state.emojiGeo || state.emojiActiveCount <= 0) return;
    var posArr = state.emojiGeo.attributes.position.array;
    var scatterArr = state.emojiGeo.attributes.aScatter.array;
    var lerpFactor = Math.min(1, dt * LERP_SPEED);
    if (state.emojiScatterImpulse > 0) { state.emojiScatterImpulse *= Math.max(0, 1 - dt * SCATTER_DECAY); if (state.emojiScatterImpulse < 0.01) state.emojiScatterImpulse = 0; }
    for (var i = 0; i < state.emojiActiveCount; i++) {
      var idx = i * 3;
      var tx = state.emojiTargets[idx], ty = state.emojiTargets[idx+1], tz = state.emojiTargets[idx+2];
      if (state.emojiScatterImpulse > 0.01) {
        var sv = scatterArr[i] || 1;
        var angle = (i * 2.39996) % 6.28318;
        var dist = state.emojiScatterImpulse * SCATTER_FORCE * 0.7 * sv;
        tx += Math.cos(angle) * dist * 0.5;
        ty += Math.sin(angle) * dist * 0.4;
        tz += Math.sin(i * 1.7) * dist * 0.2;
      }
      posArr[idx] = lerp(posArr[idx], tx, lerpFactor);
      posArr[idx+1] = lerp(posArr[idx+1], ty, lerpFactor);
      posArr[idx+2] = lerp(posArr[idx+2], tz, lerpFactor);
    }
    state.emojiGeo.attributes.position.needsUpdate = true;
  }

  // ════════════════════════════════════════
  //  颜色更新
  // ════════════════════════════════════════
  function refreshColors(fx) {
    var base = resolveColor(fx), accent = resolveAccent(fx);
    // 情绪色相：封面色相与情绪色相混合，颜色随音乐情绪实时变化
    var baseHsl = rgbToHsl(base.r, base.g, base.b);
    var moodHue = MOOD_HUE[state.currentMood] != null ? MOOD_HUE[state.currentMood] : baseHsl.h;
    var blendedHue = baseHsl.h * 0.35 + moodHue * 0.65;
    // 亮度随低频/能量轻微脉动，颜色随音乐变化
    var pulseL = 0.60 + state.smoothBass * 0.12 + state.smoothEnergy * 0.06;
    var finalRgb = hslToRgb(blendedHue, Math.max(baseHsl.s, 0.78), Math.min(0.82, pulseL));
    // accent 偏向情绪色相邻近色，高能量时颜色对比鲜明
    var accHsl = rgbToHsl(accent.r, accent.g, accent.b);
    var accRgb = hslToRgb((blendedHue + 0.12) % 1, Math.max(accHsl.s, 0.85), 0.74);

    // 防御：任何 NaN 都回退到鲜艳默认色，且绝不把坏色写进缓存（否则会被 colorKey 永久锁死成黑影）
    if (!isFinite(finalRgb.r) || !isFinite(finalRgb.g) || !isFinite(finalRgb.b) ||
        !isFinite(accRgb.r) || !isFinite(accRgb.g) || !isFinite(accRgb.b)) {
      finalRgb = { r: 1.0, g: 0.42, b: 0.62 };
      accRgb = { r: 1.0, g: 0.72, b: 0.40 };
      state.colorKey = '';
    }
    var ck = finalRgb.r.toFixed(2)+','+finalRgb.g.toFixed(2)+','+finalRgb.b.toFixed(2)+'|'+accRgb.r.toFixed(2)+','+accRgb.g.toFixed(2)+','+accRgb.b.toFixed(2);
    if (ck === state.colorKey) return;
    state.colorKey = ck;
    if (state.mat) { state.mat.uniforms.uColor.value.setRGB(finalRgb.r,finalRgb.g,finalRgb.b); state.mat.uniforms.uAccent.value.setRGB(accRgb.r,accRgb.g,accRgb.b); }
    if (state.bgMat) state.bgMat.uniforms.uColor.value.setRGB(finalRgb.r,finalRgb.g,finalRgb.b);
    if (state.emojiMat) { state.emojiMat.uniforms.uColor.value.setRGB(finalRgb.r,finalRgb.g,finalRgb.b); state.emojiMat.uniforms.uAccent.value.setRGB(accRgb.r,accRgb.g,accRgb.b); }
  }

  // ════════════════════════════════════════
  //  歌词像素字体开关（pixelKaomojiEnabled 控制歌词像素字体）
  //  仅在"像素颜文字"预设激活时生效：离开预设或开关关闭都会恢复原字体。
  // ════════════════════════════════════════
  function applyPixelFont(fx) {
    if (fx && typeof normalizeLyricFontKey === 'function' && normalizeLyricFontKey(fx.lyricFont) !== 'pixel') {
      state.prevLyricFont = fx.lyricFont || 'sans';
      fx.lyricFont = 'pixel';
      if (typeof clearLyricTextMeasureCache === 'function') clearLyricTextMeasureCache();
      if (typeof invalidateLyricQualityTextures === 'function') invalidateLyricQualityTextures('pixel-font-change');
      if (typeof refreshCurrentLyricStyle === 'function') refreshCurrentLyricStyle();
      if (typeof updateLyricFontControls === 'function') updateLyricFontControls();
      // 桌面歌词层字体与舞台歌词独立，需要单独推送才会刷新
      if (typeof pushDesktopLyricsState === 'function') pushDesktopLyricsState(true);
    }
  }

  function restorePixelFont(fx) {
    if (!fx || typeof normalizeLyricFontKey !== 'function') return;
    // 全局像素歌词开启时，歌词字体由全局开关接管，预设不做恢复
    if (fx.pixelLyricsEnabled === true) return;
    // 字体已经不是像素字体：无需恢复，仅清空记录
    if (normalizeLyricFontKey(fx.lyricFont) !== 'pixel') {
      state.prevLyricFont = null;
      return;
    }
    // 恢复此前记住的字体；若没有记录（历史泄漏/状态损坏），回退默认 sans
    fx.lyricFont = state.prevLyricFont ? normalizeLyricFontKey(state.prevLyricFont) : 'sans';
    state.prevLyricFont = null;
    if (typeof clearLyricTextMeasureCache === 'function') clearLyricTextMeasureCache();
    if (typeof invalidateLyricQualityTextures === 'function') invalidateLyricQualityTextures('pixel-font-restore');
    if (typeof refreshCurrentLyricStyle === 'function') refreshCurrentLyricStyle();
    if (typeof updateLyricFontControls === 'function') updateLyricFontControls();
    // 桌面歌词层字体与舞台歌词独立，需要单独推送才会刷新
    if (typeof pushDesktopLyricsState === 'function') pushDesktopLyricsState(true);
  }

  // 根据开关同步歌词像素字体（仅"像素颜文字"预设激活时生效）
  function syncPixelLyricFont(fx) {
    var wantPixel = isActive(fx) && !!(fx && fx.pixelKaomojiLyrics !== false);
    if (wantPixel && !state.prevLyricFont) applyPixelFont(fx);
    else if (!wantPixel) restorePixelFont(fx);
  }

  // ════════════════════════════════════════
  //  公共 API
  // ════════════════════════════════════════
  function isActive(fx) {
    return !!(fx && Number(fx.preset) === INDEX);
  }

  function ensureLayer(scene, fx) {
    if (state.initialized) {
      if (state.root && state.scene !== scene && scene) {
        if (state.scene) state.scene.remove(state.root);
        scene.add(state.root);
        state.scene = scene;
      }
      return;
    }
    state.scene = scene;
    if (!state.root) {
      state.root = new THREE.Group();
      state.root.name = 'MOMusicPixelKaomoji';
      if (state.scene) state.scene.add(state.root);
    }
    if (fx && fx.pixelKaomojiEnabled === undefined) fx.pixelKaomojiEnabled = true;
    if (fx && fx.pixelKaomojiLyrics === undefined) fx.pixelKaomojiLyrics = true;
    ensurePoints();
    ensureBgPoints();
    ensureEmojiPoints();
    state.initialized = true;
    state.opacity = 0;
    state.switchTimer = 999;
    var pool0 = KAOMOJI.happy;
    switchKaomoji(pool0[Math.floor(Math.random() * pool0.length)], 'happy');
    state.prevPixelEnabled = !!(fx && fx.pixelKaomojiEnabled !== false);
    state.prevLyricsEnabled = !!(fx && fx.pixelKaomojiLyrics !== false);
    syncPixelLyricFont(fx);
  }

  function onPresetChange(prev, p, context) {
    var wasActive = prev === INDEX;
    var nowActive = p === INDEX;
    var fx = context && context.fx;
    var scene = context && context.scene;
    if (nowActive) {
      ensureLayer(scene, fx);
    } else if (!nowActive && wasActive) {
      state.opacity = 0;
      if (state.mat) state.mat.uniforms.uOpacity.value = 0;
      if (state.bgMat) state.bgMat.uniforms.uOpacity.value = 0;
      if (state.emojiMat) state.emojiMat.uniforms.uOpacity.value = 0;
      if (state.drivingLyricPalette) {
        state.drivingLyricPalette = false;
        state.lyricPaletteTimer = 0;
        if (typeof applySavedLyricPaletteState === 'function') { try { applySavedLyricPaletteState(); } catch (e) {} }
      }
      restorePixelFont(fx);
      state.prevPixelEnabled = null;
      state.prevLyricsEnabled = null;
    }
  }

  function update(dt, context) {
    var fx = context && context.fx;
    var scene = context && context.scene;
    if (isActive(fx)) ensureLayer(scene, fx);
    if (!state.initialized) return;
    var audio = (context && context.audio) || {};
    var time = (context && context.time) || 0;
    var dpr = (context && context.dpr) || (window.devicePixelRatio || 1);

    state.smoothBass += (clamp01(audio.bass) - state.smoothBass) * Math.min(1, dt * 8);
    state.smoothEnergy += (clamp01(audio.energy) - state.smoothEnergy) * Math.min(1, dt * 6);
    state.smoothBeat += (clamp01(audio.beat) - state.smoothBeat) * Math.min(1, dt * 18);
    state.smoothBeat *= 0.85;
    state.beatPulse += (state.smoothBeat - state.beatPulse) * Math.min(1, dt * 20);
    state.time = time;
    state.bgPhase += dt;

    var active = isActive(fx);
    // 像素风格开关控制颜文字粒子显隐
    var visualOn = active && !!(fx && fx.pixelKaomojiEnabled !== false);
    var targetOpacity = visualOn ? 1 : 0;
    state.opacity += (targetOpacity - state.opacity) * Math.min(1, dt * 8);

    // 检测像素歌词开关变化，同步歌词像素字体（仅预设激活时生效，离开预设不会重新强制像素字体）
    var pixelOn = active && !!(fx && fx.pixelKaomojiLyrics !== false);
    if (pixelOn !== state.prevLyricsEnabled) {
      state.prevLyricsEnabled = pixelOn;
      syncPixelLyricFont(fx);
    }

    if (state.opacity < 0.001) {
      if (state.mat) state.mat.uniforms.uOpacity.value = 0;
      if (state.bgMat) state.bgMat.uniforms.uOpacity.value = 0;
      if (state.emojiMat) state.emojiMat.uniforms.uOpacity.value = 0;
      return;
    }

    pickMood(fx, dt);
    updatePositions(dt);
    updateEmojiPositions(dt);
    refreshColors(fx);

    // 音乐驱动像素歌词配色
    state.lyricHue = (state.lyricHue + dt * (0.03 + state.smoothEnergy * 0.12 + state.smoothBass * 0.05)) % 1;
    state.lyricPaletteTimer += dt;
    if (state.lyricPaletteTimer >= 0.4) {
      state.lyricPaletteTimer = 0;
      if (typeof setStageLyricPalette === 'function' && typeof lyricPaletteFromHex === 'function') {
        try {
          var lHue = (state.lyricHue + state.smoothBeat * 0.06) % 1;
          setStageLyricPalette(lyricPaletteFromHex(hslToHex(lHue, 0.80, 0.64)), { durationMs: 460 });
          state.drivingLyricPalette = true;
        } catch (e) {}
      }
    }

    var beatFlash = state.beatPulse;
    var sizeScale = clampR((fx && fx.pixelKaomojiSize) || DEFAULT_SIZE, 0.5, 2);
    var bassVal = clamp01(state.smoothBass);
    var energyVal = clamp01(state.smoothEnergy);

    if (state.mat) {
      state.mat.uniforms.uTime.value = time;
      state.mat.uniforms.uBeat.value = beatFlash;
      state.mat.uniforms.uSize.value = 0.24 * sizeScale;  // 像素块：~8px，清晰可辨（旧值 3.4 会导致 ~118px 重叠成一团）
      state.mat.uniforms.uPixelRatio.value = dpr;
      state.mat.uniforms.uOpacity.value = state.opacity;
      state.mat.uniforms.uBass.value = bassVal;
      state.mat.uniforms.uEnergy.value = energyVal;
      state.mat.uniforms.uAnimMode.value = state.animMode;
    }
    if (state.bgMat) {
      state.bgMat.uniforms.uTime.value = time;
      state.bgMat.uniforms.uBeat.value = beatFlash;
      state.bgMat.uniforms.uPixelRatio.value = dpr;
      state.bgMat.uniforms.uOpacity.value = state.opacity;
      var bgMode = (fx && fx.pixelKaomojiBgMode) || DEFAULT_BG_MODE;
      if (state.bgPoints) state.bgPoints.visible = bgMode !== 'none';
    }
    if (state.emojiMat) {
      state.emojiMat.uniforms.uTime.value = time;
      state.emojiMat.uniforms.uBeat.value = beatFlash;
      state.emojiMat.uniforms.uSize.value = 0.34 * sizeScale;  // 像素表情块
      state.emojiMat.uniforms.uPixelRatio.value = dpr;
      state.emojiMat.uniforms.uOpacity.value = state.opacity * 0.9;
      state.emojiMat.uniforms.uBass.value = bassVal;
      state.emojiMat.uniforms.uEnergy.value = energyVal;
      state.emojiMat.uniforms.uAnimMode.value = state.animMode;
    }

    if (state.root) {
      state.root.position.y = Math.sin(time * 0.7) * 0.10 + Math.sin(time * 1.3) * 0.05 + beatFlash * 0.06;
      state.root.position.x = Math.sin(time * 0.45) * 0.06;
    }
    if (state.root && context.visualRotation) state.root.rotation.copy(context.visualRotation);
  }

  global.MOMusicPixelKaomoji = {
    INDEX: INDEX,
    isActive: isActive,
    onPresetChange: onPresetChange,
    update: update,
    resyncLyricFont: function () {
      if (typeof global.fx === 'object' && global.fx) syncPixelLyricFont(global.fx);
    }
  };

})(typeof window !== 'undefined' ? window : globalThis);