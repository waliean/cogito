# Cogito — AI 知识卡片探索工作区技术设计文档

- 版本：v1.0
- 日期：2026-08-04
- 作者：架构师（亨利）
- 状态：已评审，可交付 implementer
- 关联：planner 实施计划；架构决策简录见第 9 节（ADR-001/002/003）

## 0. 决策摘要

| 编号 | 决策点 | 结论 | 一句话理由 |
|---|---|---|---|
| D1 | 数据存储 | JSON 文件（backend/data/db.json）+ Storage 接口抽象 | 单用户、千级数据量，零 native 依赖，备份=复制文件，SQLite 可经同一接口替换 |
| D2 | DeepSeek 接入 | openai npm SDK（baseURL 指向 https://api.deepseek.com） | 官方推荐、纯 JS 无 Windows 原生依赖、内置流式/重试/超时；裸 fetch 手写 SSE 与退避易出错 |
| D3 | MindScape 布局 | @xyflow/react + dagre（布局抽成纯函数） | React 原生自定义节点 + dagre 对树/层级结构足够快；ELK/Cytoscape 集成成本高、收益不明显 |

其余关键决策（非 D 编号）：

- 卡片状态机 `draft -> processing -> done | failed`，`failed -> processing`（重试），禁止对 `processing` 卡片重复触发生成。
- `children` 不冗余存储，由 `parentId` 在读取时聚合派生（避免悬挂边）。
- 文档上传走异步流水线（202 + 轮询），AI 摘要完成后自动生成一张根卡片并关联 `sourceDocumentId`。
- 鉴权：`X-API-Key` 请求头优先级高于存储在 settings 中的 Key；未配置时 AI 端点统一返回 400 `E_NO_API_KEY`。
- AI 卡片生成采用同步请求（<=90s），失败时父卡片置 `failed` 并携带可重试语义；预留 SSE 流式升级路径。
- 全仓 ESM（`"type": "module"`，NodeNext），与 Vite 前端、nanoid v5 等 ESM-only 依赖一致。

### 系统架构（组件与数据流）

```
[frontend  Vite :5173]
  AppShell -- 视图切换 (cards | mindscape)
  cardStore / workspaceStore / documentStore / settingsStore / uiStore
  api/client.ts (fetch + X-API-Key 注入)
        |
        | /api （Vite dev proxy）
        v
[backend  Express :3001]
  middleware: apiKey(覆盖规则) -> error(统一错误体)
  routes: workspaces / cards(+generate) / documents(multer) / settings
  services: cardService / aiService(openai SDK) / documentService / workspaceService
  storage: jsonStore(内存缓存 + 原子写队列) -> db.json   data/uploads/*
```

## 1. 最终目录结构

```
cogito/
|-- package.json                 # npm workspaces 根：shared/backend/frontend；dev/build/test 脚本
|-- .gitignore                   # node_modules、dist、backend/data/（含 db.json 与 uploads，防 Key 入库）
|-- README.md                    # 快速开始：npm install && npm run dev
|-- docs/
|   `-- design.md                # 本文档
|-- shared/                      # 纯类型与常量包，前后端共享
|   |-- package.json             # @cogito/shared，仅 types 依赖
|   |-- tsconfig.json            # 编译产出 .d.ts（composite）
|   `-- src/
|       |-- types.ts             # Card/Workspace/DocumentRecord/Settings 等全部领域类型（第 2 节）
|       |-- constants.ts         # 错误码、上限常量（10MB、字数截断、默认模型/超时）
|       `-- index.ts             # 统一导出
|-- backend/                     # Node+Express 服务
|   |-- package.json             # express、multer、openai、pdf-parse、iconv-lite、nanoid、tsx
|   |-- tsconfig.json            # NodeNext ESM
|   |-- data/                    # 运行时数据（gitignore）
|   |   |-- db.json              # 主数据文件（第 2.2 节完整 schema 示例）
|   |   `-- uploads/             # 上传的 PDF/TXT 原件，文件名 = {documentId}.{ext}
|   `-- src/
|       |-- index.ts             # 入口：读配置、初始化 storage、启动 Express（PORT=3001）
|       |-- app.ts               # 组装 Express：json 中间件、路由挂载、错误中间件
|       |-- config.ts            # 环境变量（PORT/DATA_DIR/DEFAULT_MODEL 等）与默认值
|       |-- storage/
|       |   |-- types.ts         # Storage 接口：read()/write(db)/backup()
|       |   |-- jsonStore.ts     # JSON 实现：内存缓存 + 原子写队列 + 损坏恢复
|       |   `-- index.ts         # 工厂：返回进程内单例 Storage
|       |-- services/
|       |   |-- workspaceService.ts # 工作区 CRUD、级联删除（卡片+文档+上传文件）
|       |   |-- cardService.ts   # 卡片 CRUD、children 聚合、状态机、generate 编排
|       |   |-- aiService.ts     # openai SDK 封装：JSON 模式、超时、解析与重试（第 5 节）
|       |   `-- documentService.ts # multer 校验落盘、文本提取、AI 摘要、状态流转（第 6 节）
|       |-- prompts/
|       |   |-- generate.ts      # 生成卡片 system/user 模板（第 5 节）
|       |   `-- summarize.ts     # 文档摘要 system/user 模板（第 5 节）
|       |-- routes/
|       |   |-- health.ts        # GET /api/health
|       |   |-- workspaces.ts    # /api/workspaces 及 :id
|       |   |-- cards.ts         # /api/cards/:id、/generate、/extract-terms
|       |   |-- documents.ts     # /api/documents、multipart 上传
|       |   `-- settings.ts      # /api/settings、/test
|       |-- middleware/
|       |   |-- apiKey.ts        # 解析 X-API-Key，按覆盖规则注入 req.aiApiKey（第 3 节）
|       |   `-- error.ts         # 统一错误体 {error:{code,message}}；multer 错误映射 413/415
|       `-- utils/
|           |-- atomicWrite.ts   # tmp+rename 原子写（Windows rename 语义处理，见第 8 节风险 #1）
|           |-- textExtract.ts   # pdf-parse / TXT(GBK) 提取封装（第 6 节）
|           `-- ids.ts           # nanoid(12) 生成
|   `-- tests/                   # Vitest + supertest（第 7 节）
|       |-- storage.test.ts / cardService.test.ts / aiService.test.ts
|       |-- documentService.test.ts / api.integration.test.ts
|       `-- fixtures/            # 样例 PDF/TXT（含 GBK 中文 TXT）
`-- frontend/                    # React+TS+Vite
    |-- package.json             # react、@xyflow/react、dagre、zustand、markdown-it
    |-- tsconfig.json / vite.config.ts   # dev proxy：/api -> http://localhost:3001
    |-- index.html
    `-- src/
        |-- main.tsx             # React 挂载 + 初始化各 store 加载
        |-- App.tsx              # AppShell：侧栏（工作区/文档/术语库）+ 主区视图切换 + 设置面板
        |-- api/
        |   |-- client.ts        # fetch 封装：base /api、X-API-Key 注入、错误码映射为 Error（第 4 节）
        |   `-- endpoints.ts     # 类型化端点函数（对齐第 3 节契约）
        |-- stores/
        |   |-- workspaceStore.ts / cardStore.ts / documentStore.ts
        |   `-- settingsStore.ts / uiStore.ts        # zustand 定义见第 4 节
        |-- components/
        |   |-- layout/          # AppShell、Sidebar
        |   |-- cards/           # CardList、CardItem、CardDetail、CardEditor、TermChips、TermText
        |   |-- mindscape/       # MindMap、CardNode、dagreLayout.ts（纯函数）
        |   |-- documents/       # UploadPanel、DocumentList
        |   `-- settings/        # SettingsPanel（Key 输入/模型/测试连接）
        |-- hooks/
        |   `-- usePolling.ts    # 文档摘要轮询（1.5s）
        `-- tests/               # Vitest（jsdom）
            |-- stores.test.ts / TermText.test.tsx / dagreLayout.test.ts / apiClient.test.ts
            `-- fixtures/
```

