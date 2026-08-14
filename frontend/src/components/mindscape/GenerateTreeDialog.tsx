// ============================================================
// GenerateTreeDialog —— 一键生成完整图配置弹窗
// ============================================================

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GenerateTreeResult } from '@cogito/shared';
import { useCardStore } from '../../state/store.js';

interface GenerateTreeDialogProps {
  running: boolean;
  onClose: () => void;
}

function estimateTotal(depth: number, branchesPerNode: number): number {
  let total = 0;
  for (let d = 1; d <= depth; d++) {
    total += Math.pow(branchesPerNode, d);
  }
  return total;
}

export function GenerateTreeDialog({ running, onClose }: GenerateTreeDialogProps) {
  const { t } = useTranslation();
  const [depth, setDepth] = useState(2);
  const [branchesPerNode, setBranchesPerNode] = useState(3);
  const [result, setResult] = useState<GenerateTreeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorsOpen, setErrorsOpen] = useState(false);
  const generateTree = useCardStore((s) => s.generateTree);

  const estimated = estimateTotal(depth, branchesPerNode);
  const showWarning = depth === 3 && branchesPerNode >= 4;

  const handleGenerate = async () => {
    setError(null);
    setResult(null);
    try {
      const res = await generateTree(depth, branchesPerNode);
      setResult(res);
    } catch (e: any) {
      setError(e.message ?? String(e));
    }
  };

  return (
    <div className="tree-gen-dialog" onClick={() => { if (!running) onClose(); }}>
      <div className="tree-gen-dialog-inner" onClick={(e) => e.stopPropagation()}>
        {!result && !error && (
          <>
            <h3 style={{ marginBottom: 12, fontWeight: 600, fontSize: '1rem' }}>{t('mindmap.generateTree')}</h3>

            <div className="tree-gen-field">
              <label>{t('mindmap.depthLabel')}</label>
              <select value={depth} onChange={(e) => setDepth(Number(e.target.value))} disabled={running}>
                <option value={1}>{t('mindmap.depthOption', { count: 1 })}</option>
                <option value={2}>{t('mindmap.depthOption', { count: 2 })}</option>
                <option value={3}>{t('mindmap.depthOption', { count: 3 })}</option>
              </select>
            </div>

            <div className="tree-gen-field">
              <label>{t('mindmap.branchesLabel')}</label>
              <select value={branchesPerNode} onChange={(e) => setBranchesPerNode(Number(e.target.value))} disabled={running}>
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={4}>4</option>
              </select>
            </div>

            <div className="tree-gen-estimate">
              {t('mindmap.estimate', { count: estimated })}
            </div>

            {showWarning && (
              <div className="tree-gen-warn">
                {t('mindmap.warning', { count: estimated })}
              </div>
            )}

            {running ? (
              <div className="tree-gen-progress">{t('mindmap.progress')}</div>
            ) : (
              <div className="tree-gen-actions">
                <button className="tree-gen-btn" onClick={handleGenerate}>{t('mindmap.start')}</button>
                <button className="tree-gen-btn secondary" onClick={onClose}>{t('common.cancel')}</button>
              </div>
            )}
          </>
        )}

        {error && (
          <div className="tree-gen-error">
            <div className="tree-gen-error-msg">{error}</div>
            <button className="tree-gen-btn" onClick={() => { setError(null); setResult(null); }}>{t('common.retry')}</button>
            <button className="tree-gen-btn secondary" onClick={onClose}>{t('common.close')}</button>
          </div>
        )}

        {result && (
          <div className="tree-gen-result">
            <h3 style={{ marginBottom: 12, fontWeight: 600, fontSize: '1rem' }}>{t('mindmap.done')}</h3>
            <div className="tree-gen-result-stats">
              <div>{t('mindmap.createdStats', { count: result.created })}</div>
              <div>{t('mindmap.rootsStats', { count: result.rootsProcessed })}</div>
              <div>{t('mindmap.skippedStats', { count: result.skipped })}</div>
              {result.failures.length > 0 && (
                <div>{t('mindmap.failedStats', { count: result.failures.length })}</div>
              )}
            </div>
            {result.truncated && (
              <div className="tree-gen-warn" style={{ marginTop: 8 }}>
                {t('mindmap.truncated')}
              </div>
            )}
            {result.failures.length > 0 && (
              <div className="tree-gen-errors">
                <button
                  className="tree-gen-errors-toggle"
                  onClick={() => setErrorsOpen(!errorsOpen)}
                >
                  {errorsOpen ? t('mindmap.collapseFailures') : t('mindmap.expandFailures')}
                </button>
                {errorsOpen && (
                  <ul className="tree-gen-errors-list">
                    {result.failures.map((f, i) => (
                      <li key={i}>
                        <strong>{f.parentTitle}</strong>: {f.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <button className="tree-gen-btn" style={{ marginTop: 12 }} onClick={onClose}>{t('common.done')}</button>
          </div>
        )}
      </div>
    </div>
  );
}