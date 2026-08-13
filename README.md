# Cogito — AI 知识卡片探索工作区

> 一个 AI 驱动的**本地**知识探索工具。**思考的主体始终是人**——AI 负责把人的思考「展开」：以「卡片」为最小知识单元，把零散的想法拆解、扩展成一棵可回溯的知识树，并以思维导图可视化；同时支持把 PDF/TXT 文档一键转化为结构化的卡片摘要。

「Cogito」取自笛卡尔的名言 *Cogito, ergo sum*（我思故我在）。它不做「你问它答」的对话——对话把思考外包给了 AI；它做的是「**你思它拓**」：**你负责想，AI 负责把你想到的方向继续拆开、铺开、分出去**。

---

## 目录

- [为什么是 Cogito](#为什么是-cogito)
- [核心功能](#核心功能)
- [设计思路：辅助人思考，而不是代替人思考](#设计思路辅助人思考而不是代替人思考)
- [系统架构](#系统架构)
- [快速开始](#快速开始)
- [桌面应用](#桌面应用-electron)
- [配置 API Key](#配置-api-key)
- [API 概览](#api-概览)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [相关文档](#相关文档)

---

## 为什么是 Cogito

常见的 AI 问答工具是「一次性」的：问完即弃，知识无法沉淀；更关键的是，**思考的主动权在不知不觉中交给了 AI**——你被答案牵引，而不是被自己的问题驱动。

Cogito 把关系反了过来：

1. **思考的主体是人，AI 是「展开」的工具** —— 人负责选题、定方向、判质量；AI 只做最机械的那一步：把一个大主题拆成语义连贯、有增量的小卡片。
2. **知识是可生长的** —— 一个主题可以不断向下深化、横向发散、独立分支，最终长成一棵树；这棵树由你的每一次「想」浇灌出来。
3. **AI 的输出只是草稿，人是最后的裁判** —— 每张卡片都可编辑、可删、可挪，AI 的生成携带 `aiMeta` 可溯源，你永远可以推翻它。
4. **本地优先、隐私可控** —— 数据与 API Key 都只存在你自己的机器上，不经过任何云端。

---

## 核心功能

### 工作区（Workspace）

- 多工作区隔离：创建 / 改名 / 删除，每个工作区自动带一张根卡片。
- 删除工作区时级联清理其下所有卡片、文档记录与上传文件。

### 卡片知识树（Card Tree）

- 卡片是知识的最小单元：`title` + Markdown `content` + 术语 `terms`，可手动创建与编辑。
- 树结构由 `parentId` 在服务端聚合派生，删除卡片时子节点**提升为根**，不会静默丢弃子树。
- 卡片状态机 `draft → processing → done | failed`：生成中的卡片防重入（`409 E_CARD_BUSY`），失败卡片可一键重试。

### 三种 AI 扩展模式

对任意卡片，AI 可以按三种「思维方向」生成子卡片：

> 这三种模式不是 AI 的「模式」，而是**人类思考时的三种心智动作**的外化——你本来就会「钻进去想深一点」「往旁边联想」「把一个概念单独拎出来想」。Cogito 只是把它们变成了明确的按钮。

| 模式 | 语义 | 类比 |
|---|---|---|
| **child（深入）** | 从父卡片向下深化，拆解一个更具体的子主题 | 钻进去，纵向加深 |
| **divergent（发散）** | 从父卡片横向发散，探索相邻 / 相关主题 | 展开来，横向铺开 |
| **branch（分支）** | 针对父卡片中的某个术语 / 观点独立成支 | 拎出来，单点突破 |

每次生成都会记录 `aiMeta`（模型 / tokens / 耗时 / 错误码），让每一张卡片的「来源」都可溯源。

### 思维导图（MindScape）

- 基于 `@xyflow/react` + `dagre` 的**确定性自动布局**，卡片树一键化为思维导图。
- 自定义节点：卡片预览 + 类型 / 状态角标 + 术语徽标。
- 点击节点联动详情面板；MiniMap 按卡片状态着色；支持手动拖拽，点「自动布局」回归 dagre 排版。
- 列表视图与导图视图共享同一份数据，切换只换渲染层、不重复请求。

### 导图 AI 扩展（v0.4.0）

- **分支建议**：选中卡片 → 「分支建议」→ AI 针对当前卡片给出深入 / 发散 / 分支三条建议（标题 ≤20 字 + 理由 ≤40 字）→ 浮动面板展示 → 一键「采纳生成」落卡。
- **一键生成完整图**：配置深度（1–3）与每节点分支数（1–4）→ 串行递归生成整棵导图。关键语义：
  - **增量**：已有子卡的节点跳过，不重写子树（幂等，重复点击安全）。
  - **预算**：总卡数上限 50，超限自动截断。
  - **容错**：单个节点失败会收集进 `failures` 汇总返回，不中断整棵树的生成。

### 文档自动摘要

- 上传 PDF / TXT（≤10MB，类型与扩展名成对校验防伪造）。
- 异步流水线：`202 接受 → 串行队列 → 文本提取 → AI 结构化摘要 → 自动生成一张根卡片`，并关联 `sourceDocumentId`。
- 中文友好：TXT 自动识别 UTF-8 / GBK；扫描件 PDF 无文本层时明确提示 `E_PDF_NO_TEXT`（暂不支持 OCR）。
- 前端 1.5s 轮询进度；失败可「重新摘要」。

### 术语库（Term Library）

- 聚合当前工作区全部卡片的术语，去重计数。
- 点击术语 → 卡片树、导图、详情 Markdown **联动高亮**。
- 高亮采用「最长优先」匹配，避免短词截断长词；Markdown 渲染后仅包裹文本节点，不引入 XSS 面。

### 设置与连接

- API Key 本地存储（落盘 `backend/data/db.json`），**永不回传明文**（`GET /api/settings` 只返回 `hasApiKey`）。
- 可配置模型 / Base URL / 温度 / 超时，一键「测试连接」验证连通性。
- Key 解析三级覆盖：请求头 `X-API-Key` > 设置面板保存 > 环境变量 `DEEPSEEK_API_KEY`。

---

## 设计思路：辅助人思考，而不是代替人思考

> 这一节是 Cogito 的设计哲学——「为什么这么设计」，以及「它如何服务于人的思考」。技术决策的完整权衡见 [docs/design.md](docs/design.md)（含 ADR 记录）。

### 0. 核心哲学：人是思考的主体

Cogito 的一切设计都基于一个判断：**思考（判断、取舍、联想、怀疑）是人的专属能力，而「展开」（拆解、归纳、罗列、改写）是 AI 擅长且廉价的机械劳动。**

- **人做的**：选题、定方向、判断对错、删改重组、决定「这棵树长成什么样」。
- **AI 做的**：把「人想出来的那个方向」继续拆开、铺开、分出去，产出草稿级的小卡片。
- **结果**：你的思考被 AI **放大**，而不是被 AI **替代**——每点一次「生成」，都是在借 AI 的手，把自己的思路往下推一层。

### 1. 卡片即知识原子

知识被切成一个个**原子化的卡片**（短标题 + 200~500 字 Markdown + 术语），而不是一篇长文。原子化带来的好处：每张卡片语义自洽、可独立复用、可挂到任意位置、可被 AI 稳定地「续写」。树的父子关系只在读取时由 `parentId` 聚合，不冗余存 `children`，从根上避免「悬挂边」。

### 2. 三种扩展模式 = 三种思维维度

「深入 / 发散 / 分支」不是拍脑袋的三个按钮，而是把**人类扩展知识时的三种心智动作**显式化——它们对应的是你在脑中「钻进去」「铺开来」「拎出来」的三种原始动作：
- **深入**（child）= 纵向拆解，把一个主题讲得更细；
- **发散**（divergent）= 横向联想，探索邻近主题；
- **分支**（branch）= 单点突破，把一个概念独立出来深挖。

模式与卡片类型一一对应（`GenerationMode = CardType`），AI 的 prompt 会据此给出明确的差异化指令（见 `backend/src/prompts/generate.ts`）。

### 3. 状态机与并发控制

```
draft --(POST /generate)--> processing --> done
                              |
                              +--(AI 失败/解析失败)--> failed
failed --(再次 generate)--> processing
```

- 生成中的卡片再次触发会得到 `409 E_CARD_BUSY`，防止重复扣费与状态错乱。
- 失败是可恢复的：父卡置 `failed`、`aiMeta.error` 记录错误码，重试走同一入口。

### 4. 可溯源的 AI 元信息（aiMeta）

每张 AI 生成的卡片都携带 `aiMeta`：模型名、生成模式、prompt / completion tokens、耗时、错误码、是否发生过解析重试。这让「这张卡是哪次调用、花了多少、有没有重试」都能被追溯，也便于定位幻觉与成本。

### 5. 增量语义（幂等）

一键生成完整图采用 **BFS + 增量跳过**：只对「还没有子卡」的节点生成，已有子树的节点一律跳过。这意味着重复点「生成」是安全的——不会重写你已经满意的那部分知识。

### 6. 本地优先与隐私

- 存储用一个 JSON 文件（`db.json`）+ 原子写 + 写队列 + 损坏恢复，**备份 = 复制一个文件**，排障直观；数据量增长后可经 `Storage` 接口平替 SQLite。
- API Key 明文只存在于本机 `backend/data/db.json`（已 `.gitignore`），服务端接口永不回传 Key，打包产物不含任何运行数据。

### 7. 异步文档流水线

文档上传不阻塞请求：`202 接受 → 串行队列（防并发触发限流）→ 提取 → AI 摘要 → 自动落根卡`。串行队列是刻意的——文档摘要会一次性消耗大量 tokens，串行可避免瞬时触发 DeepSeek 的 429 限流。

### 8. 确定性布局

导图布局抽成纯函数 `dagreLayout(nodes, edges)`，输入同一棵树必然得到同一张图（可快照测试）。这样后续要换更美观的 elkjs 时，只需替换这一个纯函数，UI 层零改动。

### 9. 术语高亮的安全渲染

- 纯文本视图：术语按长度降序合并成一条正则做 `split` 高亮，**最长优先**天然避免「人工智能」被「人工」截断。
- Markdown 视图：先由 markdown-it 渲染成 HTML，再用 `TreeWalker` **只包裹文本节点**，不解析任何 HTML 结构，不新增 XSS 攻击面。

### 10. 错误码 → 中文文案

后端统一返回 `{ error: { code, message } }`，前端把错误码映射成友好文案：`429` 限流 →「模型限流，请稍后重试」；`504` →「生成超时，可重新生成」；`E_NO_API_KEY` → 引导跳转设置页。用户永远看到的是「该怎么办」，而不是一坨技术栈。

---

## 系统架构

```
┌─────────────────────────────────────────────────────────┐
│  Electron 主进程 (electron/main.cjs)                      │
│  单实例锁 · spawn 后端子进程 · 系统托盘 · 退出清理         │
└──────────────────────────┬──────────────────────────────┘
                           │ spawn (ELECTRON_RUN_AS_NODE)
                           ▼
┌─────────────────────────────────────────────────────────┐
│  后端进程 (Express 5, 随机端口 PORT=0)                    │
│  中间件: apiKey(覆盖规则) → error(统一错误体)             │
│  路由: workspaces / cards(+generate/建议/整树)            │
│        documents(multer) / settings                      │
│  服务: cardService / aiService(openai SDK)                │
│        documentService / treeService / workspaceService   │
│  存储: jsonStore(内存缓存+原子写队列) → db.json            │
│  静态: 托管 frontend/dist + SPA fallback（同源无 CORS）    │
└──────────────────────────┬──────────────────────────────┘
                           │ /api
                           ▼
┌─────────────────────────────────────────────────────────┐
│  前端 (React 19 + Vite 8 + Zustand 5)                     │
│  AppShell：侧栏(工作区/文档/术语库) + 视图切换             │
│  store: workspace/card/document/settings/ui               │
│  视图: 卡片树 ⇄ 思维导图（共享同一 cardStore）             │
└─────────────────────────────────────────────────────────┘
```

开发模式下后端跑在 `:3001`、前端 Vite 跑在 `:5173`（`/api` 代理到后端）；生产模式由 Electron 拉起后端子进程、由 Express 直接托管前端静态产物。

---

## 快速开始

```bash
# 环境要求：Node.js 22+（推荐 v24.18）、npm 11+、Windows 10/11
npm install        # 根目录一次安装全部 workspace（shared/backend/frontend）

npm run dev        # 后端 :3001 + 前端 :5173（Vite 热更新）

npm run build      # 编译 shared → backend → frontend
npm test           # 后端 144 用例 + 前端 55 用例
npm run typecheck  # 三包类型检查
```

## 桌面应用（Electron）

Cogito 可作为 Windows 桌面应用运行（原生窗口、系统托盘、安装/卸载程序）。

### 快速体验

从 [Releases](https://github.com/waliean/cogito/releases) 下载最新版：

- `Cogito Setup x.x.x.exe` —— 安装包（推荐，支持自定义目录 + 桌面/开始菜单快捷方式）
- `Cogito-0.4.0-portable-win64.zip` —— 便携版，解压后运行 `Cogito.exe` 即用

### 手动构建

```bash
npm run dist:win
# 产物：release/Cogito Setup x.x.x.exe（安装包） + release/win-unpacked/（便携版）
```

详细打包与验证清单见 [docs/packaging.md](docs/packaging.md)。

## 配置 API Key

三种方式（优先级从高到低）：

1. 请求头 `X-API-Key: sk-xxx`（临时覆盖，不落盘）
2. 前端「设置」面板保存（落盘 `backend/data/db.json`，永不回传明文）
3. 环境变量 `DEEPSEEK_API_KEY`（`.env`，第三级兜底）

首次使用：启动 Cogito → 右上角「设置」→ 填入 DeepSeek API Key → 保存 → 「测试连接」验证连通性。

## API 概览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/health | 健康检查 + AI 配置状态 |
| GET/POST/PATCH/DELETE | /api/workspaces | 工作区 CRUD（删除级联清理） |
| GET/POST | /api/workspaces/:wid/cards | 卡片列表（`?tree=true` 树形）/ 手动建卡 |
| GET/PATCH/DELETE | /api/cards/:id | 单卡操作（删除时子节点提升为根） |
| POST | /api/cards/:id/generate | AI 生成子卡 `{mode, instruction?}` |
| POST | /api/cards/:id/suggestions | AI 分支建议（只读，不改卡片状态） |
| POST | /api/workspaces/:wsId/cards/generate-tree | 一键生成完整导图（增量、50 卡预算） |
| POST | /api/workspaces/:wid/documents | multipart 上传（202 异步） |
| GET/DELETE | /api/documents/:id | 单条（轮询用）/ 删除 |
| POST | /api/documents/:id/retry | 失败重新摘要 |
| GET/PUT | /api/settings | 设置（无 Key 明文）；PUT `apiKey` 空串 = 清除 |
| POST | /api/settings/test | 测试连接 |

错误统一 `{ "error": { "code", "message" } }`，错误码表见 [docs/design.md](docs/design.md) §3.4。

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面壳 | Electron 43 + electron-builder 26（NSIS 安装包） |
| 前端 | React 19 + TypeScript + Vite 8 + Zustand 5 + @xyflow/react + dagre + markdown-it |
| 后端 | Express 5 + multer + pdf-parse + iconv-lite + openai SDK（DeepSeek） |
| 存储 | JSON 文件存储（原子写 + 写队列 + 损坏恢复，`Storage` 接口可平替 SQLite） |

## 项目结构

```
cogito/
|-- shared/      # 前后端共享：领域类型 + 常量（@cogito/shared）
|-- backend/     # Node + Express 服务：路由 / 服务 / 存储 / prompt
|-- frontend/    # React + Vite：组件 / store / api
|-- electron/    # 桌面壳：主进程 + preload + 图标
|-- scripts/     # 构建 / 图标生成脚本
|-- docs/        # design.md（技术设计 + ADR）、packaging.md（封装指南）
|-- release/     # 构建产物（gitignore，见 Releases）
```

## 相关文档

| 文档 | 内容 |
|---|---|
| [docs/design.md](docs/design.md) | 完整技术设计：数据 Schema、API 契约、状态机、Prompt 设计、风险清单、ADR |
| [docs/packaging.md](docs/packaging.md) | 桌面封装指南：构建、打包、验证、常见问题 |
| [CHANGELOG.md](CHANGELOG.md) | 版本变更记录 |
