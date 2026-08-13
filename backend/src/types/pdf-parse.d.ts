// 类型声明：pdf-parse 的纯实现子路径（CJS 模块无内置类型）
declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PdfParseResult {
    text: string;
    numpages?: number;
    info?: unknown;
    metadata?: unknown;
  }
  function pdfParse(buffer: Buffer, options?: unknown): Promise<PdfParseResult>;
  export default pdfParse;
}