## 2. 最终 TypeScript 类型定义（shared/src/types.ts）

```ts
export type CardType = 'child' | 'divergent' | 'branch';
export type CardStatus = 'draft' | 'processing' | 'done' | 'failed';
export type GenerationMode = CardType;      // 生成模式与卡片类型一一对应
export type DocumentStatus = 'processing' | 'done' | 'failed';
export type ViewMode = 'cards' | 'mindscape';

/** 术语高亮：term 必须逐字出现在 content/summary 中 */
export interface TermHighlight {
  term: string;
  definition?: string;
}

/** AI 调用元信息：可溯源、可排查 */
export interface AiMeta {
  model: string;
  mode?: GenerationMode;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  error?: string;      // 失败时的错误码，如 E_AI_TIMEOUT / AI_RESPONSE_INVALID_JSON
  retried?: boolean;   // 是否发生过解析重试
}

export interface Card {
  id: string;                    // nanoid(12)
  workspaceId: string;
  type: CardType;
  title: string;
  content: string;               // Markdown
  terms: TermHighlight[];        // 默认 []；AI 卡片由模型产出，手动卡片可空
  parentId: string | null;       // null = 根卡片；children 由服务端按 parentId 聚合派生
  status: CardStatus;
  sourceDocumentId?: string;     // 文档摘要自动生成的根卡片关联上传记录
  aiMeta?: AiMeta;
  createdAt: string;             // ISO 8601
  updatedAt: string;
}

/** GET /cards?tree=true 返回的树形视图 */
export interface CardTreeNode extends Card {
  children: CardTreeNode[];
}

export interface Workspace {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentRecord {
  id: string;
  workspaceId: string;
  fileName: string;              // 原始文件名
  mimeType: string;
  sizeBytes: number;
  storagePath: string;           // 相对 backend/data/ 的路径，如 uploads/xxx.pdf
  status: DocumentStatus;
  title?: string;                // AI 摘要标题
  summary?: string;              // Markdown 摘要
  terms?: TermHighlight[];
  error?: string;
  aiMeta?: AiMeta;
  createdAt: string;
  updatedAt: string;
}

/** 下发前端的设置（绝不含 apiKey） */
export interface PublicSettings {
  hasApiKey: boolean;
  baseUrl: string;
  model: string;
  temperature: number;
  timeoutMs: number;
}

/** 服务端内部设置 */
export interface Settings extends PublicSettings {
  apiKey?: string;               // 明文存于 db.json（本地单用户工具，gitignore 防入库）
}

export interface ApiErrorBody {
  error: { code: string; message: string; detail?: unknown };
}
```

### 2.1 卡片状态机

```
draft --(POST /generate 开始)--> processing --> done
                                      |
                                      +--(AI 失败/响应解析失败)--> failed
failed --(再次 POST /generate)--> processing
```

- `processing` 期间再次触发生成 -> 409 `E_CARD_BUSY`。
- 手动 PATCH 不改变 status；`failed` 卡片编辑保存后仍为 failed，重试走 generate。
- 手动创建的卡片初始为 `draft`，`aiMeta` 为空。

### 2.2 db.json 完整 schema 示例

