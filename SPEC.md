# TreeSpace — Spec da Extensão para VS Code

> Nome: **TreeSpace** (id sugerido: `treespace`).
> Objetivo em uma frase: gerenciar **conjuntos de git worktrees multi-repo** (uma "tarefa" = um worktree em cada repo), abrir o conjunto como um workspace multi-root com um clique e mostrar/controlar **para onde cada branch aponta** antes de push/MR.

---

## 1. Contexto e problema

O usuário trabalha com um workspace multi-root com vários repositórios (exemplo fictício):

- `core`
- `monolith`
- `api-gateway`
- `react-apps`

Ele usa muitos `git worktree` (um por tarefa/feature) e usa o **Claude Code no terminal do VS Code**, rodando em **WSL (Ubuntu 24.04)**.

Hoje, cada worktree vira uma pasta solta no Explorer (ex.: `monolith · perk-derived-visibility`, `react-apps · perk-derived-visibility`). Problemas:

1. **Não existe a noção de "tarefa".** Os worktrees da mesma tarefa em repos diferentes não são agrupados. Trocar de tarefa é abrir/fechar pastas manualmente.
2. **Abrir um worktree não importa o workspace.** Ao abrir um worktree, o usuário quer que venha junto o conjunto completo (todos os repos daquela tarefa), com todo o código referente àquela tarefa.
3. **Risco de push/merge na branch errada.** Ao criar um worktree a partir de `develop` (`git worktree add <path> origin/develop --track`), a branch nova herda `develop` como upstream. Um `git push` ou merge pode ir direto para `develop` (ou `master`), quando o desejado é criar uma branch própria e abrir um **Merge Request**.
4. **Falta visibilidade.** Não há uma visualização clara de qual branch cada worktree está usando, para qual upstream/base ela aponta, e quais branches estão disponíveis.

Não existe extensão que una isso (levantamento informal, sem busca exaustiva no marketplace; validar antes de começar).

---

## 2. Objetivos e não objetivos

### Objetivos
- G1. Modelo de **Worktree Set** (tarefa): um nome + um worktree por repo participante.
- G2. **Criar** um set com um comando: cria os worktrees em todos os repos selecionados, a partir de uma base escolhida, com branch nova e **sem herdar upstream da base**.
- G3. **Abrir** um set como workspace multi-root (gerando/atualizando um arquivo `.code-workspace`), na janela atual ou em nova janela.
- G4. Visão lateral (TreeView) com todos os sets e seus repos, mostrando **branch, base, upstream, ahead/behind e estado sujo**.
- G5. **Guarda contra push na branch errada**: indicar e alertar quando o upstream de uma branch for uma branch protegida/base (`develop`, `master`, `main`, configurável).
- G6. Ação para **criar branch de MR / definir upstream correto** com 1 clique.
- G7. Funcionar bem em **WSL / Remote** (a extensão roda no lado remoto).
- G8. Integrar com o **terminal / Claude Code**: abrir terminal já no diretório do worktree.
- G9. **Limpeza**: remover um set inteiro (worktrees + workspace file) com checagens de segurança.

### Não objetivos (v1)
- Não implementar UI de merge/diff próprio (usar a Source Control do VS Code / GitLens).
- Não criar MR/PR via API do GitLab/GitHub na v1 (apenas abrir a URL de "novo MR" quando possível — ver fase 3).
- Não substituir Git Graph/GitLens.
- Não gerenciar submódulos.

---

## 3. Conceitos e modelo de dados

### 3.1 Termos
- **Repo**: um repositório git "principal" (checkout original), ex.: `monolith`.
- **Worktree**: checkout adicional de um repo (`git worktree add`).
- **Set (conjunto/tarefa)**: nome (ex.: `perk-derived-visibility`) + lista de entradas `{repo, worktreePath, branch, base}`.
- **Base**: branch de onde o worktree nasceu (ex.: `origin/develop`). É o alvo esperado do MR.
- **Branch de trabalho**: branch local criada para o worktree (ex.: `feat/perk-derived-visibility`).

### 3.2 Arquivo de configuração (fonte de verdade)
Arquivo `treespace.json` na **pasta raiz dos repos** (ex.: `~/projects/treespace.json`), ou configurável via setting `treespace.configPath`. Permite versionar/compartilhar entre pessoas.

