// ============================================================
// generate-dictionary.mjs —— 读取 AI 编码词典中文版，生成前端数据
// 用法: node scripts/generate-dictionary.mjs [词典路径] [输出路径]
// ============================================================

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// ---- 参数 ----

const DICT_DIR = resolve(process.argv[2] || 'E:\\Cogito\\ai-coding-dictionary-zh');
const OUTPUT = resolve(process.argv[3] || 'E:\\Cogito\\frontend\\src\\data\\dictionary.ts');

// ---- 解析 Curriculum.md ----

const curriculumPath = resolve(DICT_DIR, 'internal', 'Curriculum.md');
if (!existsSync(curriculumPath)) {
  console.error(`[generate-dictionary] 未找到 Curriculum.md: ${curriculumPath}`);
  process.exit(1);
}

const curriculum = readFileSync(curriculumPath, 'utf-8');
const lines = curriculum.split('\n');

const sections = [];
let currentSection = null;

for (const line of lines) {
  const sectionMatch = line.match(/^## (Section \d+ — .+)/);
  if (sectionMatch) {
    currentSection = { section: sectionMatch[1], entries: [] };
    sections.push(currentSection);
    continue;
  }

  const entryMatch = line.match(/^- (.+?) \| (.+)/);
  if (entryMatch && currentSection) {
    currentSection.entries.push({
      key: entryMatch[1].trim(),
      label: entryMatch[2].trim(),
    });
  }
}

console.log(`[generate-dictionary] 解析到 ${sections.length} 个分组, ${sections.reduce((a, s) => a + s.entries.length, 0)} 个词条`);

// ---- 读取每个词条 Markdown ----

function parseFrontmatterAndBody(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  // 统一换行符为 \n
  const normalized = content.replace(/\r\n/g, '\n');
  // 提取 frontmatter
  const fmMatch = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!fmMatch) {
    return { description: '', body: normalized };
  }

  const fmText = fmMatch[1];
  const bodyRaw = fmMatch[2] || '';

  // 提取 description: 后面的值（直到行尾，忽略多行别名等）
  let description = '';
  for (const fmLine of fmText.split('\n')) {
    const descMatch = fmLine.match(/^description:\s*(.+?)\s*$/);
    if (descMatch) {
      description = descMatch[1].trim();
      break;
    }
  }

  // 清理正文
  let body = bodyRaw
    // 移除 [text](url) → text
    .replace(/\[([^\]]*?)\]\([^)]+\)/g, '$1')
    // 移除 **text** 或 *text* 或 _text_ → text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1');

  // 压缩多余空行（保留段落结构）
  body = body
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { description, body };
}

// ---- 提取中文匹配词 ----

/** 高频通用中文停用词：悬停弹解释会显得莫名其妙，仅过滤独立字段不伤复合词 */
const CHINESE_STOP_WORDS = new Set([
  '下一个', '预测', '输入', '输出', '缓存',
]);

function extractChineseTerms(label) {
  // 提取所有连续中文字段
  const chineseSegments = label.match(/[\u4e00-\u9fff]+/g) || [];
  // 过滤掉长度 < 2 的段 + 停用词
  return chineseSegments.filter((seg) => seg.length >= 2 && !CHINESE_STOP_WORDS.has(seg));
}

// ---- 构建输出数据 ----

const outputSections = [];

for (const section of sections) {
  const entries = [];

  for (const entryDef of section.entries) {
    const key = entryDef.key;
    // 文件名处理：key 可能包含空格或特殊字符
    // 特殊处理：AGENTS.md 的文件名是 AGENTS.md.md → key 是 AGENTS.md
    let fileName = key;
    // 如果 key 以 .md 结尾，文件名会是 key.md（因为遍历时 key 已经是 AGENTS.md）
    // 但文件系统上文件名是 AGENTS.md.md
    // 尝试两种：key + '.md' 和 key
    let filePath = resolve(DICT_DIR, 'dictionary', `${fileName}.md`);
    if (!existsSync(filePath)) {
      // 可能是 key 本身包含 .md 的情况
      filePath = resolve(DICT_DIR, 'dictionary', `${fileName}`);
      if (!existsSync(filePath)) {
        console.warn(`[generate-dictionary] 跳过缺失文件: ${key} (尝试 ${fileName}.md)`);
        continue;
      }
    }

    const { description, body } = parseFrontmatterAndBody(filePath);
    const label = entryDef.label;

    // 构建匹配词列表
    const terms = [key];
    const chineseTerms = extractChineseTerms(label);
    terms.push(...chineseTerms);

    // 去重（大小写不敏感）
    const seen = new Set();
    const uniqueTerms = terms.filter((t) => {
      const lower = t.toLowerCase();
      if (seen.has(lower)) return false;
      seen.add(lower);
      return true;
    });

    entries.push({
      key,
      label,
      terms: uniqueTerms,
      description,
      body,
    });
  }

  if (entries.length > 0) {
    outputSections.push({
      section: section.section,
      entries,
    });
  }
}

const totalEntries = outputSections.reduce((a, s) => a + s.entries.length, 0);
console.log(`[generate-dictionary] 生成 ${outputSections.length} 个分组, ${totalEntries} 个词条`);

// ---- 写入输出文件 ----

const output = `// ============================================================
// dictionary.ts —— AI 编码词典数据（由 scripts/generate-dictionary.mjs 生成）
// 请勿手动编辑！如需更新，重新运行：node scripts/generate-dictionary.mjs
// ============================================================

export interface DictionaryEntry {
  key: string;
  label: string;
  terms: string[];
  description: string;
  body: string;
}

export interface DictionarySection {
  section: string;
  entries: DictionaryEntry[];
}

export const DICTIONARY_SECTIONS: DictionarySection[] = ${JSON.stringify(outputSections, null, 2)};
`;

writeFileSync(OUTPUT, output, 'utf-8');
console.log(`[generate-dictionary] 写入 ${OUTPUT}`);