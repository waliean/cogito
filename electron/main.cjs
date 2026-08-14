// ============================================================
// Electron 主进程 —— Cogito 桌面应用
// 职责：单实例、启动后端子进程、解析端口、创建窗口、托盘、退出清理
// ============================================================

const { app, BrowserWindow, Tray, Menu, dialog, nativeImage, ipcMain, shell } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { t, setLang, normalizeLocale } = require('./i18n.cjs');

const isDev = !app.isPackaged;
let backendProcess = null;
let tray = null;
let mainWindow = null;
let quitting = false;

// ---- 单实例 ----
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(main);
}

function backendEntry() {
  return path.join(app.getAppPath(), 'backend', 'dist', 'index.js');
}

function frontendDist() {
  return path.join(app.getAppPath(), 'frontend', 'dist');
}

function dataDir() {
  return path.join(app.getPath('userData'), 'data');
}

async function main() {
  app.setName('Cogito');
  // 渲染进程起来前，用系统 locale 兜底（app ready 后 getLocale 才稳定）
  setLang(normalizeLocale(app.getLocale()));

  const port = await startBackend();
  if (!port) {
    dialog.showErrorBox(t('startupFailedTitle'), t('startupFailedDetail'));
    app.quit();
    return;
  }

  createWindow(port);
  createTray();
}

// ---- 启动后端子进程（ELECTRON_RUN_AS_NODE 用 Electron 自带 Node）----
function startBackend() {
  return new Promise((resolve) => {
    const entry = backendEntry();
    if (!fs.existsSync(entry)) {
      dialog.showErrorBox(t('backendEntryMissingTitle'), t('backendEntryMissingDetail', { entry }));
      resolve(null);
      return;
    }

    const env = {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      DATA_DIR: dataDir(),
      FRONTEND_DIST: frontendDist(),
      PORT: '0', // 随机端口，从 stdout 解析
    };

    const args = [entry];
    if (isDev) {
      // 开发模式：后端已有 tsx watch 进程，直接跳过（由 npm run dev 管理）
      // 此处仅用于生产/打包验证；dev 下由根 dev 脚本组合
      args.unshift('node');
    }

    const child = spawn(process.execPath, [entry], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    backendProcess = child;

    let stdout = '';
    let resolved = false;

    const tryResolve = (chunk) => {
      stdout += chunk;
      const m = stdout.match(/\[backend\] PORT=(\d+)/);
      if (m && !resolved) {
        resolved = true;
        const port = parseInt(m[1], 10);
        console.log(`[electron] backend on port ${port}`);
        resolve(port);
      }
    };

    child.stdout.on('data', tryResolve);
    child.stderr.on('data', (chunk) => {
      process.stderr.write(`[backend] ${chunk}`);
    });

    child.on('error', (err) => {
      console.error('[electron] backend spawn error:', err);
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    });

    child.on('exit', (code) => {
      console.log(`[electron] backend exited with code ${code}`);
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
      if (code !== 0 && !quitting && mainWindow) {
        dialog.showErrorBox(t('backendExitedTitle'), t('backendExitedDetail', { code }));
      }
    });

    // 20s 超时兜底
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    }, 20000);
  });
}

// ---- IPC 处理器 ----
ipcMain.handle('open-data-dir', async () => {
  const dir = dataDir();
  try {
    await shell.openPath(dir);
  } catch { /* silent */ }
});

// 选择文件夹对话框（用于创建/关联文件夹工作区）
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: t('selectFolderTitle'),
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

// 在系统资源管理器中打开指定文件
ipcMain.handle('open-file', async (_event, filePath) => {
  try {
    await shell.openPath(filePath);
  } catch { /* silent */ }
});

// 渲染进程同步语言：立即生效于托盘/窗口标题
ipcMain.handle('set-language', (_event, lang) => {
  setLang(lang);
  rebuildTray();
  mainWindow?.setTitle(t('windowTitle'));
});

// ---- 窗口 ----
function createWindow(port) {
  const preloadPath = path.join(app.getAppPath(), 'electron', 'preload.cjs');

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: t('windowTitle'),
    backgroundColor: '#101010',
    icon: path.join(app.getAppPath(), 'electron', 'assets', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath,
    },
  });

  const url = `http://localhost:${port}/`;
  mainWindow.loadURL(url);

  // 开发模式可开 DevTools
  if (isDev && process.env.COGITO_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 关闭按钮 -> 隐藏到托盘（保留后台服务）
  mainWindow.on('close', (e) => {
    if (!quitting && tray) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

// ---- 托盘 ----
function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: t('trayShow'), click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { type: 'separator' },
    { label: t('trayQuit'), click: () => { quitting = true; app.quit(); } },
  ]);
}

function rebuildTray() {
  if (!tray) return;
  tray.setContextMenu(buildTrayMenu());
  tray.setToolTip(t('trayTooltip'));
}

function createTray() {
  const iconPath = path.join(app.getAppPath(), 'electron', 'assets', 'icon.png');
  let icon;
  try {
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) icon = nativeImage.createEmpty();
  } catch {
    icon = nativeImage.createEmpty();
  }
  tray = new Tray(icon);
  rebuildTray();
  tray.on('click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

// ---- 退出清理 ----
app.on('before-quit', () => {
  quitting = true;
  if (backendProcess) {
    try {
      backendProcess.kill();
    } catch { /* ignore */ }
  }
});

app.on('window-all-closed', () => {
  // 托盘模式：不自动退出
});