```jsonc
{
  "version": 1,
  "repos": [
    { "id": "core",        "path": "~/projects/core",    "defaultBase": "origin/develop" },
    { "id": "monolith",    "path": "~/projects/monolith",     "defaultBase": "origin/develop" },
    { "id": "api-gateway", "path": "~/projects/api-gateway",  "defaultBase": "origin/develop" },
    { "id": "react-apps",  "path": "~/projects/react-apps",          "defaultBase": "origin/develop" }
  ],
  "worktreesRoot": "~/projects/.worktrees",        // onde criar: <root>/<set>/<repo>
  "workspacesRoot": "~/projects/.workspaces",      // onde gerar <set>.code-workspace
  "protectedBranches": ["develop", "master", "main", "release/*"],
  "branchPrefix": "feat/",
  "mainWorkspace": "~/projects/main.code-workspace" // workspace "principal" (sem worktrees), opcional
}
```

### 3.3 Estado persistido dos sets
Arquivo `~/.treespace/state.json` (ou `globalStorage` da extensão). **Mas o estado deve ser re-derivável** de `git worktree list` + convenção de nomes, para não quebrar se o arquivo se perder.

```jsonc
{
  "sets": {
    "perk-derived-visibility": {
      "createdAt": "2026-10-07T12:00:00Z",
      "entries": [
        { "repo": "monolith",   "path": "~/projects/.worktrees/perk-derived-visibility/monolith",
          "branch": "feat/perk-derived-visibility", "base": "origin/develop" },
        { "repo": "react-apps", "path": "~/projects/.worktrees/perk-derived-visibility/react-apps",
          "branch": "feat/perk-derived-visibility", "base": "origin/develop" }
      ]
    }
  }
}
```

### 3.4 Importar sets existentes (descoberta)
Comando **"Import existing worktrees"**: varre `git worktree list --porcelain` de cada repo configurado e agrupa por **sufixo do nome do diretório / nome da branch** (ex.: `monolith · perk-derived-visibility` + `react-apps · perk-derived-visibility` → set `perk-derived-visibility`). O usuário confirma/edita o agrupamento. Isso é essencial: ele **já tem** worktrees abertos.

---

## 4. Requisitos funcionais

### RF1 — View lateral "TreeSpace"
Container próprio na Activity Bar (ícone próprio) com TreeView:

```
WORKTREE SETS
├─ ● main (workspace principal)
├─ perk-derived-visibility            [aberto]
│  ├─ monolith      feat/perk-derived-visibility  → develop   ↑2 ↓0  ●
│  └─ react-apps    feat/perk-derived-visibility  → develop   ↑0 ↓3
└─ perk-grant-actor-display
   ├─ monolith      feat/perk-grant-actor-display → develop
   └─ react-apps    feat/perk-grant-actor-display → ⚠ develop (upstream protegido)
```

Cada linha de repo mostra:
- nome do repo, **branch atual**, **base** (alvo esperado do MR), **upstream real**;
- ahead/behind em relação ao upstream **e** em relação à base;
- indicador de alterações não commitadas (`●`);
- ⚠ quando o upstream é uma branch protegida.

Ações inline/contexto (ver RF3–RF8). Atualização automática por file watcher em `.git` + botão refresh + polling leve (configurável).

### RF2 — Criar Set (`TreeSpace: New Set`)
Fluxo (QuickPick/InputBox multi-etapa):
1. Nome do set (valida: slug, sem espaços, único).
2. Selecionar repos participantes (multi-select, todos marcados por padrão).
3. Selecionar **base** por repo (default `defaultBase`; lista de branches remotas com busca; opção "usar mesma base para todos").
4. Nome da branch de trabalho (default `branchPrefix + nome-do-set`; editável por repo).
5. Opção `git fetch` antes (default ligado).
6. Executar, com progress e rollback em caso de falha parcial (ver §6).

Comando git por repo:
```bash
git -C <repo> fetch origin
git -C <repo> worktree add --no-track -b <branch> <worktreesRoot>/<set>/<repoId> <base>
```
`--no-track` é obrigatório: **a branch nova não herda upstream da base**. Opcionalmente, após criar, configurar `branch.<branch>.remote=origin` e `branch.<branch>.merge=refs/heads/<branch>` para que o primeiro `git push` crie a branch remota com o mesmo nome (equivalente a `push.autoSetupRemote`), sem nunca apontar para a base.

Depois: gerar workspace file (RF4) e perguntar "Abrir agora?".

