// ============================================================
// 文本提取 —— PDF(pdf-parse) / TXT(UTF-8/GBK)（design.md 6.2-6.4）
// ============================================================

import { extname } from 'node:path';
import iconv from 'iconv-lite';
import { ErrorCode } from '@cogito/shared';
import { appError } from '../services/cardService.js';

// pdf-parse 1.1.1：使用 lib/pdf-parse.js（纯实现）避开 index.js 的 module 检测（ESM 兼容）
// eslint-disable-next-line @typescript-eslint/no-var-requires
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

type PdfParseFn = (buffer: Buffer) => Promise<{ text: string }>;

// 可注入的解析器（测试替身入口；生产恒为 pdf-parse）
let pdfParser: PdfParseFn = pdfParse as unknown as PdfParseFn;
export function __setPdfParserForTest(fn: PdfParseFn | null): void {
  pdfParser = (fn ?? pdfParse) as PdfParseFn;
}

const MAX_TXT_CHARS = 120000;

/** 提取纯文本（CRLF 归一化为 \n）。失败抛 E_PDF_NO_TEXT / E_TXT_DECODE / E_UNSUPPORTED_TYPE */
export async function extractText(fileName: string, buffer: Buffer): Promise<string> {
  const ext = extname(fileName).toLowerCase();

  if (ext === '.pdf') {
    let text: string;
    try {
      const data = await pdfParser(buffer);
      text = data.text ?? '';
    } catch (err) {
      throw appError(ErrorCode.PDF_NO_TEXT, 'Failed to parse PDF: ' + (err as Error).message);
    }
    text = text.replace(/\r\n/g, '\n').trim();
    if (!text) {
      throw appError(
        ErrorCode.PDF_NO_TEXT,
        'PDF contains no extractable text (possible scanned document, OCR not supported)',
      );
    }
    return text;
  }

  if (ext === '.txt') {
    return decodeTxt(buffer);
  }

  // Markdown 作为 UTF-8 文本读取
  if (ext === '.md') {
    const text = buffer.toString('utf-8').replace(/\r\n/g, '\n').trim();
    if (text) return truncateTxt(text);
    throw appError(ErrorCode.TXT_DECODE, 'MD file is empty');
  }

  throw appError(ErrorCode.UNSUPPORTED_TYPE, `Unsupported file type: ${ext || '(none)'}`);
}

function decodeTxt(buffer: Buffer): string {
  // 1. UTF-8 BOM
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    const text = buffer.toString('utf-8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trim();
    if (text) return truncateTxt(text);
  }

  // 2. strict UTF-8（无替换字符说明可解码）
  const utf8 = buffer.toString('utf-8');
  if (!utf8.includes('\uFFFD')) {
    return truncateTxt(utf8.replace(/\r\n/g, '\n').trim());
  }

  // 3. GBK 兜底（Windows 中文环境常见）
  const gbk = iconv.decode(buffer, 'gbk').replace(/\r\n/g, '\n').trim();
  if (gbk) {
    return truncateTxt(gbk);
  }

  throw appError(ErrorCode.TXT_DECODE, 'TXT cannot be decoded as UTF-8 or GBK');
}

function truncateTxt(text: string): string {
  return text.length > MAX_TXT_CHARS ? text.slice(0, MAX_TXT_CHARS) : text;
}
