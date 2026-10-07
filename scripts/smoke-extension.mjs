import assert from 'node:assert/strict';
import Module, { createRequire } from 'node:module';
import { resolve } from 'node:path';

const registered = new Set();
const disposable = { dispose() {} };
const vscode = {
  TreeItem: class {},
  EventEmitter: class {
    event = () => disposable;
    fire() {}
    dispose() {}
  },
  window: {
    createOutputChannel: () => ({ appendLine() {}, dispose() {} }),
    createTreeView: () => ({ message: undefined, dispose() {} })
  },
  workspace: {
    workspaceFolders: [],
    getConfiguration: () => ({ get: (...args) => args[1] }),
    onDidChangeConfiguration: () => disposable,
    onDidChangeWorkspaceFolders: () => disposable
  },
  commands: {
    registerCommand: (id) => { registered.add(id); return disposable; }
  }
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') return vscode;
  return originalLoad.call(this, request, parent, isMain);
};

try {
  const require = createRequire(import.meta.url);
  const extension = require(resolve(process.argv[2] ?? 'dist/extension.js'));
  assert.equal(typeof extension.activate, 'function');
  extension.activate({ globalStorageUri: { fsPath: '/tmp' }, subscriptions: [] });
  assert.deepEqual([...registered].sort(), ['treespace.openSet', 'treespace.refresh']);
  process.stdout.write('Extension loads and registers its commands.\n');
} finally {
  Module._load = originalLoad;
}
