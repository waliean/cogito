# Changelog

## [0.4.0] - 2026-08-11 — 导图 AI 扩展（分支建议 + 一键生成完整图）

### 新增（导图）
- **分支建议**：导图视图选中卡片 → 工具栏「分支建议」→ AI 给出 3 条建议（深入/发散/分支各一，title≤20字 + reason≤40字）→ 浮动面板展示 → 「采纳生成」一键生成子卡（复用 generate 状态机，instruction 携带建议标题与理由）
  - 后端 `POST /api/cards/:id/suggestions`（只读、不改卡片状态；prompts/suggestions.ts；aiService.generateSuggestions 宽松校验 + 不足 3 条重试 1 次）
  - 前端 `SuggestionPanel.tsx`、工具栏按钮、store.fetchSuggestions/adoptSuggestion
- **一键生成完整图**：工具栏按钮 → 弹窗配置（深度 1-3 默认 2、每节点分支数 1-4 默认 3、实时预估生成卡数）→ BFS 串行递归生成整棵导图
  - 后端 `POST /api/workspaces/:wsId/cards/generate-tree`（treeService.generateTree）
  - 关键设计：**增量语义**（已有子卡的节点跳过，不重写子树）、**50 卡总预算**（含已有卡，超限/无根卡/参数越界 → 400）、部分失败收集 `failures` 返回 200 汇总、动态超时 `min(timeoutMs×预估调用数, 300s)+30s`
  - 前端 `GenerateTreeDialog.tsx`、store.generateTree（成功后自动刷新树）

### 测试
- 后端 144 用例（新增 suggestions prompt/aiService 7 + treeService 10 + 集成 8；基线 114）
- 前端 55 用例（新增 apiClient 3 + stores 6）
- 浏览器端到端验证：分支建议 3 条展示、采纳生成落卡、一键生成（2 卡生成/1 根处理/2 根跳过增量语义）、无控制台错误

## [0.3.0] - 2026-08-04 — 桌面封装（Electron）

### 新增（桌面版）
- **Electron 主进程** `electron/main.cjs`：单实例锁、spawn 后端子进程（`ELECTRON_RUN_AS_NODE`）、stdout 解析随机端口、BrowserWindow、系统托盘（关闭最小化/退出）、退出时清理后端
- **Windows 安装包**：electron-builder + NSIS（自定义安装目录、桌面/开始菜单快捷方式、卸载器）；便携版 `win-unpacked/Cogito.exe`
- **后端生产化**：`DATA_DIR`/`FRONTEND_DIST`/`PORT=0` 环境变量支持；Express 静态托管 + SPA fallback；`server.address().port` 输出实际端口
- **@cogito/shared 编译产物化**：`main` 指向 `dist/index.js`（纯 Node 运行时加载）
- **应用图标**：`scripts/generate-icon.mjs`（256×256 PNG 知识树图形）+ `scripts/make-ico.mjs`（PNG-in-ICO）
- **文档**：`docs/packaging.md`（构建/打包/验证/常见问题）、README 桌面版章节、design.md 第 11 节桌面封装架构

### 修复
- 随机端口模式下 stdout 输出 `PORT=0`（改为输出 `server.address().port` 实际端口）
- 打包产物图标尺寸不足（32×32 → 256×256 生成器）
- 构建文件锁（EBUSY/EPERM）：输出目录移至 `E:\cogito\release` 规避防病毒扫描

## [0.1.0] - 2026-08-04 — M2–M5 全部完成

### 新增（功能）
- **M2 AI 接入**
  - 后端 `aiService`：openai SDK 封装（JSON 模式、60s 超时、SDK 重试 3 + 解析重试 1、错误码映射 E_NO_API_KEY/E_INVALID_API_KEY/E_AI_RATE_LIMIT/E_AI_TIMEOUT/E_AI_ERROR）
  - `POST /api/cards/:id/generate`：状态机 draft→processing→done|failed；processing 防重入 409 E_CARD_BUSY；失败响应体携带父卡
  - `GET/PUT /api/settings`（永不回传 Key 明文）+ `POST /api/settings/test` 测试连接
  - `X-API-Key` 中间件（header > settings > env 三级 Key 解析）
  - 前端设置面板（Key/BaseURL/模型/温度/超时/测试连接）
  - 前端卡片生成交互：三模式按钮 + 指令输入 + status 角标 + failed 一键重试 + aiMeta 展示
- **M3 MindScape**
  - @xyflow/react + dagre 确定性布局（dagreLayout 纯函数）；自定义节点（类型/状态徽标）；点击节点联动详情；MiniMap 状态着色
- **M4 文档处理**
  - multer 上传（10MB 上限、mimetype+扩展名成对校验防伪造）；pdf-parse 提取、iconv-lite UTF-8/GBK 解码
  - 串行摘要流水线（202 → 队列 → 提取 → AI 摘要 → 自动建根卡 sourceDocumentId）
  - `GET/DELETE /api/documents/:id`、`POST /api/documents/:id/retry`；前端上传面板 + 1.5s 轮询 + 重新摘要
- **M5 打磨**
  - 术语库（聚合计数、点击联动）；TermText 最长优先高亮；Markdown 详情 TreeWalker 文本节点包裹高亮
  - 错误码 → 中文文案映射（429 限流/504 超时/无 Key 引导设置）
  - README 重写（功能/快速开始/API 概览/Key 配置）

### 修复
- `STATUS_MAP` 补齐 AI/文档错误码（E_NO_API_KEY→400、E_INVALID_API_KEY→401、E_AI_RATE_LIMIT→429、E_AI_ERROR→502、E_AI_TIMEOUT→504、E_FILE_TOO_LARGE→413、E_UNSUPPORTED_TYPE→415、E_PDF_NO_TEXT/E_TXT_DECODE→422）
- 生成成功父卡回到 `done`（此前遗漏，符合 design.md 2.1 状态机）
- 文档类型校验改为成对一致（防 .pdf 伪装 text/plain）
- pdf-parse 走 `lib/pdf-parse.js` 子路径（ESM 兼容，避开 index.js module 检测）+ 类型声明

### 测试
- 后端 106 用例（新增 aiService 15 / textExtract 9 / documentService 5 / 集成补 settings+generate+documents）
- 前端 21 用例（新增 stores / TermText / dagreLayout / apiClient）
- 浏览器端到端验证 26/26 通过（首页/设置/工作区/编辑器生成区/导图/文档抽屉，无控制台错误）
