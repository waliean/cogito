// ============================================================
// @cogito/shared — 前后端共享类型与常量
// 以 docs/design.md 第 2 节为权威来源
// ============================================================

// ---- 卡片 ----

export type CardType = 'child' | 'divergent' | 'branch';
export type CardStatus = 'draft' | 'processing' | 'done' | 'failed';
export type GenerationMode = CardType;

export interface TermHighlight {
  term: string;
  definition?: string;
  /** 词典来源词条 key，存在时渲染为词典样式而非 mark 高亮 */
  dictKey?: string;
}

export interface AiMeta {
  model: string;
  mode?: GenerationMode;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  error?: string;
  /** 错误详情（与 error 码对应的详细消息，仅失败时存在） */
  errorMessage?: string;
  retried?: boolean;
}

export interface Card {
  id: string;
  workspaceId: string;
  type: CardType;
  title: string;
  content: string;               // Markdown
  terms: TermHighlight[];        // 默认 []
  parentId: string | null;
  status: CardStatus;
  sourceDocumentId?: string;
  aiMeta?: AiMeta;
  createdAt: string;             // ISO 8601
  updatedAt: string;
}

export interface CardTreeNode extends Card {
  children: CardTreeNode[];
}

// ---- 工作区 ----

export interface Workspace {
  id: string;
  name: string;
  description?: string;
  /** 关联的本地文件夹路径（可选）——扫描导入该文件夹中的文档 */
  folderPath?: string;
  createdAt: string;
  updatedAt: string;
}

// ---- 文档 ----

export type DocumentStatus = 'processing' | 'done' | 'failed';

export interface DocumentRecord {
  id: string;
  workspaceId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  status: DocumentStatus;
  title?: string;
  summary?: string;
  terms?: TermHighlight[];
  error?: string;
  aiMeta?: AiMeta;
  createdAt: string;
  updatedAt: string;
}

// ---- 设置 ----

export interface PublicSettings {
  hasApiKey: boolean;
  baseUrl: string;
  model: string;
  temperature: number;
  timeoutMs: number;
  dictTermStyle: TermDictStyle;
}

export interface Settings extends PublicSettings {
  apiKey?: string;
}

// ---- 视图 ----

export type ViewMode = 'cards' | 'mindscape' | 'glossary' | 'dictionary';

export type TermDictStyle = 'italic' | 'bold' | 'underline';

// ---- 已保存术语 ----

export interface SavedTerm {
  id: string;
  term: string;
  definition: string;
  workspaceId: string;
  /** 来源卡片 ID（可选） */
  sourceCardId?: string;
  /** 来源卡片标题（可选，用于显示） */
  sourceCardTitle?: string;
  savedAt: string;
}

// ---- API 错误 ----

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    detail?: unknown;
  };
}

// ---- 错误码 ----

export const ErrorCode = {
  NOT_FOUND: 'E_NOT_FOUND',
  VALIDATION: 'E_VALIDATION',
  CONFLICT: 'E_CONFLICT',
  INTERNAL: 'E_INTERNAL',
  CARD_BUSY: 'E_CARD_BUSY',
  NO_API_KEY: 'E_NO_API_KEY',
  INVALID_API_KEY: 'E_INVALID_API_KEY',
  FILE_TOO_LARGE: 'E_FILE_TOO_LARGE',
  UNSUPPORTED_TYPE: 'E_UNSUPPORTED_TYPE',
  PDF_NO_TEXT: 'E_PDF_NO_TEXT',
  TXT_DECODE: 'E_TXT_DECODE',
  AI_RATE_LIMIT: 'E_AI_RATE_LIMIT',
  AI_ERROR: 'E_AI_ERROR',
  AI_TIMEOUT: 'E_AI_TIMEOUT',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

// ---- 导图 AI 扩展 ----

/** 分支建议（type 为生成模式 child/divergent/branch） */
export interface Suggestion {
  type: CardType;
  title: string;
  reason: string;
}

export interface GenerateSuggestionsResult {
  suggestions: Suggestion[];
  meta: AiMeta;
}

export interface GenerateTreeOptions {
  depth: number;
  branchesPerNode: number;
}

export interface GenerateTreeFailure {
  parentId: string;
  parentTitle: string;
  code: string;
  message: string;
}

export interface GenerateTreeResult {
  rootsProcessed: number;
  created: number;
  skipped: number;
  truncated: boolean;
  totalCards: number;
  failures: GenerateTreeFailure[];
  meta: AiMeta;
}