```json
{
  "version": 1,
  "workspaces": [
    {
      "id": "ws_ab12cd34",
      "name": "LLM 推理机制",
      "description": "深度优先的推理链路探索",
      "createdAt": "2026-08-04T09:00:00.000Z",
      "updatedAt": "2026-08-04T10:00:00.000Z"
    }
  ],
  "cards": [
    {
      "id": "c_aaa111",
      "workspaceId": "ws_ab12cd34",
      "type": "child",
      "title": "CoT 链式思考",
      "content": "## 核心\n链式思考（Chain-of-Thought）……",
      "terms": [
        { "term": "Chain-of-Thought", "definition": "引导模型分步推理的提示方法" },
        { "term": "涌现能力", "definition": "规模增大后出现的新能力" }
      ],
      "parentId": null,
      "status": "done",
      "aiMeta": {
        "model": "deepseek-v4-flash",
        "mode": "divergent",
        "promptTokens": 1200,
        "completionTokens": 380,
        "latencyMs": 8400,
        "retried": false
      },
      "createdAt": "2026-08-04T09:30:00.000Z",
      "updatedAt": "2026-08-04T09:30:45.000Z"
    },
    {
      "id": "c_bbb222",
      "workspaceId": "ws_ab12cd34",
      "type": "child",
      "title": "Few-shot 提示",
      "content": "## 核心\n通过少量示例……",
      "terms": [],
      "parentId": "c_aaa111",
      "status": "draft",
      "createdAt": "2026-08-04T10:10:00.000Z",
      "updatedAt": "2026-08-04T10:10:00.000Z"
    }
  ],
  "documents": [
    {
      "id": "d_ccc333",
      "workspaceId": "ws_ab12cd34",
      "fileName": "chain-of-thought-paper.pdf",
      "mimeType": "application/pdf",
      "sizeBytes": 1843200,
      "storagePath": "uploads/d_ccc333.pdf",
      "status": "done",
      "title": "CoT 论文核心解读",
      "summary": "## 核心观点\n……",
      "terms": [{ "term": "CoT", "definition": "Chain-of-Thought 缩写" }],
      "aiMeta": {
        "model": "deepseek-v4-flash",
        "promptTokens": 8100,
        "completionTokens": 640,
        "latencyMs": 15200
      },
      "createdAt": "2026-08-04T11:00:00.000Z",
      "updatedAt": "2026-08-04T11:01:00.000Z"
    }
  ],
  "settings": {
    "apiKey": "sk-xxxxxxxx",
    "baseUrl": "https://api.deepseek.com",
    "model": "deepseek-v4-flash",
    "temperature": 0.7,
    "timeoutMs": 60000
  }
}
```

## 3. 完整 REST API 契约

### 3.1 通用约定

- 前缀 `/api`；请求/响应体为 JSON（文档上传除外）；时间字段为 ISO 8601 字符串。
- 服务默认端口 `3001`；前端 dev 经 Vite proxy 转发 `/api`，同源无 CORS 负担（不引入 cors 依赖）。
- 错误响应统一：`{ "error": { "code": "E_XXX", "message": "人类可读信息", "detail": "可选的附加信息" } }`。
- 所有写操作同步返回最新资源；AI 生成端点同步执行（见 3.3 失败语义）。

### 3.2 鉴权方式与 X-API-Key 覆盖规则

1. 请求头 `X-API-Key: sk-xxx` 非空 -> 本请求使用该 Key，且**不写回**存储（临时覆盖）。
2. 无请求头 -> 回落到 `settings.apiKey`。
3. 两者皆无，且端点需要调用 AI -> 400 `E_NO_API_KEY`。
4. `GET /api/settings` 永不返回 Key 明文，仅返回 `hasApiKey`。
5. 覆盖规则在 `middleware/apiKey.ts` 统一实现：解析请求头并注入 `req.aiApiKey`，aiService 一律从 `req.aiApiKey ?? settings.apiKey` 取 Key。

### 3.3 端点清单

#### 健康检查

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/health | 服务与 AI 配置状态 |

```json
// 200
{ "status": "ok", "version": "0.1.0", "ai": { "configured": true } }
```

#### 工作区

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/workspaces | 工作区列表 |
| POST | /api/workspaces | 创建工作区 |
| PATCH | /api/workspaces/:id | 改名/改描述 |
| DELETE | /api/workspaces/:id | 删除（级联删卡片、文档记录与上传文件） |

```json
// POST /api/workspaces  请求
{ "name": "LLM 推理机制", "description": "可选" }
// 201 响应
{ "workspace": { "id": "ws_ab12cd34", "name": "LLM 推理机制", "description": "可选", "createdAt": "...", "updatedAt": "..." } }
```

#### 卡片

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/workspaces/:wid/cards | 卡片列表（平铺 Card[]；`?tree=true` 返回 CardTreeNode[]） |
| GET | /api/cards/:id | 单卡 |
| POST | /api/workspaces/:wid/cards | 手动建卡（status=draft） |
| PATCH | /api/cards/:id | 编辑 title/content/type/terms/parentId |
| DELETE | /api/cards/:id | 删除；直接子节点 parentId 置 null（提升为根，不静默丢子树） |
| POST | /api/cards/:id/generate | AI 生成子卡（child/divergent/branch） |
| POST | /api/cards/:id/extract-terms | （P2）AI 从 content 提取 terms 回写 |

```json
// POST /api/cards/:id/generate  请求
{ "mode": "divergent", "instruction": "关注推理时延方向" }
// 201 响应（新生成的卡片，status=done）
{ "card": { "id": "c_new123", "workspaceId": "ws_ab12cd34", "type": "divergent", "title": "推理时延与工程优化", "content": "...", "terms": ["..."], "parentId": "c_aaa111", "status": "done", "aiMeta": { "model": "deepseek-v4-flash", "mode": "divergent", "promptTokens": 1200, "completionTokens": 380, "latencyMs": 8400 }, "createdAt": "...", "updatedAt": "..." } }
```

**generate 处理流程与失败语义**：

1. 校验父卡存在、`status !== 'processing'`（否则 409 `E_CARD_BUSY`）。
2. 父卡置 `processing` 并原子保存。
3. 调 aiService（SDK 重试 + 解析重试，见第 5 节）。
4. 成功 -> 创建子卡（`status=done`、type=mode、parentId=父卡 id、terms 来自模型、aiMeta 记录）-> 201。
5. 失败 -> 父卡置 `failed`、`aiMeta.error` 记录错误码 -> 返回对应 HTTP 错误，响应体携带 `{ "card": <父卡> }` 便于前端刷新。映射：429 -> `E_AI_RATE_LIMIT`；超时 -> 504 `E_AI_TIMEOUT`；上游 5xx/解析失败 -> 502 `E_AI_ERROR`；无 Key -> 400 `E_NO_API_KEY`。


#### 导图 AI 扩展（0.4.0）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /api/cards/:id/suggestions | AI 分支建议：基于卡片内容给出 child/divergent/branch 三种模式建议（各 1 条，title<=20字 + reason<=40字）。只读，不修改卡片状态 |
| POST | /api/workspaces/:wsId/cards/generate-tree | 一键生成完整图：BFS 串行递归扩展整棵导图（增量语义、50 卡预算、部分失败收集） |

