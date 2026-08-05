/**
 * MOMusic - 一起听 · 悬浮聊天系统
 *
 * 职责：
 * 1. 悬浮聊天框：自由拖动、松手吸附最近屏幕边缘、闲置自动收缩半隐藏
 * 2. 新消息弹丸提示条：从吸附边缘弹出（发送者 + 摘要），点击展开聊天框
 * 3. 共享气泡渲染器 window.LtChatBubbles：面板内聊天区与悬浮框共用
 *    （自己 → 右侧绿色气泡；他人 → 左侧蓝色气泡；头像 + 时间）
 *
 * 联动方式：监听 listen-together-ui.js 派发的 CustomEvent —
 *   lt:room-enter / lt:room-exit / lt:chat-render / lt:chat-live
 * 不直接注册 ListenTogether 回调（其 on() 为覆盖式单回调，避免抢占）。
 */
(function () {
  'use strict';

  var IDLE_DOCK_DELAY = 8000;      // 闲置多久后吸附半隐藏
  var TOAST_DURATION = 4500;       // 弹丸提示停留时长
  var TOAST_MAX = 3;               // 弹丸最大堆叠数
  var POS_KEY = 'ltfc_pos';        // 位置记忆

  // ─────────────────────────── 工具 ───────────────────────────

  function el(tag, cls, text) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (text != null) d.textContent = text;
    return d;
  }

  function fmtTime(ts) {
    var d = new Date(ts || Date.now());
    var h = d.getHours();
    var m = d.getMinutes();
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  /** 昵称哈希 → 稳定的头像底色 */
  function avatarBg(nickname) {
    var name = String(nickname || '客');
    var h = 0;
    for (var i = 0; i < name.length; i++) {
      h = (h * 31 + name.charCodeAt(i)) >>> 0;
    }
    var hue = h % 360;
    return 'linear-gradient(150deg, hsl(' + hue + ' 48% 46%), hsl(' + ((hue + 28) % 360) + ' 42% 32%))';
  }

  function avatarChar(nickname) {
    var name = String(nickname || '').trim();
    return name ? name.charAt(0).toUpperCase() : '客';
  }

  function loginBadgeEmoji(method) {
    if (method === 'email') return '📧';
    if (method === 'phone') return '📱';
    if (method === 'wechat') return '💚';
    if (method === 'qq') return '🐧';
    return '';
  }

  // ─────────────── 自定义头像 ───────────────

  /** 内置预设头像（emoji + 固定色相渐变底） */
  var AVATAR_PRESETS = [
    { id: 'fox',     emoji: '🦊', hue: 24  },
    { id: 'panda',   emoji: '🐼', hue: 150 },
    { id: 'frog',    emoji: '🐸', hue: 110 },
    { id: 'tiger',   emoji: '🐯', hue: 36  },
    { id: 'lion',    emoji: '🦁', hue: 45  },
    { id: 'rabbit',  emoji: '🐰', hue: 320 },
    { id: 'cat',     emoji: '🐱', hue: 265 },
    { id: 'dog',     emoji: '🐶', hue: 200 },
    { id: 'monkey',  emoji: '🐵', hue: 18  },
    { id: 'unicorn', emoji: '🦄', hue: 290 },
    { id: 'octopus', emoji: '🐙', hue: 350 },
    { id: 'penguin', emoji: '🐧', hue: 210 },
  ];

  function findPreset(id) {
    for (var i = 0; i < AVATAR_PRESETS.length; i++) {
      if (AVATAR_PRESETS[i].id === id) return AVATAR_PRESETS[i];
    }
    return null;
  }

  function presetBg(hue) {
    return 'linear-gradient(150deg, hsl(' + hue + ' 52% 48%), hsl(' + ((hue + 30) % 360) + ' 44% 34%))';
  }

  /**
   * 把头像内容填充进圆形元素（img / emoji / 首字，三级回退）。
   * 目标元素需带 .ltcb-avatar / .lttp-avatar / .lt-member-av 等基础类。
   */
  function fillAvatar(el, nickname, avatar) {
    if (!el) return;
    el.classList.remove('ltcb-avatar-img', 'ltcb-avatar-emoji');
    if (avatar && typeof avatar === 'string') {
      if (avatar.indexOf('data:image/') === 0) {
        el.textContent = '';
        var img = document.createElement('img');
        img.src = avatar;
        img.alt = '';
        img.draggable = false;
        el.appendChild(img);
        el.classList.add('ltcb-avatar-img');
        el.style.removeProperty('--ltcb-av-bg');
        el.style.removeProperty('--ltm-av-bg');
        return;
      }
      if (avatar.indexOf('preset:') === 0) {
        var p = findPreset(avatar.slice(7));
        if (p) {
          el.textContent = p.emoji;
          el.classList.add('ltcb-avatar-emoji');
          el.style.setProperty('--ltcb-av-bg', presetBg(p.hue));
          el.style.setProperty('--ltm-av-bg', presetBg(p.hue));
          return;
        }
      }
    }
    // 回退：昵称首字 + 哈希色
    el.textContent = avatarChar(nickname);
    el.style.setProperty('--ltcb-av-bg', avatarBg(nickname));
    el.style.setProperty('--ltm-av-bg', avatarBg(nickname));
  }

  function escapeHtmlStr(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /** 成员列表用的小头像 chip（HTML 字符串，已转义） */
  function avatarChipHtml(nickname, avatar) {
    var name = String(nickname || '客');
    if (avatar && typeof avatar === 'string') {
      if (avatar.indexOf('data:image/') === 0) {
        return '<span class="lt-member-av ltcb-avatar-img"><img src="' + avatar + '" alt="" draggable="false"></span>';
      }
      if (avatar.indexOf('preset:') === 0) {
        var p = findPreset(avatar.slice(7));
        if (p) {
          return '<span class="lt-member-av ltcb-avatar-emoji" style="--ltm-av-bg:' + presetBg(p.hue) + '">' + p.emoji + '</span>';
        }
      }
    }
    return '<span class="lt-member-av" style="--ltm-av-bg:' + avatarBg(name) + '">' +
      escapeHtmlStr(avatarChar(name)) + '</span>';
  }

  // ─────────────────── 共享气泡渲染器 ───────────────────

  /**
   * 把一条消息以气泡形式渲染进容器。
   * msg: { nickname, text, isSelf, loginMethod, ts, system }
   */
  function renderBubble(container, msg) {
    if (!container || !msg) return;

    if (msg.system) {
      var sys = el('div', 'ltcb-system', msg.text);
      container.appendChild(sys);
      return;
    }

    var row = el('div', 'ltcb-row ' + (msg.isSelf ? 'ltcb-self' : 'ltcb-other'));

    var avatar = el('div', 'ltcb-avatar');
    fillAvatar(avatar, msg.nickname, msg.avatar);
    var badge = loginBadgeEmoji(msg.loginMethod);
    if (badge) avatar.appendChild(el('span', 'ltcb-login-badge', badge));

    var main = el('div', 'ltcb-main');
    var meta = el('div', 'ltcb-meta');
    meta.appendChild(el('span', 'ltcb-nick', msg.isSelf ? '我' : String(msg.nickname || '游客')));
    meta.appendChild(el('span', 'ltcb-time', fmtTime(msg.ts)));
    var bubble = el('div', 'ltcb-bubble', String(msg.text || ''));

    main.appendChild(meta);
    main.appendChild(bubble);
    row.appendChild(avatar);
    row.appendChild(main);
    container.appendChild(row);
  }

  function scrollToBottom(container) {
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }

  window.LtChatBubbles = {
    renderInto: function (container, msg) {
      renderBubble(container, msg);
      scrollToBottom(container);
    },
    avatarChipHtml: avatarChipHtml,
    fillAvatar: fillAvatar,
    presets: AVATAR_PRESETS,
    presetBg: presetBg
  };

  // ─────────────────────── 悬浮聊天框 ───────────────────────

  var root = null;           // #lt-float-chat
  var headerTitle = null;
  var messagesEl = null;
  var inputEl = null;
  var unreadEl = null;
  var toastStack = null;

  var inRoom = false;
  var expanded = false;      // true=展开  false=docked 半隐藏
  var edge = 'right';        // 吸附边缘：left | right
  var unread = 0;
  var idleTimer = null;
  var hovering = false;
  var inputFocused = false;
  var dragging = false;
  var dragOffset = { x: 0, y: 0 };
  var dragMoved = false;

  function buildDom() {
    if (root) return;

    root = el('section');
    root.id = 'lt-float-chat';
    root.setAttribute('aria-label', '一起听悬浮聊天');

    // 头部（拖动区）
    var header = el('div', 'ltfc-header');
    header.appendChild(el('span', 'ltfc-header-pulse'));
    headerTitle = el('div', 'ltfc-header-title');
    headerTitle.innerHTML = '一起听 · 聊天<small>拖动我，靠边自动收起</small>';
    header.appendChild(headerTitle);

    var collapseBtn = el('button', 'ltfc-icon-btn', '›');
    collapseBtn.type = 'button';
    collapseBtn.title = '收起到边缘';
    collapseBtn.setAttribute('aria-label', '收起到边缘');
    collapseBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      dock();
    });
    header.appendChild(collapseBtn);
    root.appendChild(header);

    // 消息区
    messagesEl = el('div', 'ltfc-messages');
    root.appendChild(messagesEl);

    // 输入行
    var inputRow = el('div', 'ltfc-input-row');
    inputEl = el('input', 'ltfc-input');
    inputEl.type = 'text';
    inputEl.placeholder = '发条消息…';
    inputEl.maxLength = 200;
    inputEl.setAttribute('aria-label', '聊天输入');
    inputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') sendCurrent();
    });
    inputEl.addEventListener('focus', function () { inputFocused = true; poke(); });
    inputEl.addEventListener('blur', function () { inputFocused = false; scheduleIdle(); });

    var sendBtn = el('button', 'ltfc-send');
    sendBtn.type = 'button';
    sendBtn.title = '发送';
    sendBtn.setAttribute('aria-label', '发送消息');
    sendBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4Z"/></svg>';
    sendBtn.addEventListener('click', sendCurrent);

    inputRow.appendChild(inputEl);
    inputRow.appendChild(sendBtn);
    root.appendChild(inputRow);

    // 吸附把手（docked 时露出，可点击展开）
    var handle = el('div', 'ltfc-edge-handle');
    handle.appendChild(el('span', 'ltfc-edge-dot'));
    handle.appendChild(el('span', 'ltfc-edge-glyph', '一起听'));
    unreadEl = el('span', 'ltfc-unread');
    handle.appendChild(unreadEl);
    handle.addEventListener('pointerdown', function () { dragMoved = false; });
    handle.addEventListener('click', function () {
      if (!dragMoved) expand();
    });
    root.appendChild(handle);

    document.body.appendChild(root);

    // 弹丸提示容器
    toastStack = el('div');
    toastStack.id = 'lt-toast-stack';
    toastStack.className = 'ltts-right';
    document.body.appendChild(toastStack);

    bindDrag(header);
    bindHover();
    window.addEventListener('resize', clampIntoViewport);
  }

  // ─────────────── 拖动 + 边缘吸附 ───────────────

  function bindDrag(handleEl) {
    handleEl.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      // 头部内的交互控件（收起按钮等）不进入拖拽：setPointerCapture 会把 click 重定向到头部，
      // 导致按钮的 click 处理器永远不触发（吸附隐藏按钮失效）。
      if (e.target && e.target.closest && e.target.closest('button, input, textarea, select, a, [role="button"]')) return;
      dragging = true;
      dragMoved = false;
      root.classList.add('ltfc-dragging');
      // 从 docked 状态拖出时先展开到指针位置
      if (!expanded) {
        removeDockClasses();
        expanded = true;
        var r0 = root.getBoundingClientRect();
        if (edge === 'left') root.style.left = '0px';
        else root.style.left = (window.innerWidth - r0.width) + 'px';
      }
      var r = root.getBoundingClientRect();
      dragOffset.x = e.clientX - r.left;
      dragOffset.y = e.clientY - r.top;
      try { handleEl.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault();
    });

    handleEl.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      dragMoved = true;
      var w = root.offsetWidth;
      var h = root.offsetHeight;
      var x = e.clientX - dragOffset.x;
      var y = e.clientY - dragOffset.y;
      x = Math.max(-w * 0.4, Math.min(window.innerWidth - w * 0.6, x));
      y = Math.max(8, Math.min(window.innerHeight - Math.min(h, 120), y));
      root.style.left = x + 'px';
      root.style.top = y + 'px';
    });

    function endDrag() {
      if (!dragging) return;
      dragging = false;
      root.classList.remove('ltfc-dragging');
      if (dragMoved) snapToNearestEdge();
      savePos();
      poke();
    }
    handleEl.addEventListener('pointerup', endDrag);
    handleEl.addEventListener('pointercancel', endDrag);
  }

  /** 松手后吸附最近一侧边缘（保持展开，闲置后再收缩） */
  function snapToNearestEdge() {
    var r = root.getBoundingClientRect();
    var centerX = r.left + r.width / 2;
    edge = centerX < window.innerWidth / 2 ? 'left' : 'right';
    root.style.left = edge === 'left' ? '0px' : (window.innerWidth - r.width) + 'px';
    root.style.top = Math.max(8, Math.min(window.innerHeight - 80, r.top)) + 'px';
    toastStack.className = edge === 'left' ? 'ltts-left' : 'ltts-right';
  }

  function removeDockClasses() {
    root.classList.remove('ltfc-dock-left', 'ltfc-dock-right', 'ltfc-peek');
  }

  function clampIntoViewport() {
    if (!root || !inRoom) return;
    var w = root.offsetWidth;
    var r = root.getBoundingClientRect();
    if (!expanded) {
      root.style.left = edge === 'left' ? '0px' : (window.innerWidth - w) + 'px';
      return;
    }
    var x = Math.max(0, Math.min(window.innerWidth - w, r.left));
    var y = Math.max(8, Math.min(window.innerHeight - 80, r.top));
    root.style.left = x + 'px';
    root.style.top = y + 'px';
  }

  function savePos() {
    try {
      var r = root.getBoundingClientRect();
      localStorage.setItem(POS_KEY, JSON.stringify({
        edge: edge,
        top: Math.round(r.top),
        expanded: expanded
      }));
    } catch (_) {}
  }

  function restorePos() {
    var pos = null;
    try { pos = JSON.parse(localStorage.getItem(POS_KEY) || 'null'); } catch (_) {}
    var w = root.offsetWidth;
    edge = pos && pos.edge === 'left' ? 'left' : 'right';
    var top = pos && typeof pos.top === 'number' ? pos.top : Math.round(window.innerHeight * 0.16);
    top = Math.max(8, Math.min(window.innerHeight - 120, top));
    root.style.left = edge === 'left' ? '0px' : (window.innerWidth - w) + 'px';
    root.style.top = top + 'px';
    toastStack.className = edge === 'left' ? 'ltts-left' : 'ltts-right';
  }

  // ─────────────── 展开 / 收缩（docked） ───────────────

  function expand() {
    if (!inRoom || !root) return;
    expanded = true;
    removeDockClasses();
    clearUnread();
    clearToasts();   // 展开后滞留的提示条已无必要
    poke();
    savePos();
  }

  function dock() {
    if (!inRoom || !root || dragging) return;
    expanded = false;
    root.classList.remove('ltfc-peek');
    root.classList.add(edge === 'left' ? 'ltfc-dock-left' : 'ltfc-dock-right');
    savePos();
  }

  function scheduleIdle() {
    if (idleTimer) clearTimeout(idleTimer);
    if (!inRoom || !expanded) return;
    idleTimer = setTimeout(function () {
      if (expanded && !hovering && !inputFocused && !dragging) dock();
    }, IDLE_DOCK_DELAY);
  }

  /** 有交互活动时重置闲置计时 */
  function poke() {
    scheduleIdle();
  }

  function bindHover() {
    root.addEventListener('mouseenter', function () {
      hovering = true;
      if (!expanded) root.classList.add('ltfc-peek');
      poke();
    });
    root.addEventListener('mouseleave', function () {
      hovering = false;
      root.classList.remove('ltfc-peek');
      scheduleIdle();
    });
    root.addEventListener('pointerdown', poke, true);
    root.addEventListener('wheel', poke, { passive: true });
  }

  // ─────────────── 未读角标 ───────────────

  function bumpUnread() {
    unread++;
    unreadEl.textContent = unread > 99 ? '99+' : String(unread);
    unreadEl.classList.remove('ltfc-has-unread');
    // 强制重排以重放弹出动画
    void unreadEl.offsetWidth;
    unreadEl.classList.add('ltfc-has-unread');
  }

  function clearUnread() {
    unread = 0;
    unreadEl.classList.remove('ltfc-has-unread');
  }

  // ─────────────── 弹丸提示条 ───────────────

  function showToastPill(msg) {
    if (!toastStack) return;
    // 提示条与悬浮框同侧、同高度区域弹出
    if (root && inRoom) {
      var fr = root.getBoundingClientRect();
      var stackTop = Math.max(12, Math.min(window.innerHeight - 120, fr.top + 6));
      toastStack.style.top = stackTop + 'px';
    }
    // 超出堆叠上限时移除最旧的一条
    while (toastStack.children.length >= TOAST_MAX) {
      toastStack.removeChild(toastStack.firstChild);
    }

    var pill = el('div', 'lt-toast-pill');
    pill.setAttribute('role', 'button');
    pill.tabIndex = 0;

    var avatar = el('div', 'lttp-avatar');
    fillAvatar(avatar, msg.nickname, msg.avatar);

    var body = el('div', 'lttp-body');
    body.appendChild(el('span', 'lttp-nick', String(msg.nickname || '游客')));
    var text = String(msg.text || '');
    if (text.length > 40) text = text.slice(0, 40) + '…';
    body.appendChild(el('span', 'lttp-text', text));

    pill.appendChild(avatar);
    pill.appendChild(body);
    pill.appendChild(el('span', 'lttp-hint', '点击展开'));

    var dismissTimer = setTimeout(dismiss, TOAST_DURATION);
    function dismiss() {
      clearTimeout(dismissTimer);
      pill.classList.add('lttp-out');
      setTimeout(function () {
        if (pill.parentNode) pill.parentNode.removeChild(pill);
      }, 320);
    }
    function openFromPill() {
      dismiss();
      expand();
      scrollToBottom(messagesEl);
      if (inputEl) inputEl.focus();
    }
    pill.addEventListener('click', openFromPill);
    pill.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFromPill(); }
    });

    toastStack.appendChild(pill);
    // 强制重排后滑入
    void pill.offsetWidth;
    pill.classList.add('lttp-in');
  }

  function clearToasts() {
    if (!toastStack) return;
    toastStack.innerHTML = '';
  }

  // ─────────────── 发送 ───────────────

  function sendCurrent() {
    if (!inputEl) return;
    var text = inputEl.value.trim();
    if (!text) return;
    var LT = window.ListenTogether;
    if (!LT || !LT.isConnected || !LT.currentRoom) return;
    LT.sendChat(text);   // 自己的消息由服务器回广播后统一渲染，保持与面板一致
    inputEl.value = '';
    inputEl.focus();
    poke();
  }

  // ─────────────── 房间生命周期 ───────────────

  function enterRoom(detail) {
    buildDom();
    inRoom = true;
    unread = 0;
    messagesEl.innerHTML = '';
    clearToasts();

    var roomName = detail && detail.roomName ? detail.roomName : '一起听';
    headerTitle.innerHTML = '';
    headerTitle.appendChild(document.createTextNode(roomName + ' · 聊天'));
    var sub = el('small', null, '拖动我，靠边自动收起');
    headerTitle.appendChild(sub);

    restorePos();
    removeDockClasses();
    expanded = true;
    // 下一帧再显示，保证初始定位已生效、过渡平滑
    requestAnimationFrame(function () {
      root.classList.add('ltfc-visible');
    });

    renderBubble(messagesEl, { system: true, text: '已进入房间，和朋友们打个招呼吧 🎧' });
    poke();
  }

  function exitRoom() {
    inRoom = false;
    expanded = false;
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    if (root) {
      root.classList.remove('ltfc-visible', 'ltfc-peek');
      removeDockClasses();
    }
    clearToasts();
    clearUnread();
  }

  // ─────────────── 事件桥接 ───────────────

  window.addEventListener('lt:room-enter', function (e) {
    enterRoom(e.detail || {});
  });

  window.addEventListener('lt:room-exit', function () {
    exitRoom();
  });

  window.addEventListener('lt:chat-render', function (e) {
    if (!inRoom || !messagesEl) return;
    renderBubble(messagesEl, e.detail || {});
    // 展开时跟随滚动；docked 时不打断用户阅读位置
    if (expanded) scrollToBottom(messagesEl);
  });

  window.addEventListener('lt:chat-live', function (e) {
    if (!inRoom) return;
    var msg = e.detail || {};
    if (msg.isSelf) return;                       // 自己发的不提示
    if (expanded && !document.hidden) return;     // 展开且窗口可见时直接阅读
    bumpUnread();
    showToastPill(msg);
  });

  // 预先构建 DOM（隐藏态），保证房间事件到达时可立即展示
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildDom);
  } else {
    buildDom();
  }
})();
