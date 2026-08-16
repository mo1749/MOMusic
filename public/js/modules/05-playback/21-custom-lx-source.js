'use strict';

// ============================================================
// 自定义音源管理 (落雪协议脚本)
// 存储: localStorage 独立 key,不走 saveLyricLayout (脚本可能很大)
// 接入: ls 音源播放/歌词时,链式回退到启用的自定义音源
// ============================================================

var CUSTOM_LX_SOURCE_STORAGE_KEY = 'momusic_custom_lx_sources';
var customLxSources = []; // [{ id, name, description, author, version, homepage, script, enabled, addedAt }]

// ---- 存储 ----
function loadCustomLxSources() {
  try {
    var raw = localStorage.getItem(CUSTOM_LX_SOURCE_STORAGE_KEY);
    if (!raw) { customLxSources = []; return; }
    var arr = JSON.parse(raw);
    customLxSources = Array.isArray(arr) ? arr : [];
  } catch (e) {
    customLxSources = [];
  }
}

function saveCustomLxSources() {
  try {
    localStorage.setItem(CUSTOM_LX_SOURCE_STORAGE_KEY, JSON.stringify(customLxSources));
  } catch (e) {
    // 存储满或不可用时静默失败
    if (typeof showToast === 'function') showToast('自定义音源保存失败: 存储空间不足');
  }
}

function genCustomLxSourceId() {
  return 'cls_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

// ---- 查询 ----
function getCustomLxSources() {
  return customLxSources.slice();
}

// 返回启用的音源脚本列表 (按优先级顺序),供播放/歌词请求使用
function getEnabledCustomLxScripts() {
  return customLxSources
    .filter(function (s) { return !!s.enabled && !!s.script; })
    .map(function (s) { return { id: s.id, script: s.script }; });
}

// ---- 增删改 ----
function addCustomLxSource(script, info) {
  if (!script || typeof script !== 'string') return null;
  // 限制最多 20 个 (与落雪一致)
  if (customLxSources.length >= 20) {
    if (typeof showToast === 'function') showToast('最多 20 个自定义音源');
    return null;
  }
  var item = {
    id: genCustomLxSourceId(),
    name: (info && info.name) || '未命名音源',
    description: (info && info.description) || '',
    author: (info && info.author) || '',
    version: (info && info.version) || '',
    homepage: (info && info.homepage) || '',
    script: script,
    enabled: true, // 默认启用
    addedAt: Date.now(),
  };
  customLxSources.push(item);
  saveCustomLxSources();
  return item;
}

function removeCustomLxSource(id) {
  var idx = customLxSources.findIndex(function (s) { return s.id === id; });
  if (idx < 0) return false;
  customLxSources.splice(idx, 1);
  saveCustomLxSources();
  return true;
}

function toggleCustomLxSource(id) {
  var item = customLxSources.find(function (s) { return s.id === id; });
  if (!item) return false;
  item.enabled = !item.enabled;
  saveCustomLxSources();
  return item.enabled;
}

function moveCustomLxSource(id, direction) {
  var idx = customLxSources.findIndex(function (s) { return s.id === id; });
  if (idx < 0) return false;
  if (direction === 'up' && idx > 0) {
    var tmp = customLxSources[idx - 1];
    customLxSources[idx - 1] = customLxSources[idx];
    customLxSources[idx] = tmp;
    saveCustomLxSources();
    return true;
  }
  if (direction === 'down' && idx < customLxSources.length - 1) {
    var tmp2 = customLxSources[idx + 1];
    customLxSources[idx + 1] = customLxSources[idx];
    customLxSources[idx] = tmp2;
    saveCustomLxSources();
    return true;
  }
  return false;
}

// ---- 导入流程 ----
// 测试脚本 (调用后端沙箱)
async function testCustomLxScript(script) {
  try {
    var resp = await fetch('/api/ls/custom-source/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ script: script }),
    });
    return await resp.json();
  } catch (e) {
    return { ok: false, error: e.message || '网络错误' };
  }
}