```json
// POST /api/cards/:id/suggestions  请求（instruction 可选）
{ "instruction": "结合实现细节给出建议" }
// 200 响应
{ "suggestions": [
    { "type": "child",     "title": "状态机与并发控制", "reason": "父卡提及 processing 状态，值得深入展开" },
    { "type": "divergent", "title": "失败重试策略对比", "reason": "与生成链路相邻，可横向发散" },
    { "type": "branch",    "title": "E_CARD_BUSY 错误码", "reason": "针对文中具体概念独立成支" }
  ],
  "meta": { "model": "deepseek-v4-flash", "promptTokens": 1100, "completionTokens": 280, "latencyMs": 3900, "retried": false } }

// POST /api/workspaces/:wsId/cards/generate-tree  请求（depth 默认 2、branchesPerNode 默认 3）
{ "depth": 2, "branchesPerNode": 3 }
// 200 响应（部分失败也返回 200，failures 汇总；仅无根卡/参数越界/超预算时 4xx）
{ "result": {
    "rootsProcessed": 1, "created": 4, "skipped": 0, "truncated": false, "totalCards": 5,
    "failures": [ { "parentId": "card-9", "parentTitle": "AI 架构", "code": "E_AI_TIMEOUT", "message": "AI request timed out" } ],
    "meta": { "model": "deepseek-v4-flash", "promptTokens": 9200, "completionTokens": 2400, "latencyMs": 18500, "retried": false } } }
```

**generate-tree 关键语义**：
1. 增量扩展：已有子卡的节点跳过（不重写子树），仅对「无子卡」节点生成。
2. 预算：总卡数上限 50（含已有卡），请求时按几何级数预估校验，执行时实时计数截断（truncated=true）。
3. 参数：depth 1~3（默认 2）、branchesPerNode 1~4（默认 3）；无根卡 → 400 E_VALIDATION。
4. 失败：单节点 AI 失败收集进 failures 并继续（父卡不置 failed）；数据库错误向上传播。
5. 超时：min(timeoutMs × 预估调用数, 300000) + 30000。
6. 建议采纳：前端调既有 POST /cards/:id/generate（mode=建议 type，instruction="title。reason"），复用完整状态机。
#### 文档

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /api/workspaces/:wid/documents | multipart 上传（字段名 `file`）-> 202 异步处理 |
| GET | /api/workspaces/:wid/documents | 列表 |
| GET | /api/documents/:id | 单条（前端轮询 1.5s 至 done/failed） |
| DELETE | /api/documents/:id | 删除记录+上传文件；关联生成的卡片保留 |

```json
// POST /api/workspaces/:wid/documents  202 响应
{ "document": { "id": "d_ccc333", "workspaceId": "ws_ab12cd34", "fileName": "x.pdf", "mimeType": "application/pdf", "sizeBytes": 1843200, "storagePath": "uploads/d_ccc333.pdf", "status": "processing", "createdAt": "...", "updatedAt": "..." } }
```

#### 设置

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/settings | 返回 PublicSettings（无 Key 明文） |
| PUT | /api/settings | 更新；`apiKey` 传空字符串=清除 |
| POST | /api/settings/test | 用当前 Key 发起一次极简对话验证连通性 |

```json
// PUT /api/settings  请求
{ "apiKey": "sk-xxx", "model": "deepseek-v4-flash", "temperature": 0.7, "timeoutMs": 60000 }
// 200 响应
{ "settings": { "hasApiKey": true, "baseUrl": "https://api.deepseek.com", "model": "deepseek-v4-flash", "temperature": 0.7, "timeoutMs": 60000 } }

// POST /api/settings/test  200
{ "ok": true, "latencyMs": 1234, "model": "deepseek-v4-flash" }
```

### 3.4 错误码表

| HTTP | code | 触发场景 |
|---|---|---|
| 400 | E_VALIDATION | 请求体缺字段/类型错误 |
| 400 | E_NO_API_KEY | 需要 AI 但请求头与设置均无 Key |
| 401 | E_INVALID_API_KEY | 上游返回 401（/settings/test 或调用中） |
| 404 | E_NOT_FOUND | 资源不存在 |
| 409 | E_CARD_BUSY | 卡片 processing 中再次触发生成 |
| 413 | E_FILE_TOO_LARGE | 上传超过 10MB |
| 415 | E_UNSUPPORTED_TYPE | 非 PDF/TXT |
| 422 | E_PDF_NO_TEXT | PDF 无可提取文本（疑似扫描件） |
| 422 | E_TXT_DECODE | TXT 无法按 UTF-8/GBK 解码 |
| 429 | E_AI_RATE_LIMIT | DeepSeek 429（SDK 重试后仍失败） |
| 502 | E_AI_ERROR | 上游 5xx、JSON 解析/校验失败 |
| 504 | E_AI_TIMEOUT | 连接/总时长超时 |
| 500 | E_INTERNAL | 未预期异常 |

## 4. 前端状态管理设计（zustand v5）

原则：数据状态与服务端契约一一对应；UI 瞬态（选中、视图、搜索）独立成 `uiStore`；异步动作统一 `set pending -> 请求 -> 刷新/置错`，错误展示读 `error.code` 映射文案。

### 4.1 store 划分

**useWorkspaceStore**
- state：`workspaces: Workspace[]`、`currentId: string | null`、`loading`、`error`
- actions：`load()`、`create(name)`、`rename(id, name)`、`remove(id)`、`setCurrent(id)`（切换时触发 cardStore.loadCards 与 documentStore.list）

**useCardStore**
- state：`cards: Card[]`、`selectedId: string | null`、`tree: CardTreeNode[]`（由 cards 派生并缓存，切树时重算）、`generatingId: string | null`、`loading`、`error`
- actions：`loadCards(wid)`、`select(id)`、`createCard(input)`、`updateCard(id, patch)`、`removeCard(id)`、`generate(id, mode, instruction?)`——开始即置 `generatingId` 并乐观置父卡 status=processing；成功后 `loadCards` 刷新；失败读错误码并刷新（父卡 failed）
- selectors：`byId(id)`、`rootCards`、`childrenOf(id)`

