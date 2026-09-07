# dsh-file-diff — File Diff Overview（文件修改总览）

DSH Web 的修改文件总览插件：在每轮会话末尾展示「修改 N 个文件」行（文件 chip 可点开 diff 抽屉），在会话头部提供「修改记录」按钮（会话级文件修改总览）。

## 命名（统一）

本包所有标识符统一为 `filediff` / `fdiff-` 体系：

| 项 | 值 |
| --- | --- |
| 功能名 | File Diff Overview（文件修改总览） |
| 包名 | `dsh-file-diff` |
| bundle 注册 id | `dsh-file-diff`（`__ModuleLoader__.load` 必须用包名，client-modules 按它校验） |
| 组合行 id | `filediff-overview`（仅 cordis 组合内的行标识，可任意） |
| 会话节点 kind / turn 数据 key | `filediff` |
| CSS 类前缀 | `fdiff-` |
| 样式去重标签 | `filediff:styles` |
| Slot id：会话按钮 | `filediff.sessionBtn` |
| Slot id：diff 面板 | `filediff.panel` |
| turn 行 | chain 贡献（按 `select` 注册），语义名 `filediff.turnRow` |
| UI 文案 | 修改 N 个文件 / 全部修改 / 修改记录 |

## 目录结构

```
package/
├── package.json              # name + dsh.client 声明 + exports["./client"] + scripts.build
├── scripts/
│   └── build-client.mjs      # 构建：lib/styles.css + lib/client.template.js → lib/client.js
└── lib/
    ├── styles.css            # ★ 样式唯一源（手动调整这里，纯 CSS 无需转义）
    ├── client.template.js    # ★ 应用逻辑模板（含 __PLUGIN_CSS__ 占位）
    ├── client.js             # 部署产物（GENERATED，由 npm run build 生成，勿手改）
    ├── index.js              # node half 占位（纯客户端插件，host 逻辑为空）
    └── types/                # 类型占位
```

`lib/client.js` 由 `npm run build` 从 `lib/styles.css` + `lib/client.template.js` 生成；产物保持 `__ModuleLoader__.load({ id: "dsh-file-diff" })` 格式，与 ui-deliverables 同构，`apply` 内 `ctx.get('uiConversation')` / `ctx.get('slots')` 在缺失时安全降级。

## 手动调整样式（改样式工作流）

样式**唯一源**是 `lib/styles.css`（纯 CSS，直接编辑，无需转义）。改完运行：

```sh
npm run build     # 重新生成 lib/client.js
```

- `link:` 部署（推荐）：junction 直连工作区，构建后**重启 web 即生效**，无需重装依赖。
- `file:` 部署：pnpm 在安装时快照副本，构建后需 `pnpm install --force` 重新同步再重启。

当前主要配色在 `lib/styles.css` 中：

| 位置 | 选择器 | 值 |
| --- | --- | --- |
| 字符串 token | `.fdiff-tok-string` | `#2d7747` |
| 数字 token | `.fdiff-tok-number` | `#ad7311` |
| diff 抽屉背景 | `.fdiff-panel` | `#ffffff` |
| 增/删行底色 | `.fdiff-add td` / `.fdiff-del td` | `color-mix(...)` |
| 关键字色 | `.fdiff-tok-keyword` | `var(--dsw-alias-brand-primary)` |

> 不要直接改 `lib/client.js`（GENERATED，会被下次 build 覆盖）；调整逻辑改 `lib/client.template.js`。

## 工作原理

- **会话节点**：在 `uiConversation.events.register` 注册 `kind: 'filediff'` 的节点。`update` 阶段跟踪 `write` / `edit` 工具的调用与结果，把每次成功修改聚合成 `{ seq, path, diffs }`，按轮存进 turn 节点数据（key `filediff`）。
- **数据来源双通道**：turn 行优先读节点数据；会话级总览从 Trajectory 账本（`eventNodes` + `eventLocations`）用 `collectSessionChanges` 重建同一结构，因此会话总览不依赖实时节点数据。
- **三个 Slot**：
  - `conversation.chat.turnTail`（chain，selector `selectFileDiffs`）→「修改 N 个文件」行；
  - `conversation.session.header.utilities`（list）→「修改记录」按钮；
  - `shell.overlay`（list）→ 右侧 diff 抽屉（GitHub 风格 + 内置语法高亮 + 可拖拽调宽）。
- **diff 引擎**：紧凑 LCS（最长公共子序列）；语法高亮为内置 tokenizer（动态插件无法 import 外部模块）。

## 标准方案：以动态 Cordis 插件加到当前 Web

在 DSH 会话中可用动态 Cordis 插件直接挂载同一功能（如本会话的 `fdiff-1`，pkg-2），无需改 profile、无需重启。动态插件逻辑与 `lib/client.template.js` 一致，仅按动态插件环境做标准适配：

- 直接 `return { apply(ctx) { ... } }`，不用 `__ModuleLoader__` 包装
- React 由环境注入（`React.createElement`），`styles.insert(css)` 注入样式
- 不引用 `window` / `document`（拖拽改宽用 Pointer Capture 方案）
- 用 `ctx.get('uiConversation')` / `ctx.get('slots')` 并做缺失降级

