import { describe, expect, it } from 'vitest';
import { parseWorktreeList } from '../src/git.js';

describe('parseWorktreeList', () => {
  it('preserves paths with spaces and parses branch and detached worktrees', () => {
    const output = [
      'worktree /home/user/projects/my repo',
      'HEAD aaaa',
      'branch refs/heads/main',
      '',
      'worktree /home/user/projects/.worktrees/task-a/my repo',
      'HEAD bbbb',
      'branch refs/heads/feat/task-a',
      '',
      'worktree /home/user/projects/.worktrees/task-b/my repo',
      'HEAD cccc',
      'detached',
      ''
    ].join('\n');

    expect(parseWorktreeList(output)).toEqual([
      { path: '/home/user/projects/my repo', head: 'aaaa', branch: 'main', detached: false, prunable: false },
      { path: '/home/user/projects/.worktrees/task-a/my repo', head: 'bbbb', branch: 'feat/task-a', detached: false, prunable: false },
      { path: '/home/user/projects/.worktrees/task-b/my repo', head: 'cccc', detached: true, prunable: false }
    ]);
  });

  it('marks stale worktrees as prunable', () => {
    expect(parseWorktreeList('worktree /gone\nHEAD abc\nprunable gitdir file points to non-existent location\n'))
      .toEqual([{ path: '/gone', head: 'abc', detached: false, prunable: true }]);
  });

  it('parses NUL-delimited output with a newline in the path', () => {
    const output = 'worktree /tmp/name\nwith newline\0HEAD abc\0branch refs/heads/feat/task\0\0';
    expect(parseWorktreeList(output)).toEqual([{
      path: '/tmp/name\nwith newline', head: 'abc', branch: 'feat/task', detached: false, prunable: false
    }]);
  });
});
