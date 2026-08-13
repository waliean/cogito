// ============================================================
// usePolling —— 通用轮询（design.md 4.1：文档摘要轮询 1.5s）
// ============================================================

import { useEffect, useRef } from 'react';

export function usePolling(
  callback: () => void,
  enabled: boolean,
  intervalMs = 1500,
): void {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => {
      cbRef.current();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [enabled, intervalMs]);
}
