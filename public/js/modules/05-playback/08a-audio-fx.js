// ============================================================
//  自定义音效（EQ10 + 低音增强 + 立体声扩展）
//  插入点：initAudio() 的 source → analyser 之间。
//  MediaElementSource 模式下音效链生效；captureStream 回退
//  模式没有 DSP 路径（analysisSink 增益为 0，声音直接从媒体
//  元素输出），此时音效自动旁路并在 UI 提示。
// ============================================================
var AUDIO_FX_STORE_KEY = 'MOMusic-audio-fx-v1';
var AUDIO_FX_BAND_FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
var AUDIO_FX_PRESETS = {
  flat: { label: '平直', gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  pop: { label: '流行', gains: [-1, 1, 3, 4, 3, 1, -1, -1, 1, 2] },
  rock: { label: '摇滚', gains: [5, 4, 3, 1, -1, -1, 1, 3, 4, 5] },
  jazz: { label: '爵士', gains: [3, 2, 1, 2, -1, -1, 0, 1, 2, 3] },
  classic: { label: '古典', gains: [4, 3, 1, 0, -1, 0, 1, 1, 3, 4] },
  electro: { label: '电子', gains: [5, 4, 1, 0, -2, 1, 1, 2, 4, 5] },
  vocal: { label: '人声', gains: [-2, -2, -1, 2, 4, 4, 3, 1, -1, -2] },
  bass: { label: '低音增强', gains: [7, 6, 4, 2, 0, 0, 0, 0, 0, 0] }
};
var audioFxState = {
  enabled: false,
  preset: 'flat',
  gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  bass: 0,
  width: 100
};
var audioFx = { chain: null, ctx: null, wiredSource: null, chainActive: false, captureMode: false };

function readAudioFxPreference() {
  try {
    var raw = localStorage.getItem(AUDIO_FX_STORE_KEY);
    if (!raw) return;
    var saved = JSON.parse(raw);
    if (typeof saved.enabled === 'boolean') audioFxState.enabled = saved.enabled;
    if (saved.preset && AUDIO_FX_PRESETS[saved.preset]) audioFxState.preset = saved.preset;
    if (Array.isArray(saved.gains) && saved.gains.length === AUDIO_FX_BAND_FREQS.length) {
      audioFxState.gains = saved.gains.map(function (v) { return Math.max(-12, Math.min(12, Number(v) || 0)); });
    }
    audioFxState.bass = Math.max(0, Math.min(12, Number(saved.bass) || 0));
    audioFxState.width = Math.max(0, Math.min(200, Number(saved.width) || 100));
  } catch (e) { }
}

function saveAudioFxPreference() {
  try {
    localStorage.setItem(AUDIO_FX_STORE_KEY, JSON.stringify({
      enabled: audioFxState.enabled,
      preset: audioFxState.preset,
      gains: audioFxState.gains,
      bass: audioFxState.bass,
      width: audioFxState.width
    }));
  } catch (e) { }
}

function ensureAudioFxChainNodes() {
  if (!audioCtx || audioCtx.state === 'closed') return null;
  if (audioFx.chain && audioFx.ctx === audioCtx) return audioFx.chain;
  try {
    var input = audioCtx.createGain();
    var bass = audioCtx.createBiquadFilter();
    bass.type = 'lowshelf';
    bass.frequency.value = 90;
    bass.gain.value = 0;
    var bands = AUDIO_FX_BAND_FREQS.map(function (freq) {
      var filter = audioCtx.createBiquadFilter();
      filter.type = 'peaking';
      filter.frequency.value = freq;
      filter.Q.value = 1.1;
      filter.gain.value = 0;
      return filter;
    });
    // 立体声扩展：mid/side 分解。width=1（100%）时严格恒等。
    var splitter = audioCtx.createChannelSplitter(2);
    var midL = audioCtx.createGain(); midL.gain.value = 0.5;
    var midR = audioCtx.createGain(); midR.gain.value = 0.5;
    var midSum = audioCtx.createGain(); midSum.gain.value = 1;
    var sideL = audioCtx.createGain(); sideL.gain.value = 0.5;
    var sideR = audioCtx.createGain(); sideR.gain.value = -0.5;
    var sideSum = audioCtx.createGain(); sideSum.gain.value = audioFxState.width / 100;
    var sideNeg = audioCtx.createGain(); sideNeg.gain.value = -1;
    var merger = audioCtx.createChannelMerger(2);
    var output = audioCtx.createGain(); output.gain.value = 1;

    input.connect(bass);
    var prev = bass;
    bands.forEach(function (filter) {
      prev.connect(filter);
      prev = filter;
    });
    prev.connect(splitter);
    splitter.connect(midL, 0);
    splitter.connect(midR, 1);
    midL.connect(midSum);
    midR.connect(midSum);
    splitter.connect(sideL, 0);
    splitter.connect(sideR, 1);
    sideL.connect(sideSum);
    sideR.connect(sideSum);
    midSum.connect(merger, 0, 0);
    midSum.connect(merger, 0, 1);
    sideSum.connect(merger, 0, 0);
    sideSum.connect(sideNeg);
    sideNeg.connect(merger, 0, 1);
    merger.connect(output);

    audioFx.chain = { input: input, bass: bass, bands: bands, sideSum: sideSum, output: output };
    audioFx.ctx = audioCtx;
    return audioFx.chain;
  } catch (e) {
    console.warn('audio fx chain unavailable:', e && (e.message || e));
    audioFx.chain = null;
    return null;
  }
}

function applyAudioFxChainParams() {
  var chain = audioFx.chain;
  if (!chain || !audioCtx || audioCtx.state === 'closed') return;
  try {
    var now = audioCtx.currentTime || 0;
    chain.bass.gain.setTargetAtTime(audioFxState.bass, now, 0.05);
    chain.bands.forEach(function (filter, index) {
      filter.gain.setTargetAtTime(Number(audioFxState.gains[index]) || 0, now, 0.05);
    });
    chain.sideSum.gain.setTargetAtTime(clampRange(audioFxState.width / 100, 0, 2), now, 0.05);
    // 正增益越大越容易在输出端削波，按峰值做轻微自动衰减
    var peak = Math.max(0, audioFxState.bass, Math.max.apply(null, audioFxState.gains.concat([0])));
    chain.output.gain.setTargetAtTime(1 / (1 + Math.max(0, peak - 4) / 22), now, 0.05);
  } catch (e) { }
}

function teardownAudioFxChainLinks() {
  var chain = audioFx.chain;
  if (chain) {
    if (audioFx.wiredSource) {
      try { audioFx.wiredSource.disconnect(chain.input); } catch (e) { }
    }
    try { chain.output.disconnect(); } catch (e) { }
  }
  audioFx.wiredSource = null;
  audioFx.chainActive = false;
}

function resetAudioFxGraphLinks() {
  teardownAudioFxChainLinks();
}

// initAudio() 在创建 source 后调用：返回应连接 analyser/beatAnalyser 的节点
function routeAudioFxSource(srcNode) {
  audioFx.wiredSource = srcNode || null;
  var capture = !!(srcNode && srcNode.__MOMusicUsesCapture);
  audioFx.captureMode = capture;
  teardownAudioFxChainLinks();
  if (!srcNode) return srcNode;
  if (audioFxState.enabled && !capture && audioCtx && audioCtx.state !== 'closed') {
    var chain = ensureAudioFxChainNodes();
    if (chain) {
      try {
        srcNode.connect(chain.input);
        audioFx.chainActive = true;
        applyAudioFxChainParams();
        return chain.output;
      } catch (e) {
        audioFx.chainActive = false;
      }
    }
  }
  return srcNode;
}

// 运行时开关/热更新：重建 source → analyser 的接线
function applyAudioFxRouting() {
  if (typeof source === 'undefined' || typeof analyser === 'undefined' || !source || !analyser) {
    updateAudioFxStatusUi();
    return;
  }
  var capture = !!source.__MOMusicUsesCapture;
  var wantFx = !!(audioFxState.enabled && !capture && audioCtx && audioCtx.state !== 'closed');
  if (!!audioFx.chainActive === wantFx && audioFx.wiredSource === source) {
    applyAudioFxChainParams();
    updateAudioFxStatusUi();
    return;
  }
  try { source.disconnect(analyser); } catch (e) { }
  try { source.disconnect(beatAnalyser); } catch (e) { }
  var head = routeAudioFxSource(source);
  try { head.connect(analyser); } catch (e) { }
  try { head.connect(beatAnalyser); } catch (e) { }
  updateAudioFxStatusUi();
}

// ============================================================
//  弹窗 UI
// ============================================================
function toggleAudioFxModal() {
  var mask = document.getElementById('audio-fx-modal');
  if (!mask) return;
  if (mask.classList.contains('show')) closeAudioFxModal();
  else openAudioFxModal();
}

function openAudioFxModal() {
  var mask = document.getElementById('audio-fx-modal');
  if (!mask) return;
  buildAudioFxModalControls();
  if (typeof openGsapModal === 'function') openGsapModal(mask);
  else mask.classList.add('show');
  updateAudioFxStatusUi();
}

function closeAudioFxModal() {
  var mask = document.getElementById('audio-fx-modal');
  if (!mask) return;
  if (typeof closeGsapModal === 'function') closeGsapModal(mask);
  else mask.classList.remove('show');
}

function buildAudioFxModalControls() {
  var presetsWrap = document.getElementById('audio-fx-presets');
  if (presetsWrap && !presetsWrap.__audioFxBuilt) {
    presetsWrap.__audioFxBuilt = true;
    Object.keys(AUDIO_FX_PRESETS).forEach(function (key) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'audio-fx-preset';
      chip.setAttribute('data-preset', key);
      chip.textContent = AUDIO_FX_PRESETS[key].label;
      chip.addEventListener('click', function () { applyAudioFxPreset(key); });
      presetsWrap.appendChild(chip);
    });
  }
  var eqWrap = document.getElementById('audio-fx-eq');
  if (eqWrap && !eqWrap.__audioFxBuilt) {
    eqWrap.__audioFxBuilt = true;
    AUDIO_FX_BAND_FREQS.forEach(function (freq, index) {
      var band = document.createElement('div');
      band.className = 'audio-fx-band';
      var value = document.createElement('div');
      value.className = 'audio-fx-band-value';
      value.id = 'audio-fx-band-value-' + index;
      var slider = document.createElement('input');
      slider.type = 'range';
      slider.min = -12;
      slider.max = 12;
      slider.step = 1;
      slider.setAttribute('aria-label', freq >= 1000 ? (freq / 1000) + 'kHz' : freq + 'Hz');
      slider.addEventListener('input', function () { setAudioFxBandGain(index, slider.value); });
      slider.addEventListener('dblclick', function () {
        slider.value = 0;
        setAudioFxBandGain(index, 0);
      });
      var freqLabel = document.createElement('div');
      freqLabel.className = 'audio-fx-band-freq';
      freqLabel.textContent = freq >= 1000 ? (freq / 1000) + 'k' : String(freq);
      band.appendChild(value);
      band.appendChild(slider);
      band.appendChild(freqLabel);
      eqWrap.appendChild(band);
    });
  }
  syncAudioFxModalControls();
}

