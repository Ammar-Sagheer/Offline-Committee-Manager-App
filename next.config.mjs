/**
 * `output: 'standalone'` is what makes the Electron build possible at all:
 * `next build` then writes a self-contained `.next/standalone/server.js` that
 * plain Node can run. Electron spawns that. It never runs `next start`, which
 * expects the whole project tree to be present.
 */
const nextConfig = {
  output: "standalone",

  // No CDN and no image optimiser on a laptop with no internet.
  images: { unoptimized: true },

  // The app is served from 127.0.0.1 by a child process of Electron. Next's
  // dev-time origin check would otherwise complain about the Electron window.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
