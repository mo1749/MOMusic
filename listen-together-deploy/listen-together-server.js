'use strict';

/**
 * MOMusic 一起听 - 公网独立部署入口
 *
 * 部署方式：
 *   1. 本地/VPS: 把 listen-together.js + 本文件上传 -> npm install ws -> node listen-together-server.js
 *   2. Render: 推到 GitHub -> 新建 Web Service -> Build: npm install -> Start: node listen-together-server.js
 *   3. 客户端在「一起听」面板输入服务器地址
 *
 * 环境变量：
 *   PORT     Render/Heroku 自动注入的端口（优先级最高）
 *   LT_PORT  自定义端口（默认 9527）
 *   LT_HOST  监听地址（默认 0.0.0.0）
 */

// Render/Heroku 注入 PORT，必须在 require 之前写入 LT_PORT
// 因为 listen-together.js 在模块加载时读取 LT_PORT
const RENDER_PORT = parseInt(process.env.PORT || process.env.LT_PORT || '9527', 10);
process.env.LT_PORT = String(RENDER_PORT);

const lt = require('./listen-together');
const HOST = process.env.LT_HOST || '0.0.0.0';

lt.startListenTogether();

console.log('========================================');
console.log('  MOMusic 一起听服务器已启动');
console.log('  监听: ws://' + HOST + ':' + RENDER_PORT + '/listen-together');
console.log('  健康检查: http://' + HOST + ':' + RENDER_PORT + '/health');
console.log('========================================');
console.log('');
console.log('客户端配置: 在一起听面板输入你的域名:端口');
console.log('');

// 优雅关闭
process.on('SIGINT', function () {
  console.log('\n正在关闭服务器...');
  lt.stopListenTogether();
  process.exit(0);
});

process.on('SIGTERM', function () {
  lt.stopListenTogether();
  process.exit(0);
});