### RF3 — Abrir Set (`Open Set`)
- Gera/atualiza `<workspacesRoot>/<set>.code-workspace` com **uma pasta por repo do set**, nomeadas `repo · set` (mesmo padrão visual atual do usuário).
- Abre em nova janela (default) ou janela atual (setting `treespace.openIn`: `newWindow` | `currentWindow`).
- Se a janela já estiver aberta naquele workspace, **apenas foca** nela.
- Ao abrir um worktree **individual** (por qualquer caminho, inclusive o comando "Open Worktree" ou um worktree detectado ao abrir uma pasta), a extensão detecta que ele pertence a um set e **oferece/automaticamente importa o workspace completo do set** (setting `treespace.autoImportWorkspace`: `ask` | `always` | `never`). Este é o requisito central do usuário.
- Opção para **abrir o workspace principal** (sem worktrees) a qualquer momento (volta ao `main`).

### RF4 — Geração do `.code-workspace`
Exemplo gerado:
```jsonc
{
  "folders": [
    { "name": "monolith · perk-derived-visibility",   "path": "/home/user/projects/.worktrees/perk-derived-visibility/monolith" },
    { "name": "react-apps · perk-derived-visibility", "path": "/home/user/projects/.worktrees/perk-derived-visibility/react-apps" }
  ],
  "settings": {
    "treespace.set": "perk-derived-visibility",
    "window.title": "${dirty}${activeEditorShort}${separator}[perk-derived-visibility]${separator}${rootName}"
  }
}
```
- A setting `treespace.set` identifica o set na janela (usado pela status bar e comandos).
- Permitir **template** (setting `treespace.workspaceTemplate`) para herdar `settings`, `extensions.recommendations`, `launch`, `tasks` do workspace principal.
- Mudanças de membros do set (adicionar/remover repo) regeneram o arquivo.

### RF5 — Indicador e controle de "para onde aponta" (feature chave)
Para cada repo/worktree, resolver e exibir:
- **Branch atual** (`git rev-parse --abbrev-ref HEAD`; tratar *detached HEAD*).
- **Upstream configurado** (`git rev-parse --abbrev-ref @{u}`; pode não existir).
- **Base declarada** do set.
- **Alvo provável do MR** = base.

Regras de alerta (⚠ / badge vermelho / tooltip explicativo):
- A: upstream existe e casa com `protectedBranches` → "Um `git push` aqui irá para `develop`."
- B: branch atual **é** uma branch protegida dentro de um worktree de set.
- C: sem upstream → estado neutro "não publicada" com botão **Publish branch**.

**Status bar** (janela com set aberto): `⎇ perk-derived-visibility · 2 repos · ⚠ 1`. Clique abre QuickPick com o resumo de cada repo e as ações abaixo.

### RF6 — Ações de branch / MR (botões na view)
Por repo (e "aplicar a todos do set"):
1. **Set upstream seguro / Publish branch**: `git push -u origin <branch>` criando branch remota com **mesmo nome**; nunca para a base. Confirma com modal mostrando `origin/<branch>`.
2. **Fix upstream** (quando regra A): `git branch --unset-upstream` e opcionalmente publicar (item 1).
3. **Rename branch**: renomeia a branch local (e remota se publicada) — útil para trocar `feat/x` por padrão do time.
4. **Change base**: altera a base declarada do set (apenas metadado + oferece rebase).
5. **Rebase on base**: `git fetch && git rebase <base>` (com confirmação e tratamento de conflito delegado ao VS Code).
6. **Open "New Merge Request"**: monta a URL do provedor a partir de `remote.origin.url` e abre no navegador, com `source=<branch>` e `target=<base sem origin/>`.
   - GitLab: `<host>/<projeto>/-/merge_requests/new?merge_request[source_branch]=<b>&merge_request[target_branch]=<t>`
   - GitHub: `<host>/<org>/<repo>/compare/<t>...<b>?expand=1`
   - Se o provedor não for reconhecido, copiar para clipboard.
7. **Compare with base**: abre o diff/`git log base..branch` (delegar a GitLens/Git Graph se instalados; fallback: terminal).

### RF7 — Terminal / Claude Code
- Ação **"Open Terminal here"** por repo e **"Open terminals for set"** (um terminal por repo, com nome `repo · set`).
- Ação **"Run Claude Code here"**: abre terminal no diretório do worktree executando o comando configurável `treespace.claudeCommand` (default `claude`). Opcional: já passar a flag nativa de worktree quando fizer sentido.
- Terminais abertos pela extensão recebem cor/ícone do set para evitar confusão.

