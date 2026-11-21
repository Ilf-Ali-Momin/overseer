// Bundles packages/bridge (with @overseer/shared inlined) into one runnable file for npm.
// Runtime dependencies stay external and are installed from package.json.
import { copyFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'));

await build({
  entryPoints: [join(here, '../bridge/src/index.ts')],
  outfile: join(here, 'dist/cli.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  external: Object.keys(pkg.dependencies),
  banner: { js: '#!/usr/bin/env node' },
  legalComments: 'none',
  logLevel: 'info',
});
copyFileSync(join(here, '../../LICENSE'), join(here, 'LICENSE'));