function syncAudioFxModalControls() {
  var switchBtn = document.getElementById('audio-fx-switch');
  if (switchBtn) {
    switchBtn.classList.toggle('on', !!audioFxState.enabled);
    switchBtn.setAttribute('aria-checked', audioFxState.enabled ? 'true' : 'false');
  }
  var bassSlider = document.getElementById('audio-fx-bass');
  if (bassSlider) bassSlider.value = audioFxState.bass;
  var widthSlider = document.getElementById('audio-fx-width');
  if (widthSlider) widthSlider.value = audioFxState.width;
  var eqWrap = document.getElementById('audio-fx-eq');
  if (eqWrap) {
    Array.prototype.forEach.call(eqWrap.querySelectorAll('input[type=range]'), function (slider, index) {
      slider.value = Number(audioFxState.gains[index]) || 0;
    });
  }
  AUDIO_FX_BAND_FREQS.forEach(function (freq, index) {
    var label = document.getElementById('audio-fx-band-value-' + index);
    if (label) {
      var v = Math.round(Number(audioFxState.gains[index]) || 0);
      label.textContent = (v > 0 ? '+' : '') + v;
    }
  });
  var bassLabel = document.getElementById('audio-fx-bass-value');
  if (bassLabel) bassLabel.textContent = Math.round(audioFxState.bass) + 'dB';
  var widthLabel = document.getElementById('audio-fx-width-value');
  if (widthLabel) widthLabel.textContent = Math.round(audioFxState.width) + '%';
  var presetWrap = document.getElementById('audio-fx-presets');
  if (presetWrap) {
    Array.prototype.forEach.call(presetWrap.querySelectorAll('.audio-fx-preset'), function (chip) {
      chip.classList.toggle('active', chip.getAttribute('data-preset') === audioFxState.preset);
    });
  }
  updateAudioFxStatusUi();
}

