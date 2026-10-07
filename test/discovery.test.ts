import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { discoverRepositoryPaths, inferConfigFromGit } from '../src/autoConfig.js';
import { GitRunner } from '../src/git.js';
import { discoverSets } from '../src/sets.js';

const run = promisify(execFile);

describe('discoverSets', () => {
  it('groups real worktrees by branch across repos without a worktrees directory', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'treespace git '));
    const backend = path.join(root, 'repos', 'backend');
    const frontend = path.join(root, 'repos', 'frontend');
    const backendWorktree = path.join(root, 'elsewhere', 'backend task');
    const frontendWorktree = path.join(root, 'another place', 'frontend checkout');
    const differentBranch = path.join(root, 'one more', 'backend fix');
    try {
      await mkdir(path.dirname(backend), { recursive: true });
      for (const repo of [backend, frontend]) {
        await run('git', ['init', '-b', 'main', repo]);
        await run('git', ['-C', repo, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--allow-empty', '-m', 'initial']);
      }
      await run('git', ['-C', backend, 'worktree', 'add', '-b', 'feat/task-a', backendWorktree]);
      await run('git', ['-C', frontend, 'worktree', 'add', '-b', 'feat/task-a', frontendWorktree]);
      await run('git', ['-C', backend, 'worktree', 'add', '-b', 'fix/task-a', differentBranch]);
      await writeFile(path.join(root, 'main.code-workspace'), `{
        // Workspace paths identify repositories; Git identifies linked worktrees.
        "folders": [
          { "path": "repos/backend" },
          { "path": "repos/frontend" },
          { "path": "missing-old-worktree" },
        ]
      }`);

      const git = new GitRunner({ appendLine: () => {} });
      const candidates = await discoverRepositoryPaths([root]);
      const config = await inferConfigFromGit(candidates, git, path.join(root, 'storage'));
      expect(config?.repos.map((repo) => repo.id)).toEqual(['backend', 'frontend']);
      expect(config?.worktreesRoot).toBeUndefined();
      if (!config) throw new Error('Git repositories were not discovered');

      expect(await discoverSets(config, git)).toEqual([
        {
          name: 'fix-task-a',
          entries: [{ repoId: 'backend', path: differentBranch, branch: 'fix/task-a', base: 'main' }]
        },
        {
          name: 'task-a',
          entries: [
            { repoId: 'backend', path: backendWorktree, branch: 'feat/task-a', base: 'main' },
            { repoId: 'frontend', path: frontendWorktree, branch: 'feat/task-a', base: 'main' }
          ]
        }
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('keeps linked worktrees visible when the main checkout is detached', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'treespace-detached-'));
    const repo = path.join(root, 'backend');
    const linked = path.join(root, 'feature checkout');
    try {
      await run('git', ['init', '-b', 'main', repo]);
      await run('git', ['-C', repo, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--allow-empty', '-m', 'initial']);
      await run('git', ['-C', repo, 'worktree', 'add', '-b', 'feat/task-b', linked]);
      await run('git', ['-C', repo, 'checkout', '--detach']);
      const git = new GitRunner({ appendLine: () => {} });
      const config = await inferConfigFromGit([repo], git, path.join(root, 'storage'));
      expect(config?.repos[0]?.defaultBase).toBe('(unknown)');
      if (!config) throw new Error('Git repository was not discovered');
      expect(await discoverSets(config, git)).toEqual([{
        name: 'task-b',
        entries: [{ repoId: 'backend', path: linked, branch: 'feat/task-b', base: '(unknown)' }]
      }]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
