// ============================================================
// i18n.cjs —— Electron 主进程最小 i18n（zh / en）
// 渲染进程通过 preload 的 cogitoAPI.setLanguage() 同步当前语言
// module 级 lang 默认 'zh'，main() 开头用 app.getLocale() 兜底
// ============================================================
'use strict';

const TABLE = {
  zh: {
    startupFailedTitle: '启动失败',
    startupFailedDetail: '后端服务未能启动，请查看日志或重新安装。',
    backendEntryMissingTitle: '启动失败',
    backendEntryMissingDetail: '后端入口不存在: {{entry}}',
    backendExitedTitle: '后端异常退出',
    backendExitedDetail: '后端服务异常退出（code {{code}}）。',
    trayShow: '显示主窗口',
    trayQuit: '退出',
    windowTitle: 'Cogito — AI 知识卡片探索',
    trayTooltip: 'Cogito — AI 知识卡片探索',
    selectFolderTitle: '选择文件夹作为工作区',
  },
  en: {
    startupFailedTitle: 'Startup failed',
    startupFailedDetail: 'Backend service failed to start. Check logs or reinstall.',
    backendEntryMissingTitle: 'Startup failed',
    backendEntryMissingDetail: 'Backend entry not found: {{entry}}',
    backendExitedTitle: 'Backend exited',
    backendExitedDetail: 'Backend exited unexpectedly (code {{code}}).',
    trayShow: 'Show Main Window',
    trayQuit: 'Quit',
    windowTitle: 'Cogito — AI Knowledge Card Explorer',
    trayTooltip: 'Cogito — AI Knowledge Card Explorer',
    selectFolderTitle: 'Choose a folder as workspace',
  },
};

let lang = 'zh';

/** 规范化 locale：以小写 zh 开头 → 'zh'，否则 'en' */
function normalizeLocale(locale) {
  return String(locale || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

/** 仅接受 'zh' / 'en'，更新内部 lang 并返回 */
function setLang(resolved) {
  if (resolved === 'zh' || resolved === 'en') lang = resolved;
  return lang;
}

function getLang() {
  return lang;
}

/** 取 TABLE[lang][key] ?? TABLE.en[key] ?? key，用 {{var}} 插值 */
function t(key, vars) {
  const entry = (TABLE[lang] && TABLE[lang][key]) ?? TABLE.en[key] ?? key;
  if (typeof entry !== 'string' || !vars) return entry;
  let out = entry;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{{${k}}}`, String(v));
  }
  return out;
}

module.exports = { t, setLang, normalizeLocale, getLang };