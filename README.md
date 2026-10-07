# TreeSpace

TreeSpace is a VS Code extension for opening groups of Git worktrees from multiple repositories as one workspace. The [specification](SPEC.md) describes the planned product; this repository currently provides the extension foundation and a read-only discovery/open workflow.

## Current functionality

- Finds Git repositories in the open workspace and in `.code-workspace` files beside an open project folder. A `treespace.json` can still define repositories explicitly.
- Discovers linked worktrees from `git worktree list --porcelain -z`, wherever they are located, and groups matching branch names into sets.
- Shows sets and their repository branches in the TreeSpace Activity Bar view.
- Creates or updates `<workspacesRoot>/<set>.code-workspace` and opens it from the view or `TreeSpace: Open Set` command.
- Keeps the repository paths or config file path in generated workspaces so the TreeSpace view works after opening a set.
- Preserves unrelated keys in an existing generated workspace file.

Creation, automatic workspace import when opening a single worktree, branch safety actions, and cleanup are planned in `SPEC.md` and are not implemented yet.

## Development

Requirements: Node.js 22, npm, Git 2.30 or newer, and VS Code 1.85 or newer. In WSL, open this repository through a WSL VS Code window so the extension runs beside the Linux repositories.

```sh
npm ci
npm run check
```

Press **F5** in VS Code to open an Extension Development Host. `npm run watch` rebuilds the extension during development. Use `npm run package:vsix` to validate and produce a local `.vsix`. Before publishing to a marketplace, choose a license and a publisher ID, and review the package metadata.

## Use in another project

Open a multi-root `.code-workspace` that lists the main repository checkouts, or open a project folder containing such a file. TreeSpace uses those folders to find the repositories, then asks Git for their linked worktrees. The worktree directories may be beside the project, inside it, or elsewhere. Two repositories with the same worktree branch, such as `feat/task-a`, appear in one set named `task-a`.

An explicit config is useful when the workspace does not list all repositories or when you want to choose each repository's expected base branch. Copy [treespace.example.json](treespace.example.json) to `treespace.json` in a workspace root and replace the example paths. Paths may be absolute, relative to the config file, or start with `~/`. JSON with comments and trailing commas is accepted.

```json
{
  "version": 1,
  "repos": [
    { "id": "backend", "path": "~/projects/backend", "defaultBase": "origin/main" }
  ],
  "workspacesRoot": "~/projects/.workspaces"
}
```

`worktreesRoot` is optional and reserved for the planned worktree creation command; it does not filter discovery. Without a config file, TreeSpace infers the base from the main checkout branch (`origin/<branch>` when `origin` exists) and stores generated workspaces in the extension's VS Code storage.

## Project checks

`npm run check` performs TypeScript checking, ESLint, unit tests, and a production bundle. GitHub Actions runs the same check on pushes and pull requests. The bundle excludes the VS Code API, which is supplied by the extension host.
