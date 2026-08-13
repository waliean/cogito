# 桌面封装指南（Electron）

Cogito 以 Electron 桌面应用形式交付，提供完整的 Windows 安装包与便携版。

## 用户使用

### 安装包

从 [Releases] 下载 `Cogito Setup x.x.x.exe`，双击安装：

- 支持自定义安装目录
- 自动创建桌面快捷方式与开始菜单
- 数据保存在 `%APPDATA%/Cogito/data/`（卸载时可选保留）
- 系统托盘：关闭窗口最小化到托盘，托盘菜单「退出」真正退出

### 便携版

下载 `win-unpacked.zip`，解压后运行 `Cogito.exe` 即可（无需安装，数据保存在 `Cogito.exe` 同级 `data/` 目录）。

### 首次使用

1. 启动 Cogito → 点击右上角「设置」
2. 输入 DeepSeek API Key → 点击「保存」→「测试连接」验证连通性
3. 创建或进入工作区，开始 AI 知识卡片探索

## 开发与构建

### 环境要求

- Node.js 22+（推荐 v24.18）
- npm 11+
- Windows 10/11（WebView2 已系统自带）

### 构建流程

完整构建命令（推荐）：

```bash
npm run dist:win
```

内部流程：

1. `npm run build` — 编译 shared → backend → frontend 三包
2. `npx electron-builder --win nsis` — 打包 → NSIS 安装包

### 分步构建

```bash
# 只编译源码
npm run build

# 只打包目录（便携版，跳过安装包）
npx electron-builder --win dir

# 完整安装包
npx electron-builder --win nsis
```

### 开发模式

```bash
# 前后端分离开发（Vite 热更新 + Express）
npm run dev

# 在 Electron 窗口内调试（需先启动 npm run dev）
COGITO_DEVTOOLS=1 npx electron .
```

### 输出目录

| 命令 | 产物 | 位置 |
|---|---|---|
| `npm run build` | 编译后 JS | `shared/dist/`、`backend/dist/`、`frontend/dist/` |
| `e-b --win dir` | 便携应用 | `E:\\cogito\\release\win-unpacked\` |
| `e-b --win nsis` | 安装包 | `E:\\cogito\\release\Cogito Setup x.x.x.exe` |

> 输出目录可通过 `package.json` → `build.directories.output` 配置。

### 镜像配置（国内网络）

`electron-builder` 需要下载 winCodeSign、NSIS 等工具链。若 GitHub 下载慢，可设置镜像：

```bash
set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
npx electron-builder --win nsis
```

## 验证清单

构建后建议验证以下内容：

- [ ] `win-unpacked/resources/app/backend/dist/index.js` 存在
- [ ] `win-unpacked/resources/app/frontend/dist/index.html` 存在
- [ ] `win-unpacked/resources/app/shared/dist/index.js` 存在
- [ ] `win-unpacked/resources/app/node_modules/express` 等关键依赖存在
- [ ] 启动 `Cogito.exe --no-sandbox --remote-debugging-port=9222`
- [ ] 后端 `GET /api/health` 返回 200
- [ ] 前端 `/` 返回 HTML（含 `Cogito` 标题）
- [ ] SPA fallback `/any-route` 返回 200
- [ ] DevTools `ws://127.0.0.1:9222` 可连接
- [ ] 关闭窗口最小化到托盘，托盘菜单「退出」正常退出

## 常见问题

### 安装包构建失败（EBUSY/EPERM）

文件锁问题，通常由防病毒软件或残留进程导致：

```bash
# 杀掉残留进程
taskkill /F /IM Cogito.exe

# 清理临时目录
rmdir /S /Q release
rmdir /S /Q E:\\cogito\\release

# 改输出目录（避开防病毒扫描路径）
```

### 后端启动后立即退出

检查 `%APPDATA%/Cogito/data/` 目录权限，或运行 `Cogito.exe` 后查看命令行日志。

### 修改图标

替换 `electron/assets/icon.png`（256×256 RGBA）和 `electron/assets/icon.ico`，重新构建即可。图标生成脚本：

```bash
node scripts/generate-icon.mjs   # 生成 PNG
node scripts/make-ico.mjs        # PNG → ICO
```

## 架构参考

详细技术设计见 `docs/design.md` 第 11 节（桌面封装架构）。