### RF8 — Gerenciamento do ciclo de vida
- **Remove Set**: para cada worktree, checar (a) alterações não commitadas, (b) commits não publicados (ahead sem upstream), (c) stash. Listar riscos e exigir confirmação explícita. Executa `git worktree remove` (sem `--force` por padrão; `--force` só após segunda confirmação), `git worktree prune`, opcionalmente `git branch -d` (nunca `-D` sem confirmação) e apaga o `.code-workspace`.
- **Add repo to set / Remove repo from set**.
- **Rename set** (move diretórios com `git worktree move`, atualiza workspace e estado).
- **Repair** (`git worktree repair`) se diretórios foram movidos manualmente.
- **Prune stale** worktrees.
- Se a janela atual pertence ao set que está sendo removido, avisar e redirecionar para o workspace principal antes.

### RF9 — Quick Switch
Comando `TreeSpace: Switch Set` (QuickPick com busca fuzzy, atalho configurável, ex.: `ctrl+alt+w`). Mostra sets com indicadores (aberto, sujo, ⚠). Enter → abre/foca janela.

---

## 5. Requisitos não funcionais

- **RNF1 — WSL/Remote:** a extensão deve ser `extensionKind: ["workspace"]` e rodar no host remoto (WSL), para acessar os repos e o `git` do Linux. Todos os paths internos são POSIX; ao abrir janelas, usar APIs do VS Code (`vscode.openFolder` / `vscode.openWorkspace` com `Uri` do remote) em vez de montar caminhos `\\wsl$\...`.
- **RNF2 — Performance:** operações de git em paralelo por repo com limite de concorrência (ex.: 4); refresh incremental; nada bloqueia a UI thread; timeout por comando (ex.: 15s) com mensagem clara.
- **RNF3 — Segurança de dados:** nenhuma operação destrutiva sem confirmação; nunca `--force`, `reset --hard` ou `branch -D` por padrão.
- **RNF4 — Sem dependência obrigatória** de GitLens/Git Graph (integrações opcionais, detectadas em runtime).
- **RNF5 — Idempotência:** re-executar comandos não deve corromper estado (ex.: criar set que já existe → oferece "abrir" ou "completar repos faltantes").
- **RNF6 — Observabilidade:** `OutputChannel` "TreeSpace" com cada comando git executado, cwd, exit code e stderr. Setting `treespace.logLevel`.
- **RNF7 — Compatibilidade:** git ≥ 2.30 (para `worktree repair` ≥ 2.30; `worktree move/remove` ≥ 2.17); detectar e avisar versão incompatível. VS Code ≥ 1.85.
- **RNF8 — i18n:** strings em inglês no código com suporte a `package.nls` (pt-BR como primeira tradução).

---

## 6. Casos de borda e tratamento de erros

| Caso | Comportamento esperado |
|---|---|
| Falha ao criar worktree em um dos N repos | **Rollback** dos já criados (remover worktree + branch criada), ou modo "manter parcial" com aviso. Default: rollback. |
| Branch de trabalho já existe local/remota | Perguntar: reutilizar (`worktree add <path> <branch>`), escolher outro nome, ou cancelar. |
| Branch já está em checkout em outro worktree | Git recusa; mostrar qual worktree a usa e oferecer abrir aquele. |
| Base não existe no remoto de um repo | Marcar o repo com erro, permitir escolher outra base para ele. |
| *Detached HEAD* | Mostrar `(detached @ abc1234)` e botão "Create branch here". |
| Worktree apagado manualmente | Mostrar item como "missing" com ações **Repair** / **Remove entry**. |
| Repo sem remote `origin` | Desabilitar ações que dependem de remote; mostrar aviso. |
| Hooks/LFS lentos | Mostrar progress com cancelamento; não travar outros repos. |
| Paths com espaços/unicode | Sempre usar array de args (`execFile`), nunca concatenar shell. |
| Janela do set já aberta | Focar em vez de abrir duplicada. |
| Edição manual do `.code-workspace` | Regenerar preservando chaves desconhecidas (merge, não overwrite). |
| Dois sets com a mesma branch em repos diferentes | Permitido; o que é único é o par (repo, branch) por worktree. |

---

## 7. Comandos (Command Palette)

