import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

await rm('dist', { recursive: true, force: true });
execFileSync('tsc', ['-p', 'tsconfig.app.json', '--noEmit', 'false'], { stdio: 'inherit' });
await mkdir('dist', { recursive: true });
await cp('index.html', 'dist/index.html');
await cp('src/styles.css', 'dist/src/styles.css');
await writeFile('dist/.nojekyll', '');
console.log('Built static TypeScript modules to dist/.');
