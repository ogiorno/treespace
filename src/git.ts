import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface GitWorktree {
  path: string;
  head?: string;
  branch?: string;
  detached: boolean;
  prunable: boolean;
}

export function parseWorktreeList(output: string): GitWorktree[] {
  const worktrees: GitWorktree[] = [];
  let current: GitWorktree | undefined;
  const separator = output.includes('\0') ? '\0' : '\n';
  for (const line of output.split(separator)) {
    if (line === '') {
      if (current) worktrees.push(current);
      current = undefined;
      continue;
    }
    const space = line.indexOf(' ');
    const key = space < 0 ? line : line.slice(0, space);
    const value = space < 0 ? '' : line.slice(space + 1);
    if (key === 'worktree') {
      current = { path: value, detached: false, prunable: false };
    } else if (current) {
      if (key === 'HEAD') current.head = value;
      if (key === 'branch') current.branch = value.replace(/^refs\/heads\//, '');
      if (key === 'detached') current.detached = true;
      if (key === 'prunable') current.prunable = true;
    }
  }
  if (current) worktrees.push(current);
  return worktrees;
}

export class GitRunner {
  constructor(private readonly output: { appendLine(value: string): void }) {}

  async run(cwd: string, args: string[]): Promise<string> {
    this.output.appendLine(`git -C ${JSON.stringify(cwd)} ${args.map((arg) => JSON.stringify(arg)).join(' ')}`);
    try {
      const { stdout, stderr } = await execFileAsync('git', ['-C', cwd, ...args], {
        timeout: 15_000,
        maxBuffer: 4 * 1024 * 1024,
        encoding: 'utf8',
        windowsHide: true
      });
      if (stderr.trim()) this.output.appendLine(stderr.trim());
      this.output.appendLine('Exit 0');
      return stdout;
    } catch (error) {
      const failure = error as Error & { stderr?: string; code?: string | number };
      this.output.appendLine(`Exit ${String(failure.code ?? 'unknown')}: ${failure.stderr?.trim() || failure.message}`);
      throw new Error(`Git failed in ${cwd}: ${failure.stderr?.trim() || failure.message}`, { cause: error });
    }
  }
}
