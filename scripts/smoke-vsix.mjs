import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const manifest = JSON.parse(await readFile('package.json', 'utf8'));
const archive = resolve(`treespace-${manifest.version}.vsix`);
const directory = await mkdtemp(join(tmpdir(), 'treespace-vsix-'));

try {
  const extracted = spawnSync('unzip', ['-q', archive, '-d', directory], { stdio: 'inherit' });
  assert.equal(extracted.status, 0, 'Could not extract the VSIX');
  const entry = join(directory, 'extension', 'dist', 'extension.js');
  const smoke = spawnSync(process.execPath, ['scripts/smoke-extension.mjs', entry], { stdio: 'inherit' });
  assert.equal(smoke.status, 0, 'Packaged extension could not activate');
} finally {
  await rm(directory, { recursive: true, force: true });
}