// 在线URL拉取脚本
async function fetchCustomLxScript(url) {
  try {
    var resp = await fetch('/api/ls/custom-source/fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url }),
    });
    return await resp.json();
  } catch (e) {
    return { ok: false, error: e.message || '网络错误' };
  }
}

// ---- UI 渲染 ----
function renderCustomSourcePanel() {
  var list = document.getElementById('custom-source-list');
  if (!list) return;
  list.innerHTML = '';
  if (!customLxSources.length) {
    var empty = document.createElement('div');
    empty.className = 'custom-source-empty';
    empty.textContent = '暂无自定义音源 · 点击上方按钮导入';
    list.appendChild(empty);
    return;
  }
  customLxSources.forEach(function (item, idx) {
    var row = document.createElement('div');
    row.className = 'custom-source-row' + (item.enabled ? ' enabled' : '');
    row.dataset.id = item.id;

    var left = document.createElement('div');
    left.className = 'cs-row-info';
    var name = document.createElement('div');
    name.className = 'cs-row-name';
    name.textContent = item.name || '未命名';
    if (item.version) {
      var ver = document.createElement('span');
      ver.className = 'cs-row-ver';
      ver.textContent = 'v' + item.version;
      name.appendChild(ver);
    }
    var meta = document.createElement('div');
    meta.className = 'cs-row-meta';
    var parts = [];
    if (item.author) parts.push(item.author);
    if (item.description) parts.push(item.description);
    meta.textContent = parts.join(' · ') || '无描述';
    left.appendChild(name);
    left.appendChild(meta);

    var right = document.createElement('div');
    right.className = 'cs-row-actions';

    // 启用开关
    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'cs-toggle' + (item.enabled ? ' on' : '');
    toggle.textContent = item.enabled ? '已启用' : '已禁用';
    toggle.onclick = function () {
      toggleCustomLxSource(item.id);
      renderCustomSourcePanel();
    };
    right.appendChild(toggle);

    // 上移
    var upBtn = document.createElement('button');
    upBtn.type = 'button';
    upBtn.className = 'cs-move-btn';
    upBtn.textContent = '↑';
    upBtn.title = '上移 (提高优先级)';
    upBtn.disabled = idx === 0;
    upBtn.onclick = function () { moveCustomLxSource(item.id, 'up'); renderCustomSourcePanel(); };
    right.appendChild(upBtn);

    // 下移
    var downBtn = document.createElement('button');
    downBtn.type = 'button';
    downBtn.className = 'cs-move-btn';
    downBtn.textContent = '↓';
    downBtn.title = '下移 (降低优先级)';
    downBtn.disabled = idx === customLxSources.length - 1;
    downBtn.onclick = function () { moveCustomLxSource(item.id, 'down'); renderCustomSourcePanel(); };
    right.appendChild(downBtn);

    // 删除
    var delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'cs-del-btn';
    delBtn.textContent = '删除';
    delBtn.onclick = function () {
      if (!confirm('确定删除音源「' + (item.name || '未命名') + '」?')) return;
      removeCustomLxSource(item.id);
      renderCustomSourcePanel();
      if (typeof showToast === 'function') showToast('已删除');
    };
    right.appendChild(delBtn);

    row.appendChild(left);
    row.appendChild(right);
    list.appendChild(row);
  });
}

// ---- 导入弹窗 ----
function openCustomSourceImportDialog(mode) {
  mode = mode || 'text';
  var overlay = document.getElementById('custom-source-import-overlay');
  var textArea = document.getElementById('cs-import-textarea');
  var urlInput = document.getElementById('cs-import-url');
  var fileInput = document.getElementById('cs-import-file');
  var textWrap = document.getElementById('cs-import-text-wrap');
  var urlWrap = document.getElementById('cs-import-url-wrap');
  var fileWrap = document.getElementById('cs-import-file-wrap');
  var modeText = document.getElementById('cs-import-mode-text');
  var modeUrl = document.getElementById('cs-import-mode-url');
  var modeFile = document.getElementById('cs-import-mode-file');
  if (!overlay) return;
  // 切换模式
  textWrap.hidden = mode !== 'text';
  urlWrap.hidden = mode !== 'url';
  fileWrap.hidden = mode !== 'file';
  if (modeText) modeText.classList.toggle('active', mode === 'text');
  if (modeUrl) modeUrl.classList.toggle('active', mode === 'url');
  if (modeFile) modeFile.classList.toggle('active', mode === 'file');
  if (textArea && mode === 'text') textArea.value = '';
  if (urlInput && mode === 'url') urlInput.value = '';
  if (fileInput && mode === 'file') fileInput.value = '';
  overlay.hidden = false;
}