function updateAudioFxStatusUi() {
  var status = document.getElementById('audio-fx-status');
  if (status) {
    var text;
    var kind;
    if (!audioFxState.enabled) {
      text = '未启用';
      kind = '';
    } else if (audioFx.chainActive) {
      text = '已启用 · 实时生效';
      kind = 'on';
    } else if (audioFx.captureMode) {
      text = '直连回退模式，音效暂不可用';
      kind = 'warn';
    } else {
      text = '已启用 · 开始播放后生效';
      kind = 'on';
    }
    status.textContent = text;
    status.className = 'audio-fx-status' + (kind ? ' ' + kind : '');
  }
  updateAudioFxButtonUi();
}

function updateAudioFxButtonUi() {
  var btn = document.getElementById('audio-fx-btn');
  if (!btn) return;
  btn.classList.toggle('audio-fx-on', !!audioFxState.enabled);
  btn.setAttribute('aria-pressed', audioFxState.enabled ? 'true' : 'false');
  btn.title = audioFxState.enabled ? '自定义音效：已开启' : '自定义音效';
}

function setAudioFxEnabled(value) {
  audioFxState.enabled = !!value;
  saveAudioFxPreference();
  applyAudioFxRouting();
  syncAudioFxModalControls();
  showToast(audioFxState.enabled ? '自定义音效已开启' : '自定义音效已关闭');
}

