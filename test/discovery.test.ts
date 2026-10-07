import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import type { TreeSpaceConfig } from '../src/config.js';
import { GitRunner } from '../src/git.js';
import { discoverSets } from '../src/sets.js';

const run = promisify(execFile);

describe('discoverSets', () => {
  it('finds a real worktree in a path containing spaces', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'treespace git '));
    const repo = path.join(root, 'backend repo');
    const worktreesRoot = path.join(root, '.worktrees');
    const worktree = path.join(worktreesRoot, 'task-a', 'backend');
    try {
      await mkdir(repo);
      await run('git', ['init', repo]);
      await run('git', ['-C', repo, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--allow-empty', '-m', 'initial']);
      await run('git', ['-C', repo, 'worktree', 'add', '-b', 'feat/task-a', worktree]);
      const config: TreeSpaceConfig = {
        version: 1,
        repos: [{ id: 'backend', path: repo, defaultBase: 'origin/main' }],
        worktreesRoot,
        workspacesRoot: path.join(root, '.workspaces'),
        protectedBranches: ['main'],
        branchPrefix: 'feat/'
      };
      const git = new GitRunner({ appendLine: () => {} });

      expect(await discoverSets(config, git)).toEqual([{
        name: 'task-a',
        entries: [{ repoId: 'backend', path: worktree, branch: 'feat/task-a', base: 'origin/main' }]
      }]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
