import * as path from 'node:path';
import type { TreeSpaceConfig } from './config.js';
import { GitRunner, parseWorktreeList } from './git.js';

export interface SetEntry {
  repoId: string;
  path: string;
  branch?: string;
  base: string;
}

export interface WorktreeSet {
  name: string;
  entries: SetEntry[];
}

function setNameForPath(worktreePath: string, root: string, repoId: string): string | undefined {
  const relative = path.relative(root, worktreePath);
  const parts = relative.split(path.sep);
  if (parts.length !== 2 || parts[1] !== repoId || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(parts[0] ?? '')) {
    return undefined;
  }
  return parts[0];
}

export async function discoverSets(config: TreeSpaceConfig, git: GitRunner): Promise<WorktreeSet[]> {
  const sets = new Map<string, WorktreeSet>();
  for (const repo of config.repos) {
    const output = await git.run(repo.path, ['worktree', 'list', '--porcelain']);
    for (const worktree of parseWorktreeList(output)) {
      if (worktree.prunable) continue;
      const name = setNameForPath(worktree.path, config.worktreesRoot, repo.id);
      if (!name) continue;
      const set = sets.get(name) ?? { name, entries: [] };
      set.entries.push({ repoId: repo.id, path: worktree.path, branch: worktree.branch, base: repo.defaultBase });
      sets.set(name, set);
    }
  }
  return [...sets.values()].sort((a, b) => a.name.localeCompare(b.name));
}
