import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import * as path from 'node:path';
import { parse, type ParseError } from 'jsonc-parser';
import * as vscode from 'vscode';
import { z } from 'zod';

const repoSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/),
  path: z.string().min(1),
  defaultBase: z.string().min(1)
});

const configSchema = z.object({
  version: z.literal(1),
  repos: z.array(repoSchema).min(1),
  worktreesRoot: z.string().min(1),
  workspacesRoot: z.string().min(1),
  protectedBranches: z.array(z.string()).default(['main', 'master', 'develop']),
  branchPrefix: z.string().default('feat/')
}).superRefine((config, ctx) => {
  const ids = new Set<string>();
  for (const [index, repo] of config.repos.entries()) {
    if (ids.has(repo.id)) {
      ctx.addIssue({ code: 'custom', path: ['repos', index, 'id'], message: 'Duplicate repo ID' });
    }
    ids.add(repo.id);
  }
});

export type TreeSpaceConfig = z.infer<typeof configSchema> & { sourcePath?: string };

export function resolveConfigPath(value: string, directory: string): string {
  const expanded = value === '~' ? homedir() : value.startsWith('~/') ? path.join(homedir(), value.slice(2)) : value;
  return path.resolve(directory, expanded);
}

export async function findConfigFile(): Promise<string | undefined> {
  const setting = vscode.workspace.getConfiguration('treespace').get<string>('configPath', '').trim();
  if (setting) {
    const firstRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
    return resolveConfigPath(setting, firstRoot);
  }

  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const candidate = path.join(folder.uri.fsPath, 'treespace.json');
    try {
      await readFile(candidate);
      return candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return undefined;
}

export async function loadConfig(filePath: string): Promise<TreeSpaceConfig> {
  const errors: ParseError[] = [];
  const raw = parse(await readFile(filePath, 'utf8'), errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    throw new Error(`Invalid JSON in ${filePath} at offset ${errors[0]?.offset}`);
  }
  const config = configSchema.parse(raw);
  const directory = path.dirname(filePath);
  return {
    ...config,
    sourcePath: filePath,
    repos: config.repos.map((repo) => ({ ...repo, path: resolveConfigPath(repo.path, directory) })),
    worktreesRoot: resolveConfigPath(config.worktreesRoot, directory),
    workspacesRoot: resolveConfigPath(config.workspacesRoot, directory)
  };
}