**useDocumentStore**
- state：`documents: DocumentRecord[]`、`uploading`、`pollingId`
- actions：`upload(wid, file)`（202 后启动 `usePolling` 轮询至 done/failed）、`list(wid)`、`remove(id)`、`retrySummarize(id)`（P2：重新入队）

**useSettingsStore**
- state：`settings: PublicSettings | null`、`testing`
- actions：`load()`、`save(patch)`、`test()`（结果写入 `lastTest`）

**useUIStore**
- state：`view: ViewMode`、`activeTerm: string | null`、`layoutNonce: number`、`search: string`
- actions：`setView(v)`、`setActiveTerm(t)`、`requestLayout()`（nonce+1 触发 MindScape 重排）、`setSearch(q)`

### 4.2 视图切换

- `view: 'cards' | 'mindscape'` 共享同一 `cardStore`，切换只换渲染层、不重复请求。
- MindScape 中点击节点 -> `cardStore.select(id)` -> 详情面板联动；拖拽节点位置为前端瞬态（不持久化，点「自动布局」/`requestLayout()` 回到 dagre 布局）。

### 4.3 术语高亮渲染方案

1. **TermText 组件**（列表标题、摘要、详情纯文本视图）：props `{ text, terms, activeTerm? }`。算法：terms 按 `term.length` 降序 -> 逐个 `RegExp.escape` -> 合并正则 `new RegExp(parts.join('|'), 'gi')` -> `text.split(regex)` 渲染，命中片段包 `<mark class="term" data-term>`；activeTerm 时只对匹配项加高亮 class。最长优先天然避免重叠。
2. **详情页 Markdown 渲染**：markdown-it 渲染 `content` 为 HTML -> `dangerouslySetInnerHTML` 挂载后，在 `useEffect` 中用 `TreeWalker`（仅 TEXT_NODE）遍历，对命中术语的文本节点包裹 `<mark>`。只做文本节点包裹，不解析任何 HTML，不引入新的 XSS 面。
3. **术语库（侧栏）**：聚合当前工作区全部卡片 `terms` 去重计数；点击 -> `uiStore.setActiveTerm` -> 列表与导图联动高亮。
4. 约束：terms 为纯文本术语（不得含 markdown 符号），模型输出校验已保证。

## 5. AI Prompt 设计

### 5.1 调用参数（aiService）

- 客户端：openai SDK（D2），`baseURL: settings.baseUrl || 'https://api.deepseek.com'`、`apiKey` 按覆盖规则。
- 默认模型 `deepseek-v4-flash`、`temperature: 0.7`、`response_format: { type: 'json_object' }`（DeepSeek JSON 模式）。
> 2026-08 模型换代：deepseek-v4-flash（默认）/ deepseek-v4-pro；旧名 deepseek-chat 已停用。
- SDK 重试：`maxRetries: 3`（仅网络错误/429/5xx，指数退避 base 200ms 上限 3s，尊重 Retry-After）。
- 超时：非流式 `timeout: 60000`（SDK 总时长）；Express 路由 `res.setTimeout(90000)` 兜底。
- 流式升级预留：SSE 时连接/首字节 15s，空闲 30s 无 chunk 即 abort（双侧实现）。

### 5.2 生成卡片 Prompt 模板

system：
```
你是知识探索工作区中的「卡片生成引擎」。根据用户给出的父卡片与生成模式，产出一张语义连贯、有增量信息的新知识卡片。

硬性要求：
1. 只输出一个 JSON 对象，禁止输出任何其他文字、禁止使用 Markdown 代码块围栏。
2. JSON 结构必须为：{"title": "<string>", "content": "<string>", "terms": [{"term": "<string>", "definition": "<string>"}]}
3. title：<=40 字，准确概括新卡片主题。
4. content：Markdown 格式，200~500 字；必须与父卡片内容衔接并产生增量（深化/发散/分支），不得整段复述父卡片；不要编造来源与引用。
5. terms：3~6 个，每个 term 必须逐字出现在 content 中；definition 为 <=50 字的一句话解释。
6. content 中出现的 markdown 符号不要出现在 term 内。
```

user：
```
【生成模式】{mode}
- child：从父卡片向下深化，选择一个具体子主题拆解
- divergent：从父卡片横向发散，探索相邻/相关主题
- branch：针对父卡片中的某个术语或观点独立成支

【父卡片标题】{title}
【父卡片内容】
{content}

{instruction ? "【用户补充意图】\n" + instruction : ""}
请按系统要求输出 JSON。
```

### 5.3 文档摘要 Prompt 模板

system：
```
你是知识工作区中的「文档摘要引擎」。根据用户提供的文档标题与正文，产出结构化摘要。

硬性要求：
1. 只输出一个 JSON 对象，禁止任何多余文字或代码块围栏。
2. JSON 结构：{"title": "<string>", "summary": "<string>", "terms": [{"term": "<string>", "definition": "<string>"}]}
3. title：<=40 字，文档主题标题。
4. summary：Markdown 格式，500~800 字，按「核心观点 / 关键论据 / 结论」组织，忠于原文不编造。
5. terms：5~10 个文档关键术语，term 必须逐字出现在 summary 中。
```

user：
```
【文档标题】{fileName}
【正文节选】（已截断）
{textSnippet}

请按系统要求输出 JSON。
```

### 5.4 解析与重试策略

