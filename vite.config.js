import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));

// A new id every build. This is what the running app compares against
// /version.json to tell whether the phone is on the latest deploy.
const BUILD_ID = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15);

/**
 * Emits version.json and stamps the version into the service worker.
 * Files in public/ are copied verbatim, so the placeholders have to be
 * replaced after the copy rather than through `define`.
 */
function versionStamp() {
  return {
    name: 'version-stamp',
    apply: 'build',
    closeBundle() {
      const dist = resolve('dist');

      writeFileSync(
        resolve(dist, 'version.json'),
        JSON.stringify({ version: pkg.version, buildId: BUILD_ID, builtAt: new Date().toISOString() }, null, 2),
      );

      const sw = resolve(dist, 'sw.js');
      if (existsSync(sw)) {
        writeFileSync(
          sw,
          readFileSync(sw, 'utf8')
            .replaceAll('__APP_VERSION__', pkg.version)
            .replaceAll('__BUILD_ID__', BUILD_ID),
        );
      }

      console.log(`\n  version ${pkg.version} · build ${BUILD_ID}`);
    },
  };
}

export default defineConfig({
  plugins: [react(), versionStamp()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  build: {
    rollupOptions: {
      output: {
        // Split the dependencies that never change away from app code. Assets
        // are content-hashed and cached immutably, so an ordinary edit then
        // only makes the phone re-download the small app chunk instead of the
        // whole Firebase SDK — which matters on the connections they're on.
        manualChunks: {
          firebase: ['firebase/app', 'firebase/firestore', 'firebase/auth'],
          react: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
});
