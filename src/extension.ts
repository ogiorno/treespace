import * as vscode from 'vscode';
import { findConfigFile, loadConfig, type TreeSpaceConfig } from './config.js';
import { GitRunner } from './git.js';
import { discoverSets, type WorktreeSet } from './sets.js';
import { writeSetWorkspace } from './workspace.js';

class SetItem extends vscode.TreeItem {
  readonly contextValue = 'treespace.set';

  constructor(readonly set: WorktreeSet) {
    super(set.name, vscode.TreeItemCollapsibleState.Collapsed);
    this.description = `${set.entries.length} repos`;
    this.iconPath = new vscode.ThemeIcon('layers');
    this.command = { command: 'treespace.openSet', title: 'Open Set', arguments: [set] };
  }
}

class RepoItem extends vscode.TreeItem {
  constructor(entry: WorktreeSet['entries'][number]) {
    super(entry.repoId, vscode.TreeItemCollapsibleState.None);
    this.description = entry.branch ?? '(detached)';
    this.tooltip = `${entry.path}\nBranch: ${entry.branch ?? '(detached)'}\nBase: ${entry.base}`;
    this.iconPath = new vscode.ThemeIcon('repo');
  }
}

type TreeNode = SetItem | RepoItem;

class SetsProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly changed = new vscode.EventEmitter<TreeNode | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  private sets: WorktreeSet[] = [];

  setSets(sets: WorktreeSet[]): void {
    this.sets = sets;
    this.changed.fire(undefined);
  }

  getTreeItem(element: TreeNode): vscode.TreeItem { return element; }

  getChildren(element?: TreeNode): TreeNode[] {
    if (element instanceof SetItem) return element.set.entries.map((entry) => new RepoItem(entry));
    if (element) return [];
    return this.sets.map((set) => new SetItem(set));
  }

  dispose(): void { this.changed.dispose(); }
}

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('TreeSpace');
  const provider = new SetsProvider();
  const view = vscode.window.createTreeView('treespace.sets', { treeDataProvider: provider, showCollapseAll: true });
  const git = new GitRunner(output);
  let currentConfig: TreeSpaceConfig | undefined;

  async function refresh(): Promise<void> {
    try {
      const filePath = await findConfigFile();
      if (!filePath) {
        currentConfig = undefined;
        provider.setSets([]);
        view.message = 'Add treespace.json to a workspace root or set TreeSpace: Config Path.';
        return;
      }
      const config = await loadConfig(filePath);
      const sets = await discoverSets(config, git);
      currentConfig = config;
      provider.setSets(sets);
      view.message = sets.length ? undefined : 'No sets found under worktreesRoot.';
    } catch (error) {
      currentConfig = undefined;
      provider.setSets([]);
      const message = error instanceof Error ? error.message : String(error);
      output.appendLine(message);
      view.message = `TreeSpace: ${message}`;
      void vscode.window.showErrorMessage(`TreeSpace: ${message}`);
    }
  }

  context.subscriptions.push(
    output,
    provider,
    view,
    vscode.commands.registerCommand('treespace.refresh', refresh),
    vscode.commands.registerCommand('treespace.openSet', async (set?: WorktreeSet) => {
      try {
        if (!currentConfig) await refresh();
        if (!currentConfig) return;
        const selected = set ?? await vscode.window.showQuickPick(
          (await discoverSets(currentConfig, git)).map((item) => ({ label: item.name, description: `${item.entries.length} repos`, set: item })),
          { placeHolder: 'Select a worktree set' }
        ).then((item) => item?.set);
        if (!selected) return;
        const filePath = await writeSetWorkspace(currentConfig, selected);
        const newWindow = vscode.workspace.getConfiguration('treespace').get<string>('openIn') !== 'currentWindow';
        await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(filePath), { forceNewWindow: newWindow });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        output.appendLine(message);
        void vscode.window.showErrorMessage(`TreeSpace: ${message}`);
      }
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('treespace')) void refresh();
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => { void refresh(); })
  );

  void refresh();
}

export function deactivate(): void {}
