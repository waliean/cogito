// ============================================================
// preload.cjs —— Electron 预加载脚本
// 暴露安全的 IPC 调用给渲染进程
// ============================================================

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cogitoAPI', {
  openDataDir: () => ipcRenderer.invoke('open-data-dir'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),
  setLanguage: (lang) => ipcRenderer.invoke('set-language', lang),
  isElectron: true,
});