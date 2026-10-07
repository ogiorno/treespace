import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { TreeSpaceConfig } from '../src/config.js';
import { writeSetWorkspace } from '../src/workspace.js';

const created: string[] = [];
afterEach(async () => {
  await Promise.all(created.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('writeSetWorkspace', () => {
  it('preserves unrelated workspace keys when refreshing folders', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'treespace-'));
    created.push(root);
    const config: TreeSpaceConfig = {
      version: 1,
      repos: [{ id: 'backend', path: path.join(root, 'backend'), defaultBase: 'origin/main' }],
      worktreesRoot: path.join(root, '.worktrees'),
      workspacesRoot: root,
      protectedBranches: ['main'],
      branchPrefix: 'feat/',
      sourcePath: path.join(root, 'treespace.json')
    };
    const file = path.join(root, 'task-a.code-workspace');
    await writeFile(file, JSON.stringify({ folders: [], settings: { 'editor.tabSize': 4 }, extensions: { recommendations: ['x.y'] } }));

    await writeSetWorkspace(config, {
      name: 'task-a',
      entries: [{ repoId: 'backend', path: path.join(root, '.worktrees/task-a/backend'), branch: 'feat/task-a', base: 'origin/main' }]
    });

    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({
      folders: [{ name: 'backend · task-a', path: path.join(root, '.worktrees/task-a/backend') }],
      settings: {
        'editor.tabSize': 4,
        'treespace.set': 'task-a',
        'treespace.configPath': path.join(root, 'treespace.json')
      },
      extensions: { recommendations: ['x.y'] }
    });
  });

  it('retains repository roots in a generated workspace when using automatic discovery', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'treespace-'));
    created.push(root);
    const repoPath = path.join(root, 'backend');
    const config: TreeSpaceConfig = {
      version: 1,
      repos: [{ id: 'backend', path: repoPath, defaultBase: 'main' }],
      workspacesRoot: root,
      protectedBranches: ['main'],
      branchPrefix: 'feat/'
    };
    const file = await writeSetWorkspace(config, {
      name: 'task-a',
      entries: [{ repoId: 'backend', path: path.join(root, 'elsewhere'), branch: 'feat/task-a', base: 'main' }]
    });
    const workspace = JSON.parse(await readFile(file, 'utf8')) as { settings: Record<string, unknown> };
    expect(workspace.settings['treespace.repositoryPaths']).toEqual([repoPath]);
  });
});
