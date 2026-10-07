import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const context = await esbuild.context({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  mainFields: ['module', 'main'],
  target: 'node18',
  outfile: 'dist/extension.js',
  external: ['vscode'],
  sourcemap: true,
  minify: !watch,
  logLevel: 'info'
});

if (watch) {
  await context.watch();
} else {
  await context.rebuild();
  await context.dispose();
}
