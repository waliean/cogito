# Cogito — AI 知识卡片探索工作区

AI 驱动的本地知识探索工具。以卡片为基本单元，通过 AI（DeepSeek）自动生成子卡片形成知识树，支持思维导图可视化与文档自动摘要。

## 功能总览（M0–M5 全部完成）

| 模块 | 说明 |
|---|---|
| 工作区 | 多工作区创建/改名/删除；自动创建根卡片 |
| 卡片树 | 三种生成模式：深入(child)/发散(divergent)/分支(branch)；状态机 draft→processing→done/failed；失败一键重试 |
| AI 生成 | DeepSeek JSON 模式生成子卡；SDK 重试(3) + 解析重试(1)；aiMeta 可溯源（模型/tokens/耗时/错误码）；429/超时/无 Key 友好提示 |
| MindScape 导图 | @xyflow/react + dagre 确定性自动布局；点击节点联动详情；状态着色（MiniMap） |
| 文档处理 | PDF/TXT 上传（10MB 上限、类型成对校验）；pdf-parse 提取、UTF-8/GBK 解码；AI 摘要自动生成根卡片；异步流水线 + 前端轮询 |
| 术语库 | 全工作区术语聚合计数；点击联动卡片树/导图/详情 Markdown 高亮（最长优先） |
| 设置 | API Key（本地存储，永不回传明文）、模型、温度、超时；一键测试连接 |

## 快速开始

```bash
# 安装依赖（根目录一次安装全部 workspace）
npm install

# 启动开发环境（后端 :3001 + 前端 :5173）
npm run dev

# 生产构建 / 测试 / 类型检查
npm run build
npm test
npm run typecheck
```

## 端口说明

| 服务 | 端口 | 说明 |
|------|------|------|
| 前端（Vite） | 5173 | React 开发服务器，`/api` 代理到后端 |
| 后端（Express） | 3001 | REST API 服务 |

## 桌面应用（Electron）

Cogito 也可以作为 Windows 桌面应用运行，提供原生窗口、系统托盘、安装/卸载程序。

### 快速体验

从 [Releases](https://github.com/your-org/cogito/releases) 下载 `Cogito Setup x.x.x.exe`，双击安装即用。

或者手动构建：

```bash
npm run dist:win
# 产物在 E:\\cogito\\release\Cogito Setup x.x.x.exe
```

### 便携版

```bash
npx electron-builder --win dir
# 运行 E:\\cogito\\release\win-unpacked\Cogito.exe 即可
```

详细打包指南见 [docs/packaging.md](docs/packaging.md)。

## 配置 API Key

三种方式（优先级从高到低）：

1. 请求头 `X-API-Key: sk-xxx`（临时覆盖，不落盘）
2. 前端「设置」面板保存（落盘 `backend/data/db.json`，永不回传明文）
3. 环境变量 `DEEPSEEK_API_KEY`（.env，第三级兜底）

复制 `.env.example` 为 `.env` 可配置 `DEEPSEEK_BASE_URL` / `DEEPSEEK_MODEL` / `PORT`。

## API 概览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/health | 健康检查 + AI 配置状态 |
| GET/POST/PATCH/DELETE | /api/workspaces | 工作区 CRUD |
| GET/POST | /api/workspaces/:wid/cards | 卡片列表（?tree=true 树形）/ 手动建卡 |
| GET/PATCH/DELETE | /api/cards/:id | 单卡操作（删除时子节点提升为根） |
| POST | /api/cards/:id/generate | AI 生成子卡 `{mode, instruction?}` |
| POST | /api/workspaces/:wid/documents | multipart 上传（202 异步） |
| GET/DELETE | /api/documents/:id | 单条（轮询用）/ 删除 |
| POST | /api/documents/:id/retry | 失败重新摘要 |
| GET/PUT | /api/settings | 设置（无 Key 明文）；PUT apiKey 空串=清除 |
| POST | /api/settings/test | 测试连接 |

错误统一 `{ "error": { "code", "message" } }`，错误码见 `docs/design.md` 3.4。

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面壳 | Electron 43 + electron-builder 26 (NSIS 安装包) |
| 前端 | React 19 + TypeScript + Vite 8 + Zustand 5 + @xyflow/react + dagre + markdown-it |
| 后端 | Express 5 + multer + pdf-parse + iconv-lite + openai SDK |
| 存储 | JSON 文件存储（原子写 + 写队列 + 损坏恢复） |

## 架构文档

| 文档 | 内容 |
|---|---|
| [docs/design.md](docs/design.md) | 完整技术设计：数据 Schema、API 契约、状态机、Prompt 设计、ADR、桌面封装架构 |
| [docs/packaging.md](docs/packaging.md) | 桌面封装指南：构建、打包、验证、常见问题 |
| [CHANGELOG.md](CHANGELOG.md) | 版本变更记录 |