function applyAudioFxPreset(key) {
  var preset = AUDIO_FX_PRESETS[key];
  if (!preset) return;
  audioFxState.preset = key;
  audioFxState.gains = preset.gains.slice();
  saveAudioFxPreference();
  applyAudioFxChainParams();
  syncAudioFxModalControls();
  if (audioFxState.enabled) showToast('已应用「' + preset.label + '」预设');
}

function setAudioFxBandGain(index, value) {
  if (!(index >= 0 && index < AUDIO_FX_BAND_FREQS.length)) return;
  audioFxState.gains[index] = Math.max(-12, Math.min(12, Number(value) || 0));
  audioFxState.preset = 'custom';
  saveAudioFxPreference();
  applyAudioFxChainParams();
  var label = document.getElementById('audio-fx-band-value-' + index);
  if (label) {
    var v = Math.round(audioFxState.gains[index]);
    label.textContent = (v > 0 ? '+' : '') + v;
  }
  var presetWrap = document.getElementById('audio-fx-presets');
  if (presetWrap) {
    Array.prototype.forEach.call(presetWrap.querySelectorAll('.audio-fx-preset'), function (chip) {
      chip.classList.remove('active');
    });
  }
}

function setAudioFxBass(value) {
  audioFxState.bass = Math.max(0, Math.min(12, Number(value) || 0));
  audioFxState.preset = 'custom';
  saveAudioFxPreference();
  applyAudioFxChainParams();
  var label = document.getElementById('audio-fx-bass-value');
  if (label) label.textContent = Math.round(audioFxState.bass) + 'dB';
}

function setAudioFxWidth(value) {
  audioFxState.width = Math.max(0, Math.min(200, Number(value) || 100));
  audioFxState.preset = 'custom';
  saveAudioFxPreference();
  applyAudioFxChainParams();
  var label = document.getElementById('audio-fx-width-value');
  if (label) label.textContent = Math.round(audioFxState.width) + '%';
}

function resetAudioFxAll() {
  audioFxState.preset = 'flat';
  audioFxState.gains = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  audioFxState.bass = 0;
  audioFxState.width = 100;
  saveAudioFxPreference();
  applyAudioFxChainParams();
  syncAudioFxModalControls();
  showToast('音效参数已重置');
}

function bindAudioFxModalShell() {
  var mask = document.getElementById('audio-fx-modal');
  if (mask && !mask.__audioFxBackdropBound) {
    mask.__audioFxBackdropBound = true;
    mask.addEventListener('click', function (e) {
      if (e.target === mask) closeAudioFxModal();
    });
  }
  if (!document.__audioFxKeyBound) {
    document.__audioFxKeyBound = true;
    document.addEventListener('keydown', function (e) {
      if (!e || (e.key !== 'Escape' && e.key !== 'Esc')) return;
      var overlay = document.getElementById('audio-fx-modal');
      if (overlay && overlay.classList.contains('show')) closeAudioFxModal();
    });
  }
}

readAudioFxPreference();
updateAudioFxButtonUi();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () {
    updateAudioFxButtonUi();
    bindAudioFxModalShell();
  });
} else {
  updateAudioFxButtonUi();
  bindAudioFxModalShell();
}