function closeCustomSourceImportDialog() {
  var overlay = document.getElementById('custom-source-import-overlay');
  if (overlay) overlay.hidden = true;
}

function currentImportMode() {
  var textWrap = document.getElementById('cs-import-text-wrap');
  var urlWrap = document.getElementById('cs-import-url-wrap');
  var fileWrap = document.getElementById('cs-import-file-wrap');
  if (urlWrap && !urlWrap.hidden) return 'url';
  if (fileWrap && !fileWrap.hidden) return 'file';
  return 'text';
}

// 从导入弹窗当前模式读取脚本内容 (不弹 toast, 供导入与试听验证共用)
async function readImportScriptContent(mode) {
  var textArea = document.getElementById('cs-import-textarea');
  var urlInput = document.getElementById('cs-import-url');
  var fileInput = document.getElementById('cs-import-file');
  if (mode === 'url') {
    var u = (urlInput && urlInput.value || '').trim();
    if (!u) return { ok: false, error: '请输入 URL' };
    if (!/^https?:\/\//.test(u)) return { ok: false, error: 'URL 无效' };
    var fetchResp = await fetchCustomLxScript(u);
    if (!fetchResp.ok) return { ok: false, error: '拉取失败: ' + (fetchResp.error || '未知错误') };
    var script = fetchResp.script || '';
    if (!script) return { ok: false, error: '拉取到的脚本为空' };
    return { ok: true, script: script };
  }
  if (mode === 'file') {
    var file = fileInput && fileInput.files && fileInput.files[0];
    if (!file) return { ok: false, error: '请选择 .js 文件' };
    if (file.size > 9 * 1024 * 1024) return { ok: false, error: '文件过大 (超过 9MB)' };
    var text = await new Promise(function (resolve) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = function () { resolve(''); };
      reader.readAsText(file);
    });
    if (!text) return { ok: false, error: '读取文件失败' };
    return { ok: true, script: text };
  }
  var pasted = (textArea && textArea.value || '').trim();
  if (!pasted) return { ok: false, error: '请粘贴脚本内容' };
  return { ok: true, script: pasted };
}

async function submitCustomSourceImport(mode) {
  var submitBtn = document.getElementById('cs-import-submit');
  var content = await readImportScriptContent(mode);
  if (!content.ok) { if (typeof showToast === 'function') showToast(content.error); return; }
  var script = content.script;
  // 测试脚本 (结构验证)
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '验证中…'; }
  var testResp = await testCustomLxScript(script);
  if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '导入'; }
  if (!testResp.ok) {
    if (typeof showToast === 'function') showToast('脚本验证失败: ' + (testResp.error || '未知错误'));
    return;
  }
  var info = testResp.info || {};
  var sources = testResp.sources || {};
  var sourceList = Object.keys(sources);
  if (!sourceList.length) {
    if (typeof showToast === 'function') showToast('脚本未声明任何支持的音源');
    return;
  }
  var item = addCustomLxSource(script, info);
  if (!item) return;
  closeCustomSourceImportDialog();
  renderCustomSourcePanel();
  if (typeof showToast === 'function') {
    showToast('已导入「' + item.name + '」· 支持: ' + sourceList.join(', '));
  }
}

// ---- 试听验证 (真实请求探测) ----

