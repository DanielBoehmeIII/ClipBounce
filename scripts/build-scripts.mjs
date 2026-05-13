import * as esbuild from 'esbuild';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const entries = [
  resolve(root, 'src/extension/background.ts'),
  resolve(root, 'src/extension/contentScript.ts'),
];

const args = process.argv.slice(2);
const watch = args.includes('--watch');

async function build() {
  const context = await esbuild.context({
    entryPoints: entries,
    outdir: resolve(root, 'dist'),
    bundle: true,
    format: 'esm',
    target: 'es2020',
    platform: 'browser',
    sourcemap: false,
    minify: false,
    external: ['chrome'],
  });

  if (watch) {
    await context.watch();
    console.log('[build-scripts] watching for changes...');
  } else {
    await context.rebuild();
    await context.dispose();
    console.log('[build-scripts] compiled background.ts and contentScript.ts');
  }
}

build().catch((err) => {
  console.error('[build-scripts] error:', err);
  process.exit(1);
});
