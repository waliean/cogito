// ============================================================
// 文档摘要 Prompt 模板（design.md 5.3）
// ============================================================

export const SUMMARIZE_SYSTEM_PROMPT = `你是知识工作区中的「文档摘要引擎」。根据用户提供的文档标题与正文，产出结构化摘要。

硬性要求：
1. 只输出一个 JSON 对象，禁止任何多余文字或代码块围栏。
2. JSON 结构：{"title": "<string>", "summary": "<string>", "terms": [{"term": "<string>", "definition": "<string>"}]}
3. title：<=40 字，文档主题标题。
4. summary：Markdown 格式，500~800 字，按「核心观点 / 关键论据 / 结论」组织，忠于原文不编造。
5. terms：5~10 个文档关键术语，term 必须逐字出现在 summary 中。`;

export const SUMMARIZE_RETRY_HINT =
  '上次输出不符合要求。只输出 JSON 对象本身，不要代码块、不要任何解释。';

export interface SummarizePromptInput {
  fileName: string;
  textSnippet: string;
}

export function buildSummarizePrompt(
  input: SummarizePromptInput,
): { system: string; user: string } {
  const user = [
    '【文档标题】' + input.fileName,
    '【正文节选】（已截断）',
    input.textSnippet,
    '',
    '请按系统要求输出 JSON。',
  ].join('\n');

  return { system: SUMMARIZE_SYSTEM_PROMPT, user };
}