// 取一首测试歌: 优先当前播放歌曲, 否则 LS 搜索「晴天」取第一首
async function pickCustomLxProbeSong() {
  try {
    var cur = (typeof playQueue !== 'undefined' && Array.isArray(playQueue) && typeof currentIdx === 'number' && currentIdx >= 0) ? playQueue[currentIdx] : null;
    if (cur && (cur.mid || cur.songmid)) {
      return { songId: String(cur.mid || cur.songmid), source: 'qq', label: (cur.name || cur.title || '') + (cur.artist ? ' - ' + cur.artist : '') };
    }
  } catch (e) {}
  try {
    if (typeof apiJson === 'function') {
      var data = await apiJson('/api/ls/search?keywords=' + encodeURIComponent('晴天') + '&limit=8', { timeoutMs: 12000 });
      var songs = data && data.songs || [];
      var s = songs[0];
      if (s && (s.mid || s.songmid || s.id)) {
        return { songId: String(s.mid || s.songmid || s.id), source: 'qq', label: (s.name || s.title || '') + (s.artist ? ' - ' + s.artist : '') };
      }
    }
  } catch (e) {}
  return null;
}

// 试听验证: 结构验证 + 真实请求解析, 明确区分「自定义命中 / QQ 兜底 / 失败」
async function runCustomLxSourceProbe(opts) {
  opts = opts || {};
  var mode = opts.mode || 'text';
  var script = opts.script || '';
  var manualSongId = String(opts.songId || '').trim();
  var manualSource = String(opts.source || '').trim();
  var resultEl = document.getElementById('cs-verify-result');
  function setResult(html, kind) {
    if (resultEl) { resultEl.className = 'cs-verify-result ' + (kind || ''); resultEl.innerHTML = html; }
  }
  try {
    if (!script) {
      var content = await readImportScriptContent(mode);
      if (!content.ok) { setResult(content.error, 'fail'); return { ok: false, error: content.error }; }
      script = content.script;
    }
    setResult('结构验证中…', 'pending');
    var testResp = await testCustomLxScript(script);
    if (!testResp.ok) {
      setResult('结构验证失败: ' + (testResp.error || '未知错误'), 'fail');
      return { ok: false, error: testResp.error };
    }
    var sources = Object.keys(testResp.sources || {});
    // 自动模式仅能测 tx(QQ): 用「晴天」取 QQ songmid
    var otherSources = sources.filter(function (s) { return s !== 'tx' && s !== 'local'; });
    var otherHint = otherSources.length
      ? '；该脚本还声明 ' + otherSources.join('/') + '，可在下方填对应平台歌曲 ID 逐源验证'
      : '';
    var probe = null;
    if (manualSongId) {
      probe = { songId: manualSongId, source: manualSource || 'qq', label: '歌曲ID ' + manualSongId };
    } else if (sources.indexOf('tx') >= 0) {
      probe = await pickCustomLxProbeSong();
      if (!probe) {
        setResult('未取到测试歌曲, 可手动填写歌曲 ID 后点「用指定 ID 验证」', 'warn');
        return { ok: false, error: 'NO_PROBE_SONG' };
      }
    } else {
      setResult('脚本未声明 QQ(tx) 音源, 请手动填写 ' + sources.join('/') + ' 的歌曲 ID 验证', 'warn');
      return { ok: false, error: 'MANUAL_ID_REQUIRED' };
    }
    setResult('正在请求「' + probe.label + '」(' + probe.source + ')…', 'pending');
    var resp = await (await fetch('/api/ls/custom-source/url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ songId: probe.songId, source: probe.source, quality: '320k', probe: 1, scripts: [{ id: 'verify-probe', script: script }] })
    })).json();
    if (resp && resp.code === 0 && resp.from === 'custom-source' && resp.url) {
      var domain = '';
      try { domain = new URL(resp.url).hostname; } catch (e) {}
      setResult('✔ 验证通过：脚本解析出播放地址 (' + (domain || '直链') + ')' + (otherSources.length ? '；其它源 ' + otherSources.join('/') + ' 也可手动验证' : ''), 'ok');
      return { ok: true, url: resp.url, label: probe.label };
    }
    if (resp && resp.from === 'qq-direct') {
      setResult('⚠ ' + probe.source + ' 源脚本未解析成功，走了 QQ 直连兜底：' + ((resp && resp.msg) || '脚本对该歌曲无效') + otherHint, 'warn');
      return { ok: false, error: (resp && resp.msg) || 'qq-direct' };
    }
    if (resp && resp.from === 'probe') {
      setResult('✘ ' + probe.source + ' 源解析失败：脚本未解析出播放地址（验证模式，已跳过兜底）' + otherHint, 'fail');
      return { ok: false, error: (resp && resp.msg) || 'probe-failed' };
    }
    setResult('✘ 解析失败(' + probe.source + ')：' + ((resp && (resp.msg || resp.error)) || '未知错误') + otherHint, 'fail');
    return { ok: false, error: (resp && (resp.msg || resp.error)) || 'unknown' };
  } catch (e) {
    setResult('验证出错: ' + ((e && e.message) || e), 'fail');
    return { ok: false, error: (e && e.message) || 'error' };
  }
}

