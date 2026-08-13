// ============================================================
// SettingsPanel —— Key/模型/温度/超时 + 测试连接 + 打开数据目录（M2）
// ============================================================

import { useState, useEffect } from 'react';
import { useSettingsStore, useUIStore } from '../../state/store.js';
import { getDataPath } from '../../api/settings.js';

export function SettingsPanel() {
  const settings = useSettingsStore((s) => s.settings);
  const testing = useSettingsStore((s) => s.testing);
  const lastTest = useSettingsStore((s) => s.lastTest);
  const error = useSettingsStore((s) => s.error);
  const save = useSettingsStore((s) => s.save);
  const test = useSettingsStore((s) => s.test);
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);

  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://api.deepseek.com');
  const [model, setModel] = useState('deepseek-v4-flash');
  const [temperature, setTemperature] = useState(0.7);
  const [timeoutMs, setTimeoutMs] = useState(60000);
  const [dictTermStyle, setDictTermStyle] = useState<'italic' | 'bold' | 'underline'>('italic');
  const [saved, setSaved] = useState(false);
  const [dataPath, setDataPath] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (settings) {
      setBaseUrl(settings.baseUrl);
      setModel(settings.model);
      setTemperature(settings.temperature);
      setTimeoutMs(settings.timeoutMs);
      setDictTermStyle(settings.dictTermStyle ?? 'italic');
    }
  }, [settings]);

  const handleSave = async () => {
    setSaved(false);
    try {
      await save({
        apiKey,
        baseUrl,
        model,
        temperature,
        timeoutMs,
        dictTermStyle,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // error shown from store
    }
  };

  return (
    <div className="settings-overlay" onClick={(e) => {
      if (e.target === e.currentTarget) setSettingsOpen(false);
    }}>
      <div className="settings-panel">
        <h3>AI 设置</h3>
        {error && <div className="ws-error">{error}</div>}

        <label className="settings-label">
          API Key
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={settings?.hasApiKey ? '已配置（留空保持不变）' : 'sk-...'}
            autoComplete="off"
          />
        </label>
        <p className="settings-hint">
          保存到本机 db.json，仅用于调用 DeepSeek，不会展示明文。
        </p>

        <label className="settings-label">
          Base URL
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
        </label>

        <label className="settings-label">
          模型
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="deepseek-v4-flash"
          />
        </label>

        <div className="settings-row">
          <label className="settings-label">
            温度
            <input
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
            />
          </label>
          <label className="settings-label">
            超时(ms)
            <input
              type="number"
              min={5000}
              step={5000}
              value={timeoutMs}
              onChange={(e) => setTimeoutMs(Number(e.target.value))}
            />
          </label>
        </div>

        <div className="settings-dict-style">
          <span className="settings-label">词典术语突出样式</span>
          <div className="settings-dict-style-options">
            {(['italic', 'bold', 'underline'] as const).map((style) => (
              <label key={style} className="settings-dict-style-option">
                <input
                  type="radio"
                  name="dictTermStyle"
                  value={style}
                  checked={dictTermStyle === style}
                  onChange={(e) => setDictTermStyle(e.target.value as any)}
                />
                <span className={`term-dict term-dict-${style}`}>
                  {style === 'italic' ? '斜体' : style === 'bold' ? '加粗' : '下划线'}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="settings-actions">
          <button onClick={handleSave} disabled={testing}>
            {saved ? '已保存' : '保存'}
          </button>
          <button
            className="secondary"
            onClick={() => test().catch(() => {})}
            disabled={testing}
          >
            {testing ? '测试中...' : '测试连接'}
          </button>
        </div>

        {lastTest && (
          <div className="settings-test-result">
            连接成功：{lastTest.model} · {lastTest.latencyMs}ms
          </div>
        )}

        <div className="settings-divider" />

        <div className="settings-data-section">
          <span className="settings-data-label">数据目录</span>
          <p className="settings-data-hint">
            存储 db.json 与上传文档的本地文件夹
          </p>
          <div className="settings-data-row">
            <button
              className="settings-data-btn"
              onClick={async () => {
                // 如果在 Electron 桌面版，直接打开文件夹
                const api = (window as any).cogitoAPI;
                if (api?.isElectron) {
                  try {
                    await api.openDataDir();
                    return;
                  } catch { /* fallback */ }
                }
                // 浏览器版：获取路径并复制到剪贴板
                if (!dataPath) {
                  try {
                    const res = await getDataPath();
                    setDataPath(res.path);
                  } catch {
                    setDataPath('无法获取路径');
                  }
                }
                const path = dataPath || (await getDataPath()).path;
                try {
                  await navigator.clipboard.writeText(path);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  // 降级：选中文本
                }
              }}
            >
              {copied ? '已复制路径' : '打开数据文件夹'}
            </button>
          </div>
          {dataPath && (
            <div className="settings-data-path" title={dataPath}>
              {dataPath}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