| ID | Título |
|---|---|
| `treespace.newSet` | TreeSpace: New Set |
| `treespace.openSet` | TreeSpace: Open Set |
| `treespace.switchSet` | TreeSpace: Switch Set |
| `treespace.openMain` | TreeSpace: Open Main Workspace |
| `treespace.importExisting` | TreeSpace: Import Existing Worktrees |
| `treespace.removeSet` | TreeSpace: Remove Set |
| `treespace.addRepo` / `removeRepo` | Add/Remove Repo to Set |
| `treespace.publishBranch` | Publish Branch (safe upstream) |
| `treespace.fixUpstream` | Fix Upstream |
| `treespace.rebaseOnBase` | Rebase on Base |
| `treespace.changeBase` | Change Base |
| `treespace.openMergeRequest` | Open New Merge Request |
| `treespace.openTerminal` | Open Terminal Here |
| `treespace.runClaude` | Run Claude Code Here |
| `treespace.refresh` | Refresh |
| `treespace.repair` | Repair Worktrees |

---

## 8. Settings (`contributes.configuration`)

| Setting | Tipo | Default | Descrição |
|---|---|---|---|
| `treespace.configPath` | string | `""` | Caminho do `treespace.json` (vazio = detectar na raiz). |
| `treespace.protectedBranches` | string[] | `["develop","master","main"]` | Branches que disparam alerta de upstream. |
| `treespace.branchPrefix` | string | `"feat/"` | Prefixo da branch de trabalho. |
| `treespace.openIn` | enum | `"newWindow"` | `newWindow` / `currentWindow`. |
| `treespace.autoImportWorkspace` | enum | `"ask"` | Ao abrir worktree solto: `ask` / `always` / `never`. |
| `treespace.fetchOnCreate` | boolean | `true` | `git fetch` antes de criar. |
| `treespace.refreshIntervalSeconds` | number | `60` | Polling de ahead/behind (0 = desligado). |
| `treespace.claudeCommand` | string | `"claude"` | Comando para "Run Claude Code Here". |
| `treespace.rollbackOnFailure` | boolean | `true` | Rollback em falha parcial. |
| `treespace.logLevel` | enum | `"info"` | `error`/`warn`/`info`/`debug`. |

---

## 9. Arquitetura técnica sugerida

- **Linguagem:** TypeScript, bundle com `esbuild`; testes com `@vscode/test-electron` + `vitest` para a camada pura.
- **Estrutura:**
  ```
  src/
    extension.ts              # activate/deactivate, registro de comandos
    config/                   # leitura/validação do treespace.json (zod)
    git/
      gitRunner.ts            # execFile com timeout, cwd, log; sem shell
      worktrees.ts            # list/add/remove/move/repair (porcelain parser)
      branches.ts             # upstream, ahead/behind, merge-base, remotes
      remoteUrl.ts            # parse de URL e builder de link de MR (GitLab/GitHub)
    model/
      set.ts, repo.ts, entry.ts
      setStore.ts             # estado + derivação a partir do git
      importer.ts             # agrupamento de worktrees existentes em sets
    workspace/
      workspaceFile.ts        # gerar/mesclar .code-workspace
      opener.ts               # abrir/focar janela (APIs do VS Code)
    ui/
      setsTreeProvider.ts     # TreeDataProvider
      statusBar.ts
      quickPicks.ts           # fluxos de New Set / Switch
      terminals.ts
    watchers/
      gitWatcher.ts           # FileSystemWatcher em .git (HEAD, refs, worktrees)
    util/ (logger, concurrency, paths)
  ```
- **Git:** usar o binário `git` do host via `execFile` (não `isomorphic-git`). Parsear `git worktree list --porcelain`, `git for-each-ref`, `git rev-list --left-right --count`.
- **Detecção de set na janela:** ler `treespace.set` do workspace; fallback: casar `workspaceFolders` com entradas do estado.
- **Eventos de refresh:** `FileSystemWatcher` em `<gitdir>/HEAD`, `<gitdir>/refs/**`, `<repo>/.git/worktrees/**`; debounce 300 ms.

### Comandos git de referência
```bash
git worktree list --porcelain
git worktree add --no-track -b <branch> <path> <base>
git worktree remove <path>          # sem --force por padrão
git worktree move <old> <new>
git worktree repair
git rev-parse --abbrev-ref @{u}                 # upstream (falha se não houver)
git rev-list --left-right --count <base>...HEAD # behind/ahead vs base
git status --porcelain=v1 -b                    # sujo + ahead/behind do upstream
git push -u origin <branch>                     # publicar com mesmo nome
git branch --unset-upstream
git config --get remote.origin.url
```

