import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';

mkdirSync('api', { recursive: true });

await build({
  entryPoints: ['server.ts'],
  outfile: 'api/_server.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  target: 'node20',
  sourcemap: false,
});

console.log('Vercel API server bundle created at api/_server.js');
