import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Astro provides `astro:*` virtual modules only inside its own Vite pipeline. Outside Astro
 * they do not exist, so each one the source imports is aliased to a typed stub under test/stubs.
 * The same goes for the virtual modules the integration's own Vite plugin serves.
 */
export default defineConfig({
  resolve: {
    alias: {
      'astro:env/server': fileURLToPath(new URL('./test/stubs/astro-env-server.ts', import.meta.url)),
      'astro:actions': fileURLToPath(new URL('./test/stubs/astro-actions.ts', import.meta.url)),
      'virtual:@respectify/astro/options': fileURLToPath(new URL('./test/stubs/respectify-options.ts', import.meta.url)),
      'virtual:@respectify/astro/runtime': fileURLToPath(new URL('./test/stubs/respectify-runtime.ts', import.meta.url)),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    restoreMocks: true,
    unstubGlobals: true,
  },
});
