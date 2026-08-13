// ============================================================
// GenerateTreeDialog —— 一键生成完整图配置弹窗
// ============================================================

import { useState } from 'react';
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
            <h3 style={{ marginBottom: 12, fontWeight: 600, fontSize: '1rem' }}>一键生成完整图</h3>

            <div className="tree-gen-field">
              <label>展开深度</label>
              <select value={depth} onChange={(e) => setDepth(Number(e.target.value))} disabled={running}>
                <option value={1}>1 层</option>
                <option value={2}>2 层</option>
                <option value={3}>3 层</option>
              </select>
            </div>

            <div className="tree-gen-field">
              <label>每节点分支数</label>
              <select value={branchesPerNode} onChange={(e) => setBranchesPerNode(Number(e.target.value))} disabled={running}>
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={4}>4</option>
              </select>
            </div>

            <div className="tree-gen-estimate">
              每根卡约生成 <strong>{estimated}</strong> 张卡片
            </div>

            {showWarning && (
              <div className="tree-gen-warn">
                规模较大（每根卡最多 {estimated} 张），可能耗时较长
              </div>
            )}

            {running ? (
              <div className="tree-gen-progress">正在生成完整图…（可能需要数分钟）</div>
            ) : (
              <div className="tree-gen-actions">
                <button className="tree-gen-btn" onClick={handleGenerate}>开始生成</button>
                <button className="tree-gen-btn secondary" onClick={onClose}>取消</button>
              </div>
            )}
          </>
        )}

        {error && (
          <div className="tree-gen-error">
            <div className="tree-gen-error-msg">{error}</div>
            <button className="tree-gen-btn" onClick={() => { setError(null); setResult(null); }}>重试</button>
            <button className="tree-gen-btn secondary" onClick={onClose}>关闭</button>
          </div>
        )}

        {result && (
          <div className="tree-gen-result">
            <h3 style={{ marginBottom: 12, fontWeight: 600, fontSize: '1rem' }}>生成完成</h3>
            <div className="tree-gen-result-stats">
              <div>已生成 <strong>{result.created}</strong> 张卡片</div>
              <div>处理根节点 <strong>{result.rootsProcessed}</strong> 个</div>
              <div>跳过 <strong>{result.skipped}</strong> 个</div>
              {result.failures.length > 0 && (
                <div>失败 <strong>{result.failures.length}</strong> 个节点</div>
              )}
            </div>
            {result.truncated && (
              <div className="tree-gen-warn" style={{ marginTop: 8 }}>
                已达卡片数量上限，部分节点未展开
              </div>
            )}
            {result.failures.length > 0 && (
              <div className="tree-gen-errors">
                <button
                  className="tree-gen-errors-toggle"
                  onClick={() => setErrorsOpen(!errorsOpen)}
                >
                  {errorsOpen ? '收起失败详情' : '展开失败详情'}
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
            <button className="tree-gen-btn" style={{ marginTop: 12 }} onClick={onClose}>完成</button>
          </div>
        )}
      </div>
    </div>
  );
}