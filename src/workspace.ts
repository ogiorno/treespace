import { mkdir, readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { parse, type ParseError } from 'jsonc-parser';
import type { TreeSpaceConfig } from './config.js';
import type { WorktreeSet } from './sets.js';

interface WorkspaceFile {
  folders?: Array<{ name: string; path: string }>;
  settings?: Record<string, unknown>;
  [key: string]: unknown;
}

export async function writeSetWorkspace(config: TreeSpaceConfig, set: WorktreeSet): Promise<string> {
  const filePath = path.join(config.workspacesRoot, `${set.name}.code-workspace`);
  let previous: WorkspaceFile = {};
  try {
    const errors: ParseError[] = [];
    previous = parse(await readFile(filePath, 'utf8'), errors) as WorkspaceFile;
    if (errors.length || !previous || typeof previous !== 'object' || Array.isArray(previous)) {
      throw new Error(`Invalid workspace file: ${filePath}`);
    }
    if (previous.settings && (typeof previous.settings !== 'object' || Array.isArray(previous.settings))) {
      throw new Error(`Invalid workspace settings: ${filePath}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  const settings = { ...previous.settings };
  delete settings['treespace.configPath'];
  delete settings['treespace.repositoryPaths'];
  const workspace: WorkspaceFile = {
    ...previous,
    folders: set.entries.map((entry) => ({ name: `${entry.repoId} · ${set.name}`, path: entry.path })),
    settings: {
      ...settings,
      'treespace.set': set.name,
      ...(config.sourcePath
        ? { 'treespace.configPath': config.sourcePath }
        : { 'treespace.repositoryPaths': config.repos.map((repo) => repo.path) })
    }
  };
  await mkdir(config.workspacesRoot, { recursive: true });
  await writeFile(filePath, `${JSON.stringify(workspace, null, 2)}\n`, 'utf8');
  return filePath;
}