1. 预处理：去首尾空白；剥离 ```json 围栏；截取首个 `{` 到最后一个 `}` 的子串。
2. `JSON.parse` 后校验：`title`/`content` 为非空 string；`terms` 为数组且每项含 `{term, definition}`；过滤 `term` 未出现在 content 中的项；terms 长度钳制 <=8。
3. 失败 -> 解析重试 1 次：user prompt 末尾追加「上次输出不符合要求。只输出 JSON 对象本身，不要代码块、不要任何解释。」重新请求（与 SDK 网络重试独立计数）。
4. 再次失败 -> 父卡 `failed`、`aiMeta.error = 'AI_RESPONSE_INVALID_JSON'`，返回 502 `E_AI_ERROR`。
5. 截断保护：生成卡片的 content 入 prompt 超 4000 字截断；文档正文 12000 字截断。
6. 重试上限合计：网络 3 次 + 解析 1 次，防成本失控。

### 5.5 429 / 超时前端体验

- 429 -> 文案「模型限流，请稍后重试」，保留用户输入与生成模式。
- 504 -> 文案「生成超时」，卡片 failed 可一键「重新生成」。
- 400 E_NO_API_KEY -> 跳转设置面板引导配置 Key。

## 6. 文档解析方案

### 6.1 上传校验（multer）

- `memoryStorage`；`limits.fileSize = 10 * 1024 * 1024`（10MB）。
- `fileFilter` 双重校验：`mimetype` 属于 { application/pdf, text/plain } **且** 扩展名属于 { .pdf, .txt }（防伪造类型）。
- 超限 -> 413 `E_FILE_TOO_LARGE`；非白名单 -> 415 `E_UNSUPPORTED_TYPE`（error 中间件统一映射 multer 错误）。
- 通过后落盘 `data/uploads/{documentId}.{ext}`（原样字节），便于重处理。

### 6.2 文本提取选型：pdf-parse（锁定 1.1.1）

| 方案 | 结论 |
|---|---|
| pdf-parse | **采用**。pdf.js 的 Node 薄封装，`pdfParse(buffer)` 一行取纯文本，满足摘要所需；包体小 |
| pdfjs-dist | 拒绝。面向浏览器（worker/wasm/Canvas），Node 集成需 legacy build + 手工 `getTextContent`，初始化重、包体大，收益仅在有渲染需求时成立 |

- 维护风险缓解：锁定版本 + `utils/textExtract.ts` 接口隔离，坏时可平替 pdfjs-dist。

### 6.3 中文 PDF 注意事项

1. 内嵌字体含 ToUnicode 映射 -> 正常抽取（多数电子版 PDF 满足）。
2. 扫描件/图片型 PDF -> 文本为空 -> 422 `E_PDF_NO_TEXT`，提示「疑似扫描件，暂不支持 OCR」（OCR 超出 B 档范围）。
3. 字体子集化导致乱码 -> 无法根治，界面提示「若摘要乱码，请提供带文本层的 PDF」。

### 6.4 TXT 编码与文本归一化

- 读 buffer：有 UTF-8 BOM 或 strict UTF-8 解码成功 -> 采用；否则 `iconv-lite` 按 GBK 解码（Windows 中文环境常见）；仍失败 -> 422 `E_TXT_DECODE`。
- 产出文本统一 `\r\n` 归一化为 `\n`（防 CRLF 污染 JSON 与 Markdown）。

### 6.5 处理流水线（异步）

```
上传 202 -> 串行队列（防并发 AI 触发限流）-> 提取文本
-> AI 摘要（第 5.3 节）-> 更新 document(done, title/summary/terms)
-> 自动创建根卡片：type='child', parentId=null, content=summary,
   terms=文档 terms, sourceDocumentId={documentId}
