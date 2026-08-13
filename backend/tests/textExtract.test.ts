// ============================================================
// textExtract.test.ts —— TXT 编码探测（UTF-8/GBK/BOM）+ PDF 提取
// ============================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { extractText, __setPdfParserForTest } from '../src/utils/textExtract.js';
import { resetForTest } from '../src/services/storage.js';

beforeEach(() => {
  resetForTest();
});

afterEach(() => {
  __setPdfParserForTest(null);
});

describe('extractText: TXT', () => {
  it('UTF-8 无 BOM 正常解码', async () => {
    const buf = Buffer.from('你好世界\n第二行', 'utf-8');
    const text = await extractText('note.txt', buf);
    expect(text).toBe('你好世界\n第二行');
  });

  it('UTF-8 BOM 去除 BOM 头', async () => {
    const buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('BOM 开头', 'utf-8')]);
    const text = await extractText('bom.txt', buf);
    expect(text).toBe('BOM 开头');
  });

  it('GBK 中文（UTF-8 解码失败时兜底）', async () => {
    // '中文' 的 GBK 字节，UTF-8 strict 解码会产生替换字符
    const gbk = Buffer.from([0xd6, 0xd0, 0xce, 0xc4]);
    const text = await extractText('gbk.txt', gbk);
    expect(text).toBe('中文');
  });

  it('CRLF 归一化为 LF', async () => {
    const buf = Buffer.from('a\r\nb\r\nc', 'utf-8');
    const text = await extractText('crlf.txt', buf);
    expect(text).toBe('a\nb\nc');
  });

  it('无效 UTF-8 字节走 GBK 兜底不抛错', async () => {
    const buf = Buffer.from([0xff, 0xfe, 0x00, 0x81]);
    const text = await extractText('weird.txt', buf);
    expect(typeof text).toBe('string');
    expect(text.length).toBeGreaterThan(0);
  });
});

describe('extractText: PDF', () => {
  it('成功提取文本并归一化 CRLF', async () => {
    __setPdfParserForTest(async () => ({ text: 'PDF 内容\r\n第二段' }));
    const text = await extractText('doc.pdf', Buffer.from('fake'));
    expect(text).toBe('PDF 内容\n第二段');
  });

  it('空文本 -> E_PDF_NO_TEXT（疑似扫描件）', async () => {
    __setPdfParserForTest(async () => ({ text: '  \n ' }));
    await expect(extractText('scan.pdf', Buffer.from('fake'))).rejects.toMatchObject({
      code: 'E_PDF_NO_TEXT',
      statusCode: 422,
    });
  });

  it('pdf-parse 抛错 -> E_PDF_NO_TEXT', async () => {
    __setPdfParserForTest(async () => {
      throw new Error('corrupt pdf');
    });
    await expect(extractText('corrupt.pdf', Buffer.from('x'))).rejects.toMatchObject({
      code: 'E_PDF_NO_TEXT',
      statusCode: 422,
    });
  });
});

describe('extractText: 类型', () => {
  it('非 PDF/TXT -> E_UNSUPPORTED_TYPE', async () => {
    await expect(extractText('image.png', Buffer.from('x'))).rejects.toMatchObject({
      code: 'E_UNSUPPORTED_TYPE',
      statusCode: 415,
    });
  });
});
