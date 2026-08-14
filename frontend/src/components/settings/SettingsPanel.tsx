// ============================================================
// SettingsPanel —— Key/模型/温度/超时 + 测试连接 + 打开数据目录（M2）
// ============================================================

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { LanguagePreference } from '@cogito/shared';
import { useSettingsStore, useUIStore } from '../../state/store.js';
import { getDataPath } from '../../api/settings.js';

export function SettingsPanel() {
  const { t } = useTranslation();
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
  const [language, setLanguage] = useState<LanguagePreference>('system');
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
      setLanguage(settings.language ?? 'system');
    }
  }, [settings]);

  const handleSave = async () => {
    setSaved(false);
    try {
      await save({
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        baseUrl,
        model,
        temperature,
        timeoutMs,
        dictTermStyle,
        language,
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
        <h3>{t('settings.title')}</h3>
        {error && <div className="ws-error">{error}</div>}

        <label className="settings-label">
          {t('settings.apiKeyLabel')}
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={settings?.hasApiKey ? t('settings.apiKeyConfiguredPlaceholder') : 'sk-...'}
            autoComplete="off"
          />
        </label>
        <p className="settings-hint">
          {t('settings.apiKeyHint')}
        </p>

        <label className="settings-label">
          {t('settings.baseUrlLabel')}
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
        </label>

        <label className="settings-label">
          {t('settings.modelLabel')}
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="deepseek-v4-flash"
          />
        </label>

        <div className="settings-row">
          <label className="settings-label">
            {t('settings.temperatureLabel')}
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
            {t('settings.timeoutLabel')}
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
          <span className="settings-label">{t('settings.dictStyleLabel')}</span>
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
                  {style === 'italic'
                    ? t('settings.dictStyleItalic')
                    : style === 'bold'
                      ? t('settings.dictStyleBold')
                      : t('settings.dictStyleUnderline')}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="settings-dict-style">
          <span className="settings-label">{t('settings.language.label')}</span>
          <div className="settings-dict-style-options">
            {(['system', 'zh', 'en'] as const).map((l) => (
              <label key={l} className="settings-dict-style-option">
                <input
                  type="radio"
                  name="language"
                  value={l}
                  checked={language === l}
                  onChange={(e) => setLanguage(e.target.value as LanguagePreference)}
                />
                <span>{t(`settings.language.${l}`)}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="settings-actions">
          <button onClick={handleSave} disabled={testing}>
            {saved ? t('settings.saved') : t('common.save')}
          </button>
          <button
            className="secondary"
            onClick={() => test().catch(() => {})}
            disabled={testing}
          >
            {testing ? t('settings.testing') : t('settings.test')}
          </button>
        </div>

        {lastTest && (
          <div className="settings-test-result">
            {t('settings.testResult', { model: lastTest.model, latencyMs: lastTest.latencyMs })}
          </div>
        )}

        <div className="settings-divider" />

        <div className="settings-data-section">
          <span className="settings-data-label">{t('settings.dataDirLabel')}</span>
          <p className="settings-data-hint">
            {t('settings.dataDirHint')}
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
                    setDataPath(t('settings.getPathFailed'));
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
              {copied ? t('settings.copyPath') : t('settings.openDataDir')}
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