任一环节失败 -> document.failed + error 码；前端提供「重新摘要」（重新入队）
```

## 7. 测试策略（Vitest）

- 工具：Vitest（前后端统一）；后端集成用 supertest；前端组件测试 jsdom；mock 优先（SDK、pdf-parse、fetch）。
- 测试数据：各包 `tests/fixtures/`（样例 PDF、UTF-8/GBK 中文 TXT）。

### 7.1 后端（backend/tests/）

| 文件 | 覆盖点 |
|---|---|
| storage.test.ts | 原子写（tmp+rename 流程与失败注入）、写队列串行、损坏 db.json 启动恢复、读写往返 |
| cardService.test.ts | 状态机合法/非法迁移、children 聚合、删除提升子节点、generate 编排（mock aiService） |
| aiService.test.ts | prompt 构建快照、响应解析（围栏/前缀/截断/非法 JSON）、解析重试恰 1 次、SDK mock 下 429/超时/5xx 映射、无 Key |
| documentService.test.ts | multer 白名单/大小限制、pdf-parse mock、GBK TXT、空文本 -> E_PDF_NO_TEXT |
| api.integration.test.ts | supertest + 临时 DATA_DIR：全端点 CRUD、X-API-Key 覆盖（header 优先）、无 Key -> 400、错误响应结构 |

### 7.2 前端（frontend/tests/）

| 文件 | 覆盖点 |
|---|---|
| stores.test.ts | 各 store 异步动作（生成中状态、失败刷新、视图切换不重拉数据） |
| TermText.test.tsx | 高亮匹配/大小写/最长优先/activeTerm |
| dagreLayout.test.ts | 给定树结构输出确定性坐标（快照） |
| apiClient.test.ts | X-API-Key 注入、错误码映射为 Error 类型 |

### 7.3 组织方式

- 各包独立 `vitest.config.ts`；根 `package.json` scripts：`test` 运行 `test:backend && test:frontend`。
- 门槛：后端 services/storage 行覆盖 >=80%；前端 store 与 TermText 全覆盖；CI 未定，本地提交前必跑。

## 8. 风险清单

| # | 风险 | 影响 | 缓解 |
|---|---|---|---|
| 1 | Windows `fs.rename` 目标已存在时报 EPERM/EEXIST | 原子写失败、数据损坏 | 原子写：写 `db.json.tmp` -> fsync -> 目标存在先 unlink -> rename；单测覆盖（第 7 节） |
| 2 | TXT 中文编码（GBK/UTF-8 混合） | 摘要乱码 | BOM/strict UTF-8 探测 -> iconv-lite GBK 兜底；界面提示 |
| 3 | CRLF 污染 content/JSON | 内容与解析异常 | 存储与入 prompt 前统一 `\n` |
| 4 | DeepSeek 429 限流 | 生成失败、体验差 | SDK maxRetries 3 + 退避 + Retry-After；文档摘要串行队列；前端 429 友好提示 |
| 5 | 网络超时/上游不稳 | 长时间挂起、超时失败 | timeout 60s / Express 90s；failed 卡片一键重试 |
| 6 | 未配置 API Key | AI 功能不可用 | 统一 400 E_NO_API_KEY；设置页引导 + /settings/test 自检；前端横幅提示 |
| 7 | db.json 损坏（断电/进程被杀） | 数据丢失 | 原子写 + 启动校验（解析失败自动备份 corrupted-{ts}.json 并重建空库） |
| 8 | 并发写覆盖 | 丢失更新 | 进程内写队列串行化；所有写经单例 Storage |
| 9 | 扫描件 PDF 无文本层 | 摘要失败 | 422 E_PDF_NO_TEXT 明确提示；OCR 明确排除在 B 档外 |
| 10 | 大文件内存压力 | OOM | 10MB 上限；pdf-parse 仅取文本层 |
| 11 | 依赖维护风险（pdf-parse/dagre 不活跃） | 升级受阻 | 锁定版本；textExtract/dagreLayout 抽为纯函数接口，可替换 |
| 12 | AI 输出幻觉/质量差 | 卡片可信度 | 卡片可编辑 + terms 校验过滤 + 内容长度约束 + aiMeta 可溯源 |
| 13 | 长请求被中间代理切断 | 生成中断 | 同步生成 <=90s；预留 SSE 流式升级路径 |
| 14 | settings.apiKey 明文入库 | Key 泄露（若入库到 git） | db.json 与 uploads 进 .gitignore；Key 仅本机存储，取舍已在 ADR-001 记录 |

## 9. ADR 简录

### ADR-001：数据存储采用 JSON 文件 + Storage 接口（Accepted）

- **背景**：本地单用户工具，卡片/文档数据量为千级，无并发多写者需求；Windows 桌面环境追求零摩擦安装；planner 倾向 JSON 文件。
- **选项**：A. JSON 文件（db.json）+ Storage 抽象；B. SQLite（better-sqlite3）；C. Node 内置 node:sqlite（实验）。
- **结论**：A。
- **理由**：better-sqlite3 需预编译原生二进制（Windows 编译/安装风险）；node:sqlite 在 Node 22 仍为实验特性且需 flag；JSON 在该数据量下读写为毫秒级，备份=复制文件，可视化排障直观。以 Storage 接口（read/write/backup）隔离，数据量增长后可 1~2 天内平替 SQLite，代价可控。
- **代价**：全量重写 db.json；启动时全量载入内存。已用原子写+写队列+损坏恢复缓解（第 8 节 #1/#7/#8）。

### ADR-002：DeepSeek 接入采用 openai npm SDK（Accepted）

- **背景**：DeepSeek API 与 OpenAI 兼容；需求含重试（429）、超时、JSON 模式、未来 SSE 流式、TS 类型。
- **选项**：A. openai SDK（baseURL 覆盖为 https://api.deepseek.com）；B. 裸 fetch + 手写 SSE/退避/超时。
- **结论**：A。
- **理由**：DeepSeek 官方文档即推荐 openai SDK；v4 为纯 fetch 实现，无原生依赖、Windows 零坑；内置 maxRetries 指数退避（尊重 Retry-After）、timeout、流式迭代器、完整 TS 类型；手写 SSE 解析（分帧、keep-alive 注释行、断流检测）与退避调度极易出边界 bug。以 aiService.ts 单点封装隔离 SDK，保留未来切换能力。
- **代价**：一个纯 JS 依赖 + 版本演进跟踪（锁定主版本）。

### ADR-003：MindScape 采用 @xyflow/react + dagre（Accepted）

- **背景**：思维导图需要自定义节点（卡片预览/状态角标/术语徽标）、拖拽缩放、自动布局；节点规模千级以内。
- **选项**：A. @xyflow/react + dagre；B. @xyflow/react + elkjs；C. cytoscape。
- **结论**：A。
- **理由**：react-flow 是 React 原生方案，节点即 React 组件，与 cardStore 数据直绑、生态成熟（minimap/controls/fitView）；dagre 对树/层级结构输出确定性布局且千级节点毫秒级；elkjs 布局更美观但为 JS 端口、大图慢、需 worker 与额外集成，收益在此规模不显著；cytoscape 渲染模型与 React 割裂，自定义节点成本高。布局抽为纯函数 `dagreLayout(nodes, edges)`，未来可无痛换 elkjs。
- **代价**：dagre 维护不活跃（锁定版本）；自动布局与手动拖拽位置为瞬态（不持久化）。

### ADR-004：导图 AI 扩展——分支建议与整树生成（Accepted）

- **背景**：导图（M3）仅有展示/折叠/点击联动；用户需要 AI 辅助扩展：对卡片给出分支方向建议（深入/发散/分支），以及从根卡片一键生成完整导图。
- **选项**：A. 复用单卡 generate 链路 + 新增 suggestions 接口 + 前端循环调用；B. 新增 treeService 批量编排（BFS + 预算 + 失败收集）+ 建议接口；C. 异步任务队列 + SSE 进度。
- **结论**：B。
- **理由**：单卡 generate 会把父卡置 processing 并触发 CARD_BUSY 409，无法支撑整树串行扩展；treeService 直接调 aiService.generateChildCard + createCard（不经 generateCard），全程无 processing 状态、无冲突窗口；同步串行调用对桌面单用户场景足够（动态超时兜底），避免任务队列的复杂度；增量语义（已有子卡跳过）天然幂等，重复点击不会重写子树。
- **代价**：一键生成是同步长请求（数分钟），前端仅展示 loading + 结果汇总；极端规模由 50 卡预算硬上限约束。
## 10. 实现顺序建议（供 implementer 排期）

> 实现状态（2026-08-04 更新）：**M0–M5 全部完成**。以下为各里程碑实际落地情况。

- **M0 脚手架** ?：npm workspaces 三包 + shared 类型/常量 + Express 骨架（/api/health）+ Vite 骨架（proxy）。
- **M1 存储与基础 API** ?：jsonStore（原子写+队列+恢复）+ workspaces/cards 全 CRUD + 集成测试。
- **M2 AI 接入** ?：aiService（openai SDK，JSON 模式/超时/SDK 重试 3 + 解析重试 1/错误码映射）+ prompts + generate 端点（状态机 draft→processing→done|failed、409 E_CARD_BUSY、失败响应带父卡）+ 设置页（Key 存储/测试连接/模型/温度/超时）+ 前端卡片列表/详情/生成交互（三模式+指令+重试+aiMeta 展示）。
  - 扩展（相对 3.2 覆盖规则）：Key 解析增加第三级兜底 `env DEEPSEEK_API_KEY`（header > settings > env），见 settingsService.ts。
- **M3 MindScape** ?：@xyflow/react + dagre（dagreLayout 纯函数，确定性布局）+ 自定义节点（类型/状态徽标）+ 点击节点联动详情 + MiniMap 状态着色。
- **M4 文档** ?：multer（10MB 上限 + 类型成对校验防伪造）+ pdf-parse 提取 + iconv-lite GBK/UTF-8 + 串行摘要流水线 + 上传面板/轮询（1.5s）/自动落根卡（sourceDocumentId）/重新摘要。
- **M5 打磨** ?：术语库联动高亮（TermText 最长优先 + Markdown TreeWalker 文本节点包裹 + 侧栏术语库）+ 错误码中文文案映射 + README + 根测试脚本 + gitignore 校验（backend/data/ 已忽略）+ 前后端测试补全。

**测试覆盖**：后端 106 用例（storage/cardService/aiService/documentService/textExtract/api.integration），前端 21 用例（stores/TermText/dagreLayout/apiClient）；根 `npm test` 顺序执行前后端。
- **M6 导图 AI 扩展（2026-08-11 落地）** ?：分支建议（POST /api/cards/:id/suggestions + prompts/suggestions.ts + aiService.generateSuggestions + SuggestionPanel）+ 一键生成完整图（POST /api/workspaces/:wsId/cards/generate-tree + treeService.generateTree + GenerateTreeDialog）；后端 144 用例、前端 55 用例全绿；浏览器端到端验证通过。
## 11. 桌面封装（Electron）架构

### 11.1 架构概览

```
[Electron 主进程 electron/main.cjs]
  |-- 单实例锁 (app.requestSingleInstanceLock)
  |-- spawn 后端子进程 (ELECTRON_RUN_AS_NODE)
  |     |-- 读取 data: app.getPath('userData')/data
  |     |-- 监听随机端口 (PORT=0) -> stdout 输出 [backend] PORT=xxxx
  |     |-- Express 托管 frontend/dist/ 静态文件 + SPA fallback
  |-- 解析 stdout -> 获取实际端口 -> 创建 BrowserWindow(url)
  |-- 系统托盘 (Tray)：最小化到托盘、显示/退出
  |-- 退出时 kill 后端子进程

[后端子进程 backend/dist/index.js]
  |-- Express 5 (JSON API)
  |-- 生产模式：
  |     DATA_DIR 环境变量覆盖数据目录
  |     FRONTEND_DIST 环境变量指定静态文件路径
  |     PORT=0 随机端口（输出实际端口供主进程解析）
  |-- 开发模式：Vite 代理 /api -> 后端 3001

[前端 frontend/dist/]
  |-- React 19 + Vite 8 生产构建产物
  |-- 同源访问 /api（无 CORS 负担）
  |-- 由 Express 的 express.static 托管
```

### 11.2 构建与打包

- **工具**：electron-builder 26.x + NSIS
- **配置**：`package.json` 的 `build` 字段（详见该文件）
- **命令**：
  - `npm run build` — 编译 shared/backend/frontend 三包
  - `npm run dist:win` — 完整构建 → Windows 安装包 (release/Cogito Setup x.x.x.exe)
  - `npx electron-builder --win dir` — 只打包目录 (win-unpacked/)，跳过 NSIS
- **产物**：
  - `win-unpacked/Cogito.exe` — 便携版（解压即用，约 215MB 解包）
  - `Cogito Setup x.x.x.exe` — NSIS 安装包（约 107MB，支持自定义安装目录/桌面快捷方式/卸载器）

### 11.3 关键决策

| 决策 | 选择 | 理由 |
|---|---|---|
| 后端运行方式 | 子进程 (ELECTRON_RUN_AS_NODE) | 隔离性好，主进程崩溃不影响后端数据；与开发模式一致 |
| 端口策略 | 随机端口 (PORT=0) + stdout 解析 | 避免端口冲突；`[backend] PORT=xxx` 格式供主进程 regex 解析 |
| asar | 禁用 (asar: false) | 后端子进程需要直接文件系统访问；pdf-parse 等 CJS 依赖在 asar 内兼容性不确定 |
| 静态托管 | Express 直接 serve frontend/dist | 同源（无 CORS）、零额外进程、SPA fallback 一行搞定 |
| 数据目录 | `app.getPath('userData')/data` | 符合 Electron 最佳实践：用户数据放在 %APPDATA%/Cogito/data，卸载时可选保留 |
| 签名 | 跳过 (signAndEditExecutable: false) | 开发机无证书；生产发布时改为 true + 配置证书 |

### 11.4 生产化源码改动

- `backend/src/index.ts`：`PORT=0` 时 `server.address().port` 输出实际端口
- `backend/src/app.ts`：支持 `FRONTEND_DIST` 环境变量 → 静态托管 + SPA fallback
- `backend/src/services/storage.ts`：`DATA_DIR` 环境变量覆盖默认路径
- `backend/src/services/documentService.ts`：`UPLOADS_DIR` 基于 `DATA_DIR`
- `shared/package.json`：`main` 指向 `dist/index.js`（纯 Node 运行时需要编译产物）
- 根 `package.json`：合并生产依赖到根 `dependencies`（供 electron-builder 收集）

### 11.5 图标

源码生成：`scripts/generate-icon.mjs` 生成 256×256 RGBA PNG（深色底 + 知识树节点图形）；`scripts/make-ico.mjs` 包装为 PNG-in-ICO 格式（Windows Vista+ 兼容）。图标文件位于 `electron/assets/`。

---

*本文档为架构交付物；实现细节与上述契约冲突时，以本文档为准，变更需回写本文档并更新 ADR。*
