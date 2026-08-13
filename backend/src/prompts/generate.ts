// ============================================================
// 卡片生成 Prompt 模板（design.md 5.2）
// ============================================================

import type { GenerationMode } from '@cogito/shared';

const MODE_DESC: Record<GenerationMode, string> = {
  child: '从父卡片向下深化，选择一个具体子主题拆解',
  divergent: '从父卡片横向发散，探索相邻/相关主题',
  branch: '针对父卡片中的某个术语或观点独立成支',
};

export const GENERATE_SYSTEM_PROMPT = `你是知识探索工作区中的「卡片生成引擎」。根据用户给出的父卡片与生成模式，产出一张语义连贯、有增量信息的新知识卡片。

硬性要求：
1. 只输出一个 JSON 对象，禁止输出任何其他文字、禁止使用 Markdown 代码块围栏。
2. JSON 结构必须为：{"title": "<string>", "content": "<string>", "terms": [{"term": "<string>", "definition": "<string>"}]}
3. title：<=40 字，准确概括新卡片主题。
4. content：Markdown 格式，200~500 字；必须与父卡片内容衔接并产生增量（深化/发散/分支），不得整段复述父卡片；不要编造来源与引用。
5. terms：3~6 个，每个 term 必须逐字出现在 content 中；definition 为 <=50 字的一句话解释。
6. content 中出现的 markdown 符号不要出现在 term 内。`;

export const GENERATE_RETRY_HINT =
  '上次输出不符合要求。只输出 JSON 对象本身，不要代码块、不要任何解释。';

export interface GeneratePromptInput {
  mode: GenerationMode;
  parentTitle: string;
  parentContent: string;
  instruction?: string;
}

export function buildGeneratePrompt(
  input: GeneratePromptInput,
): { system: string; user: string } {
  const user = [
    '【生成模式】' + input.mode,
    `- ${MODE_DESC[input.mode]}`,
    '',
    '【父卡片标题】' + input.parentTitle,
    '【父卡片内容】',
    input.parentContent,
    '',
    input.instruction ? '【用户补充意图】' + '\n' + input.instruction : '',
    '请按系统要求输出 JSON。',
  ].join('\n');

  return { system: GENERATE_SYSTEM_PROMPT, user };
}
