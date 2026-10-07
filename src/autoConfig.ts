import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import * as path from 'node:path';
import { parse, type ParseError } from 'jsonc-parser';
import type { TreeSpaceConfig } from './config.js';
import { GitRunner, parseWorktreeList } from './git.js';

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 8);
}

export async function readWorkspaceFolderPaths(filePath: string): Promise<string[]> {
  const errors: ParseError[] = [];
  const content = parse(await readFile(filePath, 'utf8'), errors, { allowTrailingComma: true }) as unknown;
  if (errors.length || !content || typeof content !== 'object' || !('folders' in content)) return [];
  const folders = (content as { folders: unknown }).folders;
  if (!Array.isArray(folders)) return [];
  return folders.flatMap((folder: unknown) => {
    if (!folder || typeof folder !== 'object' || !('path' in folder) || typeof folder.path !== 'string') return [];
    return [path.resolve(path.dirname(filePath), folder.path)];
  });
}

export async function discoverRepositoryPaths(
  workspaceFolders: string[],
  savedRepositories: string[] = []
): Promise<string[]> {
  const candidates = new Set([...workspaceFolders, ...savedRepositories].map((value) => path.resolve(value)));
  for (const folder of workspaceFolders) {
    let files: string[];
    try {
      files = (await readdir(folder, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && entry.name.endsWith('.code-workspace'))
        .map((entry) => path.join(folder, entry.name))
        .sort();
    } catch {
      continue;
    }
    for (const file of files.slice(0, 20)) {
      try {
        for (const candidate of await readWorkspaceFolderPaths(file)) candidates.add(candidate);
      } catch {
        // An unrelated or stale workspace file must not hide usable repositories.
      }
    }
  }
  const existing: string[] = [];
  for (const candidate of candidates) {
    try {
      if ((await stat(candidate)).isDirectory()) existing.push(candidate);
    } catch {
      // A workspace may still reference a deleted worktree.
    }
  }
  return existing;
}

export async function inferConfigFromGit(
  candidatePaths: string[],
  git: GitRunner,
  storageRoot: string
): Promise<TreeSpaceConfig | undefined> {
  const seenGitDirs = new Set<string>();
  const repos: TreeSpaceConfig['repos'] = [];

  for (const candidate of candidatePaths) {
    try {
      const commonDir = path.resolve(candidate, (await git.run(candidate, ['rev-parse', '--git-common-dir'])).trim());
      if (seenGitDirs.has(commonDir)) continue;
      const worktrees = parseWorktreeList(await git.run(candidate, ['worktree', 'list', '--porcelain', '-z']));
      const main = worktrees[0];
      if (!main) continue;
      seenGitDirs.add(commonDir);
      const baseId = path.basename(main.path);
      const id = repos.some((repo) => repo.id === baseId) ? `${baseId}-${shortHash(commonDir)}` : baseId;
      const remotes = (await git.run(candidate, ['remote'])).split(/\r?\n/);
      repos.push({
        id,
        path: main.path,
        defaultBase: main.branch
          ? remotes.includes('origin') ? `origin/${main.branch}` : main.branch
          : '(unknown)'
      });
    } catch {
      // Workspace folders need not be Git repositories.
    }
  }

  if (repos.length === 0) return undefined;
  const identity = repos.map((repo) => repo.path).sort().join('\0');
  return {
    version: 1,
    repos,
    workspacesRoot: path.join(storageRoot, 'workspaces', shortHash(identity)),
    protectedBranches: ['develop', 'master', 'main'],
    branchPrefix: 'feat/'
  };
}
