/**
 * `next build` with output:'standalone' writes a self-contained server, but
 * deliberately leaves out the static assets and public/ -- a normal deployment
 * serves those from a CDN. There is no CDN on a laptop with no internet, so
 * they are copied in where the standalone server expects them.
 *
 * Wired to "postbuild" so it cannot be forgotten. Symptom if it is: the app
 * loads with no styling at all, and nothing errors anywhere.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const standalone = path.join(root, '.next', 'standalone');

function copyIfExists(from, to) {
  if (!fs.existsSync(from)) return false;
  fs.cpSync(from, to, { recursive: true });
  return true;
}

if (!fs.existsSync(standalone)) {
  console.error('[postbuild] .next/standalone is missing. Is output:"standalone" still set in next.config.mjs?');
  process.exit(1);
}

const copiedStatic = copyIfExists(path.join(root, '.next', 'static'), path.join(standalone, '.next', 'static'));
copyIfExists(path.join(root, 'public'), path.join(standalone, 'public'));

if (!copiedStatic) {
  console.error('[postbuild] .next/static is missing — the app would load with no styling.');
  process.exit(1);
}

console.log('[postbuild] copied the static assets into .next/standalone');
