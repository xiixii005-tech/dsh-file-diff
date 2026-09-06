# File Diff Timeline — 正式客户端包 + 部署说明

本目录是把动态插件 `fdiff-1` 整理成的**正式客户端插件包**（`@deepseek-ai/dsh-client-ui-file-diff-timeline`），用于让它在 **dsh web 每次启动时自动加载**，无需每次手动 `cordis_run`。

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

- 正式客户端包通过 `package.json` 的 `dsh.client` 声明 + `exports["./client"]` 被发现（`client-modules` 扫描 Loader entries）
- `lib/client.js` 是 `window.__ModuleLoader__.load({ id, factory })` 闭包工厂：`React` 从模块表 `require("react")` 获取，样式由 `apply` 内的 `ctx.effect` 自管注入（带 `data-plugin-css` 去重标签），随 fiber 停止自动移除
- 在组合里加一行 `insert`，web 启动时即作为普通客户端插件挂载

## 部署步骤（在 ~/.dsh/profiles/web/ 手动执行）

### 1. 让 profile 的 Loader 能解析该包

profile 的模块解析经 `C:\Users\Admin\.dsh\profiles\web\node_modules`（由 `healProfileModuleFallback` 从 bundle 依赖闭包填充，只含 bundle 依赖），以及 profile 本地 `.dsh-module-fallback\node_modules`（profile 专属，启动时投影进 `profile/node_modules`）。

**推荐做法 A：加为 profile 依赖（最标准）**

在 `C:\Users\Admin\.dsh\profiles\web\package.json` 的 `dependencies` 加：

```json
"@deepseek-ai/dsh-client-ui-file-diff-timeline": "file:D:/works/dsh/dsh-file-diff/plugins/fdiff-file-diff-timeline/package"
```

然后在该目录执行（`dsh plugin add` 也可，但 `file:` 依赖更直接）：

```sh
cd C:\Users\Admin\.dsh\profiles\web
pnpm install
```

这会把它链接进 `profiles/web/node_modules/@deepseek-ai/`。

**做法 B：手动 junction（不装依赖）**

```sh
# 在 profile 本地回退目录建作用域
mkdir C:\Users\Admin\.dsh\profiles\web\.dsh-module-fallback\node_modules\@deepseek-ai
# junction 指向包目录
mklink /J C:\Users\Admin\.dsh\profiles\web\.dsh-module-fallback\node_modules\@deepseek-ai\dsh-client-ui-file-diff-timeline ^
  D:\works\dsh\dsh-file-diff\plugins\fdiff-file-diff-timeline\package
```

启动时 `healProfileModuleFallback` 会把它投影到 `profiles/web/node_modules/@deepseek-ai/`。

### 2. 在 profile 组合加一行

编辑 `C:\Users\Admin\.dsh\profiles\web\cordis.patch.yml`，追加：

```yaml
- insert:
    - id: ui-file-diff-timeline
      name: '@deepseek-ai/dsh-client-ui-file-diff-timeline'
```

`patchReload: live` —— 但**新增包名需要 Loader 在启动时解析**（模块链接步骤 1 也要在启动前就位），所以完成后**重启 dsh web 进程**最稳：

```sh
# 停止当前 web（Ctrl+C 或结束进程），然后重新启动 profile
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

## 与动态插件（fdiff-1）的关系

- `fdiff-1/pkg-1..5` 是会话内动态插件，进程重启即丢失，仅用于开发调试
- 本包是同一代码的正式形态：功能完全一致，但随 profile 组合每次启动自动加载
- 动态插件仍运行时不冲突（注册同名 slot 时按 priority 竞争；正式包 priority −1 会优先）
