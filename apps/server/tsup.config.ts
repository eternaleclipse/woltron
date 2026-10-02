import fs from 'node:fs';
import { defineConfig } from 'tsup';

// `@woltron/wolt` is developed in parallel; if it isn't in this checkout, leave the import
// external so the runtime loader falls back to the built-in stand-in client.
const hasWolt = fs.existsSync(new URL('../../packages/wolt/package.json', import.meta.url));

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
  esbuildPlugins: [
    {
      // dist/cli.js imports the sibling dist/index.js instead of re-bundling everything.
      name: 'cli-uses-index',
      setup(build) {
        build.onResolve({ filter: /^\.\/index\.js$/ }, (args) =>
          args.importer.endsWith('cli.ts') ? { path: './index.js', external: true } : undefined,
        );
      },
    },
  ],
  // Bundle everything (workspace TS packages + npm deps) so Electron can load dist/ with no node_modules.
  noExternal: [/.*/],
  external: hasWolt ? [] : ['@woltron/wolt'],
  // CJS deps (qrcode) need a real `require` inside the ESM bundle.
  banner: {
    js: "import { createRequire as __woltronCreateRequire } from 'node:module'; const require = __woltronCreateRequire(import.meta.url);",
  },
});
