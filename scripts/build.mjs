/**
 * Build the plugin's runtime artifacts into lib/ with esbuild.
 *
 * The official DSH runtime imports plugin entries through plain Node ESM with no
 * TypeScript transform — vendor/loader does a bare `import()`, and the harness
 * asserts its shipped composition loads zero `.ts`. So `src/` alone only runs
 * under the tsx dev overlay; a packaged profile loads `lib/`.
 *
 * `@deepseek-ai/*` stays external: those packages are not on npm and resolve at
 * runtime through the junctions scripts/link-harness.mjs creates. Declaring them
 * as peerDependencies would make pnpm try to fetch them from the registry.
 *
 *   node scripts/build.mjs
 */

import { build } from 'esbuild'

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  external: ['@deepseek-ai/*'],
})

console.log('built lib/index.js')