动态插件随进程存活，`cordis_stop` / `cordis_undefine` 即移除，适合开发、验证、临时演示。

## 部署步骤（把本包作为正式客户端包装入 ~/.dsh/profiles/web/）

### 1. 让 profile 的 Loader 能解析该包

**原理（先读）**：`client-modules` 扫描 Loader 的 entry——组合里那一行的 `name` 就是
**包 specifier**，由 Loader 从 profile 树做 node 解析（根在 `%HOME%\.dsh\profiles\web\`），
解析出包的 `package.json`，再读 `dsh.client` 声明 + `exports["./client"]` 注册为 web 插件。
所以关键只有一条：**该包必须能被 profile 的 node 解析找到**（通常在
`profiles/web/node_modules/dsh-file-diff`）——至于它是 pnpm 链接、junction 还是复制目录都可以。

> ⚠️ `healProfileModuleFallback` 只投影「所选 bundle 依赖闭包」里的包到
> `.dsh-module-fallback\node_modules`，并会在启动时**删除**不在该闭包中的自有链接。
> 因此**不要把用户包塞进 `.dsh-module-fallback`**（旧做法已被清理逻辑废弃）。

**推荐做法 A：加为 profile 依赖（最标准，源码留在原位不复制）**

在 `%HOME%\.dsh\profiles\web\package.json` 的 `dependencies` 加（`file:` 路径相对
profile 目录解析，跨盘建议写绝对路径，注意用正斜杠）：

```json
"dsh-file-diff": "file:./dsh-file-diff"
```

> 想「改完 `npm run build` 即生效、无需重装」？把 `file:` 换成 `link:` 即可
> （pnpm 建 junction 直连工作区，见「手动调整样式」一节）。`file:` 跨盘是安装时快照，需 `pnpm install --force` 重新同步。

然后在该目录执行：

```sh
cd %HOME%\.dsh\profiles\web
pnpm install
```

pnpm 会以链接形式把它放进 `profiles/web/node_modules/dsh-file-diff`（真实文件仍在你的工作区，不复制两份）。

**做法 B：手动 junction（不装依赖）**

直接在 profile 的 node_modules 下建 junction 指向包目录（⚠️ 不是 `.dsh-module-fallback`）：

```sh
mklink /J "%HOME%\.dsh\profiles\web\node_modules\dsh-file-diff" "D:\works\dsh\dsh-file-diff"
```

**做法 C：直接复制**（能工作，但不受 pnpm 管理、易漂移，不推荐）：

```sh
robocopy D:\works\dsh\dsh-file-diff "%HOME%\.dsh\profiles\web\node_modules\dsh-file-diff" /E
```

### 2. 在 profile 组合加一行

编辑 `%HOME%\.dsh\profiles\web\cordis.patch.yml`，追加。**`name` 必须是包名
`dsh-file-diff`**（Loader 按它解析；client-modules 也按它校验 bundle 注册，见下）。
`id` 只是该行在组合里的标识，可任意：

```yaml
- insert:
    - id: filediff-overview
      name: 'dsh-file-diff'
```

新增包名需要 Loader 在启动时解析（模块链接步骤 1 也要在启动前就位），完成后**重启 dsh web 进程**最稳：

```sh
dsh web --profile web
```

### 3. 验证

- 启动后打开任一会话，让 agent 修改文件 → 每轮末尾出现「修改 N 个文件」行
- 点击文件 chip → 右侧出现 diff 抽屉（GitHub 风格 + 语法高亮 + 可拖拽调宽）
- 头部「修改记录」按钮 → 会话级修改总览
- 检查浏览器控制台无 `client-modules` 组合错误；若包未解析会有 `client-modules: 1 client package failed to compose` 之类报错

### 常见错误排查

- **`client-modules: bundle ... loaded without registering "dsh-file-diff"`**
  → `lib/client.js` 里 `__ModuleLoader__.load({ id })` 的 id 必须是**包名 `dsh-file-diff`**，
    不是 `filediff-overview`。id 不对 = bundle 没注册 → 整条 loader entry 导入失败。
- **`client-modules: duplicate factory registration for "@deepseek-ai/..." (bundle executed twice)`
  → 上一个错误的连锁反应：bundle 注册失败 → loader 重试导入整条 combo → 首个模块重复注册。
    修复 id 后**彻底重启 web 进程**，并在浏览器**硬刷新**（清掉旧的 combo 状态）。
- **`client-modules: 1 client package failed to compose`**
  → 包未被 Loader 解析：确认 `profiles/web/node_modules` 里能找到该包、组合行 `name` 写的是包名。
- **两个 id 是两回事**：组合行 `id: filediff-overview`（可任意）；bundle 注册
  `__ModuleLoader__.load({ id: "dsh-file-diff" })`（**必须等于包名**，client-modules 按它校验）。

## 回滚

- 删除 `cordis.patch.yml` 里加的 `insert` 块
- 移除 `package.json` 里的依赖（或删除 junction / 复制目录）
- 重启 web
