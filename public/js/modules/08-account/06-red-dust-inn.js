'use strict';

// 红尘客栈 · 本地模式交互
function applyRedDustInnUi() {
  var btn = document.getElementById('login-red-dust-inn-btn');
  var indicator = document.getElementById('rdi-toggle-indicator');
  var settings = document.getElementById('red-dust-inn-settings');
  var on = !!redDustInnState.enabled;
  if (btn) btn.classList.toggle('on', on);
  if (indicator) indicator.textContent = on ? '开' : '关';
  if (settings) settings.hidden = !on;

  var showcaseBtn = document.getElementById('rdi-showcase-toggle');
  if (showcaseBtn) {
    showcaseBtn.classList.toggle('on', !!redDustInnState.showcase);
    showcaseBtn.textContent = redDustInnState.showcase ? '展示✓' : '展示';
  }

  var preview = document.getElementById('rdi-avatar-preview');
  var clearBtn = document.getElementById('rdi-avatar-clear');
  if (preview) {
    if (redDustInnState.avatar) {
      preview.src = redDustInnState.avatar;
      preview.hidden = false;
    } else {
      preview.hidden = true;
      preview.removeAttribute('src');
    }
  }
  if (clearBtn) clearBtn.hidden = !redDustInnState.avatar;

  // 同步分类触发器显示
  var catName = document.getElementById('rdi-cat-name');
  if (catName) catName.textContent = redDustInnRadarCategory;
  // 同步弹层中选中态
  var grid = document.getElementById('rdi-cat-grid');
  if (grid) {
    Array.prototype.forEach.call(grid.querySelectorAll('.rdi-cat-item'), function (item) {
      item.classList.toggle('active', item.dataset.cat === redDustInnRadarCategory);
    });
  }
  document.body.classList.toggle('red-dust-inn-mode', on);
  document.body.classList.toggle('red-dust-inn-showcase', on && redDustInnState.showcase);
}

function buildRdiCategoryGrid() {
  var grid = document.getElementById('rdi-cat-grid');
  if (!grid || grid.childElementCount) return;
  RED_DUST_INN_CATEGORIES.forEach(function (cat) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rdi-cat-item';
    btn.dataset.cat = cat;
    btn.textContent = cat;
    btn.onclick = function () { setRedDustInnRadarCategory(cat); closeRdiCategoryPopover(); };
    grid.appendChild(btn);
  });
}

function positionRdiCategoryPopover() {
  var pop = document.getElementById('rdi-category-popover');
  var trig = document.getElementById('rdi-category-trigger');
  if (!pop || !trig || pop.hidden) return;
  var rect = trig.getBoundingClientRect();
  var popW = 280;
  var left = rect.left + rect.width / 2 - popW / 2;
  left = Math.max(8, Math.min(window.innerWidth - popW - 8, left));
  var top = rect.bottom + 8;
  // 如果下方放不下，弹到触发器上方
  var popH = pop.offsetHeight || 220;
  if (top + popH > window.innerHeight - 8) {
    top = Math.max(8, rect.top - popH - 8);
  }
  pop.style.left = left + 'px';
  pop.style.top = top + 'px';
}

function toggleRdiCategoryPopover() {
  var pop = document.getElementById('rdi-category-popover');
  var trig = document.getElementById('rdi-category-trigger');
  if (!pop || !trig) return;
  if (pop.hidden) {
    buildRdiCategoryGrid();
    pop.hidden = false;
    positionRdiCategoryPopover();
    trig.classList.add('open');
    setTimeout(function () {
      document.addEventListener('click', closeRdiCategoryPopoverOnOutside, true);
      window.addEventListener('scroll', closeRdiCategoryPopover, true);
      window.addEventListener('resize', positionRdiCategoryPopover);
    }, 0);
  } else {
    closeRdiCategoryPopover();
  }
}

function closeRdiCategoryPopover() {
  var pop = document.getElementById('rdi-category-popover');
  var trig = document.getElementById('rdi-category-trigger');
  if (pop) pop.hidden = true;
  if (trig) trig.classList.remove('open');
  document.removeEventListener('click', closeRdiCategoryPopoverOnOutside, true);
  window.removeEventListener('scroll', closeRdiCategoryPopover, true);
  window.removeEventListener('resize', positionRdiCategoryPopover);
}

function closeRdiCategoryPopoverOnOutside(e) {
  var pop = document.getElementById('rdi-category-popover');
  var trig = document.getElementById('rdi-category-trigger');
  if (pop && !pop.hidden && !pop.contains(e.target) && e.target !== trig && !trig.contains(e.target)) {
    closeRdiCategoryPopover();
  }
}

function toggleRedDustInnFromLogin() {
  redDustInnState.enabled = !redDustInnState.enabled;
  saveRedDustInnPreference();
  applyRedDustInnUi();
  if (typeof renderUserBtn === 'function') renderUserBtn();
  if (typeof renderHomeDashboardQuickCards === 'function') renderHomeDashboardQuickCards();
  showToast(redDustInnState.enabled ? '红尘客栈已开启 · 雷达模式' : '红尘客栈已关闭');
}

function toggleRedDustInnShowcase() {
  redDustInnState.showcase = !redDustInnState.showcase;
  saveRedDustInnPreference();
  applyRedDustInnUi();
  if (typeof renderUserBtn === 'function') renderUserBtn();
  showToast(redDustInnState.showcase ? '已展示红尘客栈' : '已隐藏红尘客栈');
}

function setRedDustInnRadarCategory(cat) {
  redDustInnRadarCategory = cat;
  redDustInnState.category = cat;
  saveRedDustInnPreference();
  showToast('雷达分类：' + cat);
}

function pickRedDustInnAvatar() {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = function () {
    var file = input.files && input.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { showToast('图片不能超过 2MB'); return; }
    var reader = new FileReader();
    reader.onload = function () {
      redDustInnState.avatar = String(reader.result || '');
      saveRedDustInnPreference();
      applyRedDustInnUi();
      if (typeof renderUserBtn === 'function') renderUserBtn();
      showToast('头像已更新');
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

function clearRedDustInnAvatar() {
  redDustInnState.avatar = '';
  saveRedDustInnPreference();
  applyRedDustInnUi();
  if (typeof renderUserBtn === 'function') renderUserBtn();
  showToast('头像已清除');
}

window.toggleRedDustInnFromLogin = toggleRedDustInnFromLogin;
window.toggleRedDustInnShowcase = toggleRedDustInnShowcase;
window.setRedDustInnRadarCategory = setRedDustInnRadarCategory;
window.pickRedDustInnAvatar = pickRedDustInnAvatar;
window.clearRedDustInnAvatar = clearRedDustInnAvatar;
window.applyRedDustInnUi = applyRedDustInnUi;
window.toggleRdiCategoryPopover = toggleRdiCategoryPopover;

// 把分类弹层移到 body 直接子节点下，
// 绕开 .dual-login-modal 的 backdrop-filter / overflow:auto 对 fixed 定位的干扰
function relocateRdiCategoryPopover() {
  var pop = document.getElementById('rdi-category-popover');
  if (pop && pop.parentNode && pop.parentNode !== document.body) {
    document.body.appendChild(pop);
  }
}

document.addEventListener('DOMContentLoaded', function () {
  relocateRdiCategoryPopover();
  applyRedDustInnUi();
});
