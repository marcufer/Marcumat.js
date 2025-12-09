// Simple build script using esbuild to produce browser-friendly JS bundles
// - dist/wave-effect.js (IIFE, minified, global name WaveEffect) -> for script tag inclusion
// - dist/wave-effect.esm.js (ESM) -> for module imports
// Also copies CSS + index.html demo into dist for quick preview/deploy.
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const watch = process.argv.includes('--watch');
const outDir = path.resolve(process.cwd(), 'dist');
const assetsSrc = path.resolve(process.cwd(), 'assets');
const demoSrc = path.resolve(process.cwd(), 'index.html');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

ensureDir(outDir);

// copy CSS and demo (if available)
function copyAssets() {
  try {
    const cssIn = path.join(assetsSrc, 'wave-effect.min.css');
    const cssOut = path.join(outDir, 'wave-effect.min.css');
    if (fs.existsSync(cssIn)) {
      fs.copyFileSync(cssIn, cssOut);
      console.log('Copied CSS ->', cssOut);
    } else {
      console.warn('CSS not found at', cssIn);
    }

    if (fs.existsSync(demoSrc)) {
      // Update demo to point to dist assets
      let demoContent = fs.readFileSync(demoSrc, 'utf8');
      demoContent = demoContent.replace(/<script src=".*wave-effect.*\.js"><\/script>/, '<script src="/dist/wave-effect.js"></script>');
      demoContent = demoContent.replace(/<link rel="stylesheet" href=".*wave-effect.*\.css">/, '<link rel="stylesheet" href="/dist/wave-effect.min.css">');
      fs.writeFileSync(path.join(outDir, 'index.html'), demoContent, 'utf8');
      console.log('Copied demo ->', path.join(outDir, 'index.html'));
    }
  } catch (e) {
    console.error('Error copying assets:', e);
  }
}

async function build() {
  copyAssets();
  try {
    // IIFE bundle for browsers - attaches to global WaveEffect
    await esbuild.build({
      entryPoints: ['src/wave-effect.ts'],
      bundle: true,
      minify: true,
      sourcemap: true,
      format: 'iife',
      globalName: 'WaveEffect',
      outfile: path.join(outDir, 'wave-effect.js'),
      target: ['es2017'],
      legalComments: 'none',
    });
    console.log('Built dist/wave-effect.js (IIFE)');

    // ESM bundle
    await esbuild.build({
      entryPoints: ['src/wave-effect.ts'],
      bundle: true,
      minify: true,
      sourcemap: true,
      format: 'esm',
      outfile: path.join(outDir, 'wave-effect.esm.js'),
      target: ['es2017'],
      legalComments: 'none',
    });
    console.log('Built dist/wave-effect.esm.js (ESM)');

  } catch (err) {
    console.error('Build failed', err);
    process.exit(1);
  }
}

if (watch) {
  const esbuildCtx = esbuild.context({
    entryPoints: ['src/wave-effect.ts'],
    bundle: true,
    minify: false,
    sourcemap: true,
    format: 'esm',
    outfile: path.join(outDir, 'wave-effect.esm.js'),
    target: ['es2017'],
  });
  esbuildCtx.then(ctx => {
    ctx.watch();
    console.log('esbuild watching (ESM) ...');
    // build IIFE once in watch mode as well
    esbuild.build({
      entryPoints: ['src/wave-effect.ts'],
      bundle: true,
      minify: false,
      sourcemap: true,
      format: 'iife',
      globalName: 'WaveEffect',
      outfile: path.join(outDir, 'wave-effect.js'),
      target: ['es2017'],
    }).then(() => console.log('Built IIFE (watch mode)'));
  }).catch(e => { console.error(e); process.exit(1); });
  // Copy assets initially
  copyAssets();
} else {
  build();
}