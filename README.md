# TreeSpace

TreeSpace is a VS Code extension for opening groups of Git worktrees from multiple repositories as one workspace. The [specification](SPEC.md) describes the planned product; this repository currently provides the extension foundation and a read-only discovery/open workflow.

## Current functionality

- Reads and validates `treespace.json` in a workspace root or from `treespace.configPath`.
- Discovers worktrees at `<worktreesRoot>/<set>/<repoId>` using `git worktree list --porcelain`.
- Shows sets and their repository branches in the TreeSpace Activity Bar view.
- Creates or updates `<workspacesRoot>/<set>.code-workspace` and opens it from the view or `TreeSpace: Open Set` command.
- Keeps the config file path in generated workspaces so the TreeSpace view works after opening a set.
- Preserves unrelated keys in an existing generated workspace file.

Creation, import of worktrees outside this directory convention, automatic workspace import, branch safety actions, and cleanup are planned in `SPEC.md` and are not implemented yet.

## Development

Requirements: Node.js 22, npm, Git 2.30 or newer, and VS Code 1.85 or newer. In WSL, open this repository through a WSL VS Code window so the extension runs beside the Linux repositories.

```sh
npm ci
npm run check
```

Press **F5** in VS Code to open an Extension Development Host. `npm run watch` rebuilds the extension during development. Use `npm run package:vsix` to validate and produce a local `.vsix`. Before publishing to a marketplace, choose a license and a publisher ID, and review the package metadata.

## Configuration

Copy [treespace.example.json](treespace.example.json) to `treespace.json` in a workspace root and replace the example paths. Paths may be absolute, relative to the config file, or start with `~/`. JSON with comments and trailing commas is accepted.

```json
{
  "version": 1,
  "repos": [
    { "id": "backend", "path": "~/projects/backend", "defaultBase": "origin/main" }
  ],
  "worktreesRoot": "~/projects/.worktrees",
  "workspacesRoot": "~/projects/.workspaces"
}
```

For this initial version, a set called `task-a` is discovered when Git lists a worktree at `<worktreesRoot>/task-a/backend`. Set names and repo IDs use letters, numbers, `_`, and `-`.

## Project checks

`npm run check` performs TypeScript checking, ESLint, unit tests, and a production bundle. GitHub Actions runs the same check on pushes and pull requests. The bundle excludes the VS Code API, which is supplied by the extension host.
