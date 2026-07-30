const fs = require('fs');
const c = fs.readFileSync('public/js/modules/02-visual/00-pointer-cover-particles.js', 'utf8');
const idx = c.indexOf('var vs = `');
const contentStart = idx + 'var vs = `'.length;
const endIdx = c.indexOf('`;', contentStart);
const s = c.substring(contentStart, endIdx);
const lines = s.split('\n');

// Check exact content around the problem area
console.log('=== Source lines around the else ===');
for (let i = 405; i < 415; i++) {
  console.log('lines[' + i + ']: ' + JSON.stringify(lines[i]) + ' charCodes: ' + [...lines[i]].map(ch => ch.charCodeAt(0)).join(','));
}

// Now check what Three.js r128 prefix looks like
const threeSrc = fs.readFileSync('public/vendor/three.r128.min.js', 'utf8');

// In r128, the prefix is built by getPrefixVertex
// Let's search for the common patterns
const patterns = [
  /#version 300 es/g,
  /#define attribute in/g,
  /#define varying out/g,
  /precision highp float/g,
];

// Let's look for the vertex shader prefix construction
// In minified code, look for patterns like "precision" near "attribute"
const prefixSection = threeSrc.match(/precision highp float;[^}]*?attribute vec3 position/g);
if (prefixSection) {
  console.log('\n=== Prefix section found ===');
  console.log('Length:', prefixSection[0].length);
  // Count newlines
  const newlines = (prefixSection[0].match(/\\n/g) || []).length;
  console.log('Newlines in prefix:', newlines);
}

// Also check if Three.js does any source processing
const replacePatterns = threeSrc.match(/\.replace\([^)]*\)/g);
if (replacePatterns) {
  console.log('\n=== Source replacements found ===');
  replacePatterns.slice(0, 10).forEach(p => console.log(p));
}

// Check the full prefix by looking for the prefixVertex function
const prefixMatch = threeSrc.match(/prefixVertex\s*=\s*["']([^"']+)["']/);
if (prefixMatch) {
  console.log('\n=== prefixVertex string ===');
  console.log(prefixMatch[1].substring(0, 200));
}
