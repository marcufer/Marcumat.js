// Cloudflare Pages Function: returns metadata (and useful URLs) about the built assets.
// This function is intended to be deployed with the static site where the build step
// produces dist/wave-effect.js and dist/wave-effect.esm.js. The function returns JSON
// with the canonical paths so other sites/services can consume the correct file.
//
// Cloudflare Pages Functions expect an onRequest export:
export async function onRequest(context) {
  // The site should publish the dist directory at /dist
  const base = context.env && context.env.PUBLIC_BASE ? context.env.PUBLIC_BASE : '';
  const payload = {
    version: '1.0.0',
    files: {
      iife: base + '/dist/wave-effect.js',
      esm: base + '/dist/wave-effect.esm.js',
      css: base + '/dist/wave-effect.min.css'
    },
    note: 'These are paths to the prebuilt assets. Ensure the build pipeline runs before deploy (npm run build).'
  };
  return new Response(JSON.stringify(payload, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}