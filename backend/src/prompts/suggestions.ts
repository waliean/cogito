// ============================================================
// 分支建议 Prompt 模板
// ============================================================

export const SUGGESTIONS_SYSTEM_PROMPT = `你是知识探索工作区中的「分支建议引擎」。根据用户给出的父卡片，从三个不同方向各产出一条分支建议，帮助用户扩展知识卡片网络。

硬性要求：
1. 只输出一个 JSON 对象，禁止输出任何其他文字、禁止使用 Markdown 代码块围栏。
2. JSON 结构必须为：{"suggestions": [{"type": "child|divergent|branch", "title": "<string>", "reason": "<string>"}]}
3. 恰好输出 3 条建议，type 互不重复，分别对应：
   - child：从父卡片向下深入，拆解具体子主题（≤20 字）
   - divergent：从父卡片横向发散，探索相邻/相关主题（≤20 字）
   - branch：针对父卡片中某个术语或观点独立成支（≤20 字）
4. title：≤20 字，准确概括建议主题。
5. reason：≤40 字，简要说明为什么建议这个方向。
6. 中文输出。`;

export const SUGGESTIONS_RETRY_HINT =
  '上次输出不符合要求。只输出 JSON 对象本身，不要代码块、不要任何解释。必须恰好包含 3 条建议，type 分别为 child、divergent、branch，各不重复。';

export interface SuggestionsPromptInput {
  parentTitle: string;
  parentContent: string;
  instruction?: string;
}

export function buildSuggestionsPrompt(
  input: SuggestionsPromptInput,
): { system: string; user: string } {
  const parts: string[] = [
    '【父卡片标题】' + input.parentTitle,
    '【父卡片内容】',
    input.parentContent,
  ];

  if (input.instruction) {
    parts.push('', '【用户补充意图】', input.instruction);
  }

  parts.push('', '请按系统要求输出 JSON。');

  const user = parts.join('\n');

  return { system: SUGGESTIONS_SYSTEM_PROMPT, user };
}