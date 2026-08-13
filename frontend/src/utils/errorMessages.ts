// ============================================================
// 错误码 -> 用户友好文案（design.md 5.5）
// ============================================================

const CODE_MESSAGES: Record<string, string> = {
  E_NO_API_KEY: '尚未配置 API Key，请在右上角「设置」中配置后重试',
  E_INVALID_API_KEY: 'API Key 无效，请检查后在「设置」中更新',
  E_CARD_BUSY: '该卡片正在生成中，请稍候',
  E_AI_RATE_LIMIT: '模型限流，请稍后重试',
  E_AI_TIMEOUT: '生成超时，可点击「重新生成」重试',
  E_AI_ERROR: 'AI 服务出错',
  E_CONFLICT: '操作与当前结构冲突，无法完成',
  E_NOT_FOUND: '资源不存在或已被删除',
  E_VALIDATION: '请求参数不合法',
  E_FILE_TOO_LARGE: '文件超过 10MB 限制',
  E_UNSUPPORTED_TYPE: '仅支持 PDF/TXT 文件',
  E_PDF_NO_TEXT: 'PDF 无可提取文本（疑似扫描件，暂不支持 OCR）',
  E_TXT_DECODE: 'TXT 编码无法识别（支持 UTF-8/GBK）',
  E_INTERNAL: '服务器内部错误，请稍后重试',
};

export function errorMessage(code: string | undefined, fallback: string): string {
  if (!code) return fallback;
  return CODE_MESSAGES[code] ?? fallback;
}

/** 从任意 Error/ApiError 提取展示文案，附带后端返回的详细错误信息 */
export function describeError(err: unknown): string {
  const e = err as { code?: string; message?: string } | null | undefined;
  if (!e) return '未知错误';
  const base = errorMessage(e.code, e.message ?? '未知错误');
  // 对于 AI 错误，将后端返回的详细 message 追加到用户友好文案后面
  if (e.code === 'E_AI_ERROR' && e.message && e.message !== base) {
    return `${base}：${e.message}`;
  }
  return base;
}
