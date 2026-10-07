import { createHash } from 'node:crypto';
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

interface Group {
  key: string;
  preferredName: string;
  entries: SetEntry[];
}

function slug(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'set';
}

function preferredSetName(branch: string, branchPrefix: string): string {
  if (branchPrefix && branch.startsWith(branchPrefix)) return slug(branch.slice(branchPrefix.length));
  return slug(branch);
}

export async function discoverSets(config: TreeSpaceConfig, git: GitRunner): Promise<WorktreeSet[]> {
  const groups = new Map<string, Group>();
  for (const repo of config.repos) {
    const output = await git.run(repo.path, ['worktree', 'list', '--porcelain', '-z']);
    // Git lists the main worktree first. The remaining records are linked worktrees.
    for (const worktree of parseWorktreeList(output).slice(1)) {
      if (worktree.prunable) continue;
      const key = worktree.branch ?? `detached:${repo.id}:${worktree.path}`;
      const preferredName = worktree.branch
        ? preferredSetName(worktree.branch, config.branchPrefix)
        : `detached-${worktree.head?.slice(0, 8) ?? 'unknown'}`;
      const group = groups.get(key) ?? { key, preferredName, entries: [] };
      group.entries.push({ repoId: repo.id, path: worktree.path, branch: worktree.branch, base: repo.defaultBase });
      groups.set(key, group);
    }
  }

  const usedNames = new Set<string>();
  return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key)).map((group) => {
    let name = group.preferredName;
    if (usedNames.has(name)) name = slug(group.key);
    if (usedNames.has(name)) {
      name = `${name}-${createHash('sha256').update(group.key).digest('hex').slice(0, 8)}`;
    }
    usedNames.add(name);
    return { name, entries: group.entries };
  }).sort((a, b) => a.name.localeCompare(b.name));
}