---

## 10. Roadmap / fases

### Fase 1 — MVP (valor imediato)
- Leitura do `treespace.json`, **Import Existing Worktrees**.
- TreeView com sets, repos, branch, base, upstream, ⚠ protegido.
- **Open Set** gerando `.code-workspace` e abrindo em nova janela.
- **Auto-import do workspace** ao abrir worktree solto (RF3).
- **New Set** com `--no-track` e rollback.
- Status bar + QuickPick de troca.
- Logs.

### Fase 2 — Segurança e fluxo de MR
- Ações Publish / Fix upstream / Rebase / Change base.
- **Open New Merge Request** (GitLab/GitHub).
- Remove Set com checagens; Repair; Prune.
- Terminal / Claude Code por repo e por set.

### Fase 3 — Polimento
- Integração opcional com GitLens/Git Graph (Compare, Graph).
- Templates de workspace; i18n pt-BR; ícones/cores por set.
- Criar MR via API (token via `SecretStorage`), `glab`/`gh` CLI como alternativa.
- Telemetria desligada por padrão (ou nenhuma).

---

## 11. Critérios de aceitação (MVP)

1. Dado os 4 repos configurados, `New Set "teste-x"` cria 4 worktrees em `<worktreesRoot>/teste-x/<repo>`, cada um com branch `feat/teste-x` e **sem upstream** (`git rev-parse @{u}` falha).
2. `Open Set "teste-x"` abre uma janela cujo Explorer mostra exatamente as 4 pastas `repo · teste-x`, e **nenhuma** pasta de outro set.
3. Abrir diretamente `.../teste-x/monolith` como pasta isolada exibe o prompt "Importar workspace completo do set teste-x?"; ao aceitar, a janela passa a ser o workspace do set.
4. Um repo cuja branch tem upstream `origin/develop` aparece com ⚠ e tooltip explicando; **Fix upstream** remove o upstream e **Publish** cria `origin/feat/teste-x`.
5. `Import Existing Worktrees` agrupa `monolith · perk-derived-visibility` e `react-apps · perk-derived-visibility` em um único set.
6. Falha forçada no 3º repo durante `New Set` deixa o disco **limpo** (rollback), sem worktrees órfãos nem branches criadas.
7. Remove Set com alterações não commitadas **bloqueia** e lista os arquivos/repos afetados.
8. Tudo funciona em VS Code conectado ao **WSL Ubuntu 24.04**, com paths contendo espaços.

---

## 12. Testes

- **Unitários (sem VS Code):** parser de `worktree list --porcelain`, builder de URL de MR, agrupador do importer, merge de `.code-workspace`, regras de ⚠.
- **Integração:** repositórios git temporários (criados no teste) com remote bare local; cobrir criação, rollback, remoção, rename, repair.
- **E2E:** `@vscode/test-electron` para comandos e TreeView.
- **Manual:** checklist em WSL + Windows nativo.

---

## 13. Questões em aberto (decidir cedo)

1. Onde guardar os worktrees por padrão: dentro da pasta dos repos (`.worktrees/`) ou ao lado? (impacta `.gitignore` e indexação do VS Code).
2. A fonte de verdade é o `treespace.json`/estado ou apenas derivação do git? (proposta: derivação + metadado leve).
3. Um set precisa ter **todos** os repos ou pode ser parcial? (proposta: parcial).
4. Padrão de branch/nome do time (ex.: `feat/<ticket>-<slug>`) deve ser validado por regex configurável?
5. Provedores de MR a suportar na v1: só GitLab (parece ser o caso, "MR") ou também GitHub?
6. Publicar no Marketplace e/ou Open VSX, ou uso interno via `.vsix`?

---

## 14. Referências úteis
- `git worktree` — https://git-scm.com/docs/git-worktree
- VS Code Extension API — https://code.visualstudio.com/api
- Remote extension kinds (`extensionKind`) — https://code.visualstudio.com/api/advanced-topics/remote-extensions
- Extensões relacionadas para inspiração: *Git Worktree Tools* (`jackiotyu.git-worktree-tools`), *GitLens* (view de Worktrees), *Project Manager* (`alefragnani.project-manager`).
