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

async function submitCustomSourceImport(mode) {
  var textArea = document.getElementById('cs-import-textarea');
  var urlInput = document.getElementById('cs-import-url');
  var fileInput = document.getElementById('cs-import-file');
  var submitBtn = document.getElementById('cs-import-submit');
  var script = '';
  if (mode === 'text') {
    script = (textArea && textArea.value || '').trim();
    if (!script) { if (typeof showToast === 'function') showToast('请粘贴脚本内容'); return; }
  } else if (mode === 'url') {
    var u = (urlInput && urlInput.value || '').trim();
    if (!u) { if (typeof showToast === 'function') showToast('请输入 URL'); return; }
    if (!/^https?:\/\//.test(u)) { if (typeof showToast === 'function') showToast('URL 无效'); return; }
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '拉取中…'; }
    var fetchResp = await fetchCustomLxScript(u);
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '导入'; }
    if (!fetchResp.ok) { if (typeof showToast === 'function') showToast('拉取失败: ' + (fetchResp.error || '未知错误')); return; }
    script = fetchResp.script || '';
    if (!script) { if (typeof showToast === 'function') showToast('拉取到的脚本为空'); return; }
  } else if (mode === 'file') {
    var file = fileInput && fileInput.files && fileInput.files[0];
    if (!file) { if (typeof showToast === 'function') showToast('请选择 .js 文件'); return; }
    if (file.size > 9 * 1024 * 1024) { if (typeof showToast === 'function') showToast('文件过大 (超过 9MB)'); return; }
    script = await new Promise(function (resolve) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = function () { resolve(''); };
      reader.readAsText(file);
    });
    if (!script) { if (typeof showToast === 'function') showToast('读取文件失败'); return; }
  }
  // 测试脚本
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
      var textWrap = document.getElementById('cs-import-text-wrap');
      var urlWrap = document.getElementById('cs-import-url-wrap');
      var fileWrap = document.getElementById('cs-import-file-wrap');
      var mode = textWrap && !textWrap.hidden ? 'text' : (urlWrap && !urlWrap.hidden ? 'url' : 'file');
      submitCustomSourceImport(mode);
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
