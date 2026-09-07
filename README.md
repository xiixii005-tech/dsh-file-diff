# dsh-file-diff — File Diff Overview（文件修改总览）

DSH Web 的修改文件总览插件：在每轮会话末尾展示「修改 N 个文件」行（文件 chip 可点开 diff 抽屉），在会话头部提供「修改记录」按钮（会话级文件修改总览）。

## 命名（统一）

本包所有标识符统一为 `filediff` / `fdiff-` 体系：

| 项 | 值 |
| --- | --- |
| 功能名 | File Diff Overview（文件修改总览） |
| 包名 | `dsh-file-diff` |
| 模块/入口 id | `filediff-overview` |
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
├── package.json          # name + dsh.client 声明 + exports["./client"]
└── lib/
    ├── client.js         # 浏览器 half（__ModuleLoader__.load 格式，与 ui-deliverables 同构）
    ├── index.js          # node half 占位（纯客户端插件，host 逻辑为空）
    └── types/            # 类型占位
```

`lib/client.js` 已验证：`node` 模拟 `__ModuleLoader__.load` 执行成功，工厂返回含 `apply` 的插件对象，`apply` 内 `ctx.get('uiConversation')` / `ctx.get('slots')` 在缺失时安全降级。

## 工作原理

- **会话节点**：在 `uiConversation.events.register` 注册 `kind: 'filediff'` 的节点。`update` 阶段跟踪 `write` / `edit` 工具的调用与结果，把每次成功修改聚合成 `{ seq, path, diffs }`，按轮存进 turn 节点数据（key `filediff`）。
- **数据来源双通道**：turn 行优先读节点数据；会话级总览从 Trajectory 账本（`eventNodes` + `eventLocations`）用 `collectSessionChanges` 重建同一结构，因此会话总览不依赖实时节点数据。
- **三个 Slot**：
  - `conversation.chat.turnTail`（chain，selector `selectFileDiffs`）→「修改 N 个文件」行；
  - `conversation.session.header.utilities`（list）→「修改记录」按钮；
  - `shell.overlay`（list）→ 右侧 diff 抽屉（GitHub 风格 + 内置语法高亮 + 可拖拽调宽）。
- **diff 引擎**：紧凑 LCS（最长公共子序列）；语法高亮为内置 tokenizer（动态插件无法 import 外部模块）。

## 标准方案：以动态 Cordis 插件加到当前 Web

在 DSH 会话中可用动态 Cordis 插件直接挂载同一功能（推荐做法），无需改 profile、无需重启：

```js
// 参考实现见 docs/dynamic-plugin.client.js
// 要点（动态插件环境下的标准写法）：
//   - 直接 return { apply(ctx) { ... } }，不用 __ModuleLoader__ 包装
//   - React 由环境注入（React.createElement），styles.insert(css) 注入样式
//   - 不引用 window / document（拖拽改宽用 Pointer Capture 方案）
//   - 用 ctx.get('uiConversation') / ctx.get('slots') 并做缺失降级
```

动态插件随进程存活，`cordis_stop` / `cordis_undefine` 即移除，适合开发、验证、临时演示。

## 部署步骤（把本包作为正式客户端包装入 ~/.dsh/profiles/web/）

### 1. 让 profile 的 Loader 能解析该包

profile 的模块解析经 `%HOME%\.dsh\profiles\web\node_modules`（由 `healProfileModuleFallback` 从 bundle 依赖闭包填充），以及 profile 本地 `.dsh-module-fallback\node_modules`（profile 专属，启动时投影进 `profile/node_modules`）。

**推荐做法 A：加为 profile 依赖（最标准）**

在 `%HOME%\.dsh\profiles\web\package.json` 的 `dependencies` 加：

```json
"dsh-file-diff": "file:dsh-file-diff"
```

然后在该目录执行：

```sh
cd %HOME%\.dsh\profiles\web
pnpm install
```

**做法 B：手动 junction（不装依赖）**

```sh
# 在 profile 本地回退目录建作用域
mkdir %HOME%\.dsh\profiles\web\.dsh-module-fallback\node_modules\@deepseek-ai
# junction 指向包目录
mklink /J %HOME%\.dsh\profiles\web\.dsh-module-fallback\node_modules\dsh-file-diff ^
 dsh-file-diff
```

### 2. 在 profile 组合加一行

编辑 `%HOME%\.dsh\profiles\web\cordis.patch.yml`，追加：

```yaml
- insert:
    - id: filediff-overview
      name: 'filediff-overview'
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

## 回滚

- 删除 `cordis.patch.yml` 里加的 `insert` 块
- 移除 `package.json` 里的依赖（或删除 junction）
- 重启 web
