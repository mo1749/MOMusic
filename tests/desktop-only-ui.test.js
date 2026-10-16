'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const publicDir = path.resolve(__dirname, '../public');

function loadedModules() {
  const loader = fs.readFileSync(path.join(publicDir, 'js/index-loader.js'), 'utf8');
  const pathsMatch = loader.match(/const modulePaths = \[([\s\S]*?)\];/);
  assert.ok(pathsMatch, 'The application loader must declare its modules.');
  return Array.from(pathsMatch[1].matchAll(/'([^']+)'/g), match => {
    const sourcePath = path.join(publicDir, match[1]);
    assert.ok(fs.existsSync(sourcePath), 'Missing loaded module: ' + match[1]);
    return { path: match[1], source: fs.readFileSync(sourcePath, 'utf8') };
  });
}

test('desktop UI module list resolves and remains a valid combined classic script', () => {
  const modules = loadedModules();
  assert.ok(modules.length > 0);
  assert.equal(new Set(modules.map(module => module.path)).size, modules.length);
  assert.ok(!fs.existsSync(path.join(publicDir, 'js/modules/10-shell/xx-two-finger-shelf.js')));
  assert.ok(modules.some(module => module.path.endsWith('/00-gesture-control.js')), 'PC camera gesture control remains available.');
  assert.doesNotThrow(() => new vm.Script(modules.map(module => module.source).join('\n'), {
    filename: 'desktop-ui-combined.js'
  }));
  for (const module of modules) {
    assert.doesNotMatch(module.source, /addEventListener\(\s*['"]touch(?:start|move|end|cancel)['"]/, module.path);
    assert.doesNotMatch(module.source, /addEventListener\(\s*['"](?:orientationchange|deviceorientation|devicemotion)['"]/, module.path);
  }
});

test('cursor activity keeps desktop mouse, pointer and wheel input without touch registration', () => {
  const source = fs.readFileSync(path.join(publicDir, 'js/modules/01-scene/04-bottom-controls-cursor.js'), 'utf8');
  const registration = source.match(/\[[^\]]+\]\.forEach\(function \(type\) \{\s*window\.addEventListener\(type, revealCursorForActivity,[\s\S]*?\n\}\);/);
  assert.ok(registration, 'Cursor activity registration must exist.');
  const listeners = new Map();
  let activityCount = 0;
  vm.runInNewContext(registration[0], {
    window: {
      addEventListener(type, listener, options) {
        assert.equal(options.passive, true);
        assert.equal(options.capture, true);
        listeners.set(type, listener);
      }
    },
    revealCursorForActivity() { activityCount++; }
  });
  assert.deepEqual(Array.from(listeners.keys()), ['mousemove', 'pointermove', 'mousedown', 'wheel']);
  for (const listener of listeners.values()) listener();
  assert.equal(activityCount, 4);
});
