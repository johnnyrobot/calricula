import { rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

for (const relativePath of [
  '.next',
  'out',
  path.join('.wrangler', 'dry-run'),
]) {
  await rm(path.resolve(process.cwd(), relativePath), {
    force: true,
    recursive: true,
  });
}

console.log(
  '[release-build] Removed generated Next, static-export, and Wrangler dry-run output.',
);