// ---- 初始化 ----
function initCustomLxSourcePanel() {
  loadCustomLxSources();
  renderCustomSourcePanel();
  // 绑定导入按钮
  var btnText = document.getElementById('cs-import-text-btn');
  var btnFile = document.getElementById('cs-import-file-btn');
  var btnUrl = document.getElementById('cs-import-url-btn');
  if (btnText) btnText.onclick = function () { openCustomSourceImportDialog('text'); };
  if (btnFile) btnFile.onclick = function () { openCustomSourceImportDialog('file'); };
  if (btnUrl) btnUrl.onclick = function () { openCustomSourceImportDialog('url'); };
  // 导入弹窗按钮
  var cancelBtn = document.getElementById('cs-import-cancel');
  var submitBtn = document.getElementById('cs-import-submit');
  var modeText = document.getElementById('cs-import-mode-text');
  var modeUrl = document.getElementById('cs-import-mode-url');
  var modeFile = document.getElementById('cs-import-mode-file');
  if (cancelBtn) cancelBtn.onclick = closeCustomSourceImportDialog;
  if (modeText) modeText.onclick = function () { openCustomSourceImportDialog('text'); };
  if (modeUrl) modeUrl.onclick = function () { openCustomSourceImportDialog('url'); };
  if (modeFile) modeFile.onclick = function () { openCustomSourceImportDialog('file'); };
  if (submitBtn) {
    submitBtn.onclick = function () {
      var overlay = document.getElementById('custom-source-import-overlay');
      if (!overlay || overlay.hidden) return;
      submitCustomSourceImport(currentImportMode());
    };
  }
  // 试听验证按钮
  var verifyBtn = document.getElementById('cs-import-verify');
  if (verifyBtn) {
    verifyBtn.onclick = function () { runCustomLxSourceProbe({ mode: currentImportMode() }); };
  }
  var verifyRunBtn = document.getElementById('cs-verify-run');
  if (verifyRunBtn) {
    verifyRunBtn.onclick = function () {
      var songIdInput = document.getElementById('cs-verify-songid');
      var sourceInput = document.getElementById('cs-verify-source');
      runCustomLxSourceProbe({
        mode: currentImportMode(),
        songId: songIdInput ? songIdInput.value : '',
        source: sourceInput ? sourceInput.value : '',
      });
    };
  }
  // 点击遮罩关闭
  var overlay = document.getElementById('custom-source-import-overlay');
  if (overlay) {
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeCustomSourceImportDialog();
    });
  }
}

// 暴露给全局
window.getCustomLxSources = getCustomLxSources;
window.getEnabledCustomLxScripts = getEnabledCustomLxScripts;
window.renderCustomSourcePanel = renderCustomSourcePanel;
window.initCustomLxSourcePanel = initCustomLxSourcePanel;
window.openCustomSourceImportDialog = openCustomSourceImportDialog;
window.closeCustomSourceImportDialog = closeCustomSourceImportDialog;

document.addEventListener('DOMContentLoaded', function () {
  loadCustomLxSources();
  // 延迟绑定,等待 HTML 渲染完成
  setTimeout(initCustomLxSourcePanel, 0);
});
