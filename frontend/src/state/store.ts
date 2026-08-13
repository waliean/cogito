// ============================================================
// Zustand 鐘舵€佺鐞?鈥斺€?鎸?design.md 4.1 鍒掑垎
// M1锛歸orkspace + card + ui锛汳2锛歴ettings + card.generate
// ============================================================

import { create } from 'zustand';
import type {
  Workspace,
  Card,
  CardTreeNode,
  ViewMode,
  PublicSettings,
  DocumentRecord,
  SavedTerm,
  Suggestion,
  GenerateTreeResult,
} from '@cogito/shared';
import * as workspaceApi from '../api/workspaces.js';
import * as cardApi from '../api/cards.js';
import * as settingsApi from '../api/settings.js';
import * as documentApi from '../api/documents.js';
import * as termApi from '../api/terms.js';
import type { CreateCardInput, UpdateCardInput } from '../api/cards.js';
import type { SettingsPatch } from '../api/settings.js';
import { describeError } from '../utils/errorMessages.js';

// ---- 宸ュ叿 ----

function flattenTree(nodes: CardTreeNode[]): Card[] {
  const cards: Card[] = [];
  const walk = (list: CardTreeNode[]) => {
    for (const n of list) {
      const { children, ...card } = n;
      cards.push(card);
      walk(children);
    }
  };
  walk(nodes);
  return cards;
}

// ============================================================
// useWorkspaceStore
// ============================================================

interface WorkspaceState {
  workspaces: Workspace[];
  currentId: string | null;
  loading: boolean;
  error: string | null;
  scanResult: { found: number; imported: number; skipped: number } | null;
  load: () => Promise<void>;
  create: (name: string, description?: string, folderPath?: string) => Promise<Workspace>;
  remove: (id: string) => Promise<void>;
  setCurrent: (id: string | null) => void;
  scanFolder: (id: string, folderPath: string) => Promise<void>;
  clearScanResult: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  workspaces: [],
  currentId: null,
  loading: false,
  error: null,
  scanResult: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const workspaces = await workspaceApi.listWorkspaces();
      set({ workspaces, loading: false });
    } catch (e: any) {
      set({ error: describeError(e), loading: false });
    }
  },

create: async (name, description, folderPath) => {
    set({ loading: true, error: null });
    try {
      const ws = await workspaceApi.createWorkspace(name, description, folderPath);
      set((s) => ({ workspaces: [...s.workspaces, ws], loading: false }));
      return ws;
    } catch (e: any) {
      set({ error: describeError(e), loading: false });
      throw e;
    }
  },

  remove: async (id) => {
    set({ loading: true, error: null });
    try {
      await workspaceApi.removeWorkspace(id);
      set((s) => ({
        workspaces: s.workspaces.filter((w) => w.id !== id),
        currentId: s.currentId === id ? null : s.currentId,
        loading: false,
      }));
    } catch (e: any) {
      set({ error: describeError(e), loading: false });
    }
  },

  setCurrent: (id) => set({ currentId: id }),

  scanFolder: async (id, folderPath) => {
    set({ loading: true, error: null });
    try {
      const result = await workspaceApi.scanWorkspaceFolder(id, folderPath);
      set({ scanResult: result, loading: false });
    } catch (e: any) {
      set({ error: describeError(e), loading: false });
    }
  },

  clearScanResult: () => set({ scanResult: null }),
}));

// ============================================================
// useCardStore
// ============================================================

interface CardState {
  cards: Card[];
  tree: CardTreeNode[];
  selectedId: string | null;
  generatingId: string | null;
  loading: boolean;
  error: string | null;
  loadCards: (wid: string) => Promise<void>;
  select: (id: string | null) => void;
  createCard: (input: CreateCardInput & { wid: string }) => Promise<Card>;
  updateCard: (id: string, patch: UpdateCardInput) => Promise<Card>;
  removeCard: (id: string) => Promise<void>;
  generate: (id: string, mode: 'child' | 'divergent' | 'branch', instruction?: string) => Promise<Card>;
  clearError: () => void;
// selectors
  byId: (id: string) => Card | undefined;
  childrenOf: (id: string) => Card[];
  rootCards: () => Card[];
  // branch suggestions + generate tree
  suggestionsByCardId: Record<string, Suggestion[]>;
  suggestionsLoadingId: string | null;
  suggestionsError: string | null;
  generateTreeRunning: boolean;
  fetchSuggestions: (id: string) => Promise<void>;
  adoptSuggestion: (id: string, s: Suggestion) => Promise<void>;
  generateTree: (depth: number, branchesPerNode: number) => Promise<GenerateTreeResult>;
  clearSuggestions: () => void;
}

async function reloadCards(wid: string) {
  const tree = (await cardApi.listCards(wid, true)) as CardTreeNode[];
  return { cards: flattenTree(tree), tree };
}

export const useCardStore = create<CardState>((set, get) => ({
  cards: [],
  tree: [],
  selectedId: null,
  generatingId: null,
  loading: false,
  error: null,

  loadCards: async (wid) => {
    set({ loading: true, error: null });
    try {
      const data = await reloadCards(wid);
      set({ ...data, loading: false });
    } catch (e: any) {
      set({ error: describeError(e), loading: false });
    }
  },

  select: (id) => set({ selectedId: id }),

  createCard: async (input) => {
    set({ loading: true, error: null });
    try {
      const card = await cardApi.createCard(input.wid, {
        parentId: input.parentId,
        type: input.type,
        title: input.title,
        content: input.content,
        terms: input.terms,
      });
      const data = await reloadCards(input.wid);
      set({ ...data, loading: false });
      return card;
    } catch (e: any) {
      set({ error: describeError(e), loading: false });
      throw e;
    }
  },

  updateCard: async (id, patch) => {
    set({ loading: true, error: null });
    try {
      const card = await cardApi.updateCard(id, patch);
      set((s) => ({
        cards: s.cards.map((c) => (c.id === id ? { ...c, ...card } : c)),
        loading: false,
      }));
      const currentWs = useWorkspaceStore.getState().currentId;
      if (currentWs) {
        const data = await reloadCards(currentWs);
        set({ ...data });
      }
      return card;
    } catch (e: any) {
      set({ error: describeError(e), loading: false });
      throw e;
    }
  },

  removeCard: async (id) => {
    set({ loading: true, error: null });
    try {
      await cardApi.removeCard(id);
      const currentWs = useWorkspaceStore.getState().currentId;
      if (currentWs) {
        const data = await reloadCards(currentWs);
        set({
          ...data,
          selectedId: get().selectedId === id ? null : get().selectedId,
          loading: false,
        });
      } else {
        set({ loading: false });
      }
    } catch (e: any) {
      set({ error: describeError(e), loading: false });
    }
  },

  generate: async (id, mode, instruction) => {
    const currentWs = useWorkspaceStore.getState().currentId;
    set({ generatingId: id, error: null });
    // 涔愯锛氱埗鍗＄疆 processing
    set((s) => ({
      cards: s.cards.map((c) => (c.id === id ? { ...c, status: 'processing' } : c)),
    }));
    try {
      const card = await cardApi.generateCard(id, mode, instruction);
      if (currentWs) {
        const data = await reloadCards(currentWs);
        set({ ...data, generatingId: null });
      }
      return card;
    } catch (e: any) {
      set({ error: describeError(e), generatingId: null });
      // 澶辫触鍒锋柊锛堢埗鍗?failed锛屾潵鑷敊璇搷搴旀垨鏈嶅姟绔姸鎬侊級
      if (currentWs) {
        try {
          const data = await reloadCards(currentWs);
          set({ ...data });
        } catch {
          // 蹇界暐鍒锋柊澶辫触
        }
      }
      throw e;
    }
  },

  clearError: () => set({ error: null }),

  byId: (id) => get().cards.find((c) => c.id === id),
  childrenOf: (id) => get().cards.filter((c) => c.parentId === id),
rootCards: () => get().cards.filter((c) => c.parentId === null),

  suggestionsByCardId: {},
  suggestionsLoadingId: null,
  suggestionsError: null,
  generateTreeRunning: false,

  fetchSuggestions: async (id) => {
    set({ suggestionsLoadingId: id, suggestionsError: null });
    try {
      const r = await cardApi.getCardSuggestions(id);
      set((s) => ({
        suggestionsByCardId: { ...s.suggestionsByCardId, [id]: r.suggestions },
        suggestionsLoadingId: null,
      }));
    } catch (e: any) {
      set({ suggestionsError: describeError(e), suggestionsLoadingId: null });
    }
  },

  adoptSuggestion: async (id, s) => {
    await get().generate(id, s.type, `${s.title}。${s.reason}`);
  },

  generateTree: async (depth, branchesPerNode) => {
    const currentWs = useWorkspaceStore.getState().currentId;
    if (!currentWs) throw new Error('No workspace selected');
    set({ generateTreeRunning: true, error: null });
    try {
      const result = await cardApi.generateTree(currentWs, { depth, branchesPerNode });
      const data = await reloadCards(currentWs);
      set({ ...data, generateTreeRunning: false });
      return result;
    } catch (e: any) {
      set({ generateTreeRunning: false, error: describeError(e) });
      throw e;
    }
  },

  clearSuggestions: () => set({ suggestionsByCardId: {}, suggestionsError: null }),
}));

// ============================================================
// useSettingsStore
// ============================================================

interface SettingsState {
  settings: PublicSettings | null;
  testing: boolean;
  lastTest: { latencyMs: number; model: string } | null;
  error: string | null;
  load: () => Promise<void>;
  save: (patch: SettingsPatch) => Promise<void>;
  test: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  testing: false,
  lastTest: null,
  error: null,

  load: async () => {
    try {
      const settings = await settingsApi.getSettings();
      set({ settings, error: null });
    } catch (e: any) {
      set({ error: describeError(e) });
    }
  },

  save: async (patch) => {
    set({ error: null });
    try {
      const settings = await settingsApi.updateSettings(patch);
      set({ settings });
    } catch (e: any) {
      set({ error: describeError(e) });
      throw e;
    }
  },

  test: async () => {
    set({ testing: true, error: null, lastTest: null });
    try {
      const res = await settingsApi.testSettings();
      set({ testing: false, lastTest: { latencyMs: res.latencyMs, model: res.model } });
    } catch (e: any) {
      set({ testing: false, error: describeError(e) });
      throw e;
    }
  },
}));

// ============================================================
// useDocumentStore
// ============================================================

interface DocumentState {
  documents: DocumentRecord[];
  uploading: boolean;
  pollingId: string | null;
  error: string | null;
  list: (wid: string) => Promise<void>;
  upload: (wid: string, file: File) => Promise<DocumentRecord>;
  refreshDocument: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  retry: (id: string) => Promise<void>;
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  documents: [],
  uploading: false,
  pollingId: null,
  error: null,

  list: async (wid) => {
    try {
      const documents = await documentApi.listDocuments(wid);
      set({ documents, error: null });
    } catch (e: any) {
      set({ error: describeError(e) });
    }
  },

  upload: async (wid, file) => {
    set({ uploading: true, error: null });
    try {
      const doc = await documentApi.uploadDocument(wid, file);
      set((s) => ({
        documents: [...s.documents.filter((d) => d.id !== doc.id), doc],
        uploading: false,
        pollingId: doc.id,
      }));
      return doc;
    } catch (e: any) {
      set({ uploading: false, error: describeError(e) });
      throw e;
    }
  },

  refreshDocument: async (id) => {
    try {
      const doc = await documentApi.getDocument(id);
      set((s) => ({
        documents: s.documents.map((d) => (d.id === id ? doc : d)),
      }));
      // 瀹屾垚鍚庡仠姝㈣疆璇紱鎽樿瀹屾垚鑷姩鍒锋柊鍗＄墖
      if (doc.status === 'done' || doc.status === 'failed') {
        set({ pollingId: null });
        if (doc.status === 'done') {
          const wid = useWorkspaceStore.getState().currentId;
          if (wid) {
            await useCardStore.getState().loadCards(wid);
          }
        }
      }
    } catch {
      set({ pollingId: null });
    }
  },

  remove: async (id) => {
    try {
      await documentApi.removeDocument(id);
      set((s) => ({ documents: s.documents.filter((d) => d.id !== id) }));
    } catch (e: any) {
      set({ error: describeError(e) });
    }
  },

  retry: async (id) => {
    try {
      const doc = await documentApi.retryDocument(id);
      set((s) => ({
        documents: s.documents.map((d) => (d.id === id ? doc : d)),
        pollingId: id,
      }));
    } catch (e: any) {
      set({ error: describeError(e) });
    }
  },
}));

// ============================================================
// useTermStore —— 已保存术语管理
// ============================================================

interface TermState {
  savedTerms: SavedTerm[];
  loading: boolean;
  error: string | null;
  load: (workspaceId?: string, keyword?: string) => Promise<void>;
  save: (data: {
    term: string;
    definition: string;
    workspaceId: string;
    sourceCardId?: string;
    sourceCardTitle?: string;
  }) => Promise<void>;
  saveBatch: (
    terms: { term: string; definition?: string; sourceCardId?: string; sourceCardTitle?: string }[],
    workspaceId: string,
  ) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useTermStore = create<TermState>((set) => ({
  savedTerms: [],
  loading: false,
  error: null,

  load: async (workspaceId, keyword) => {
    set({ loading: true, error: null });
    try {
      const terms = await termApi.fetchTerms(workspaceId, keyword);
      set({ savedTerms: terms, loading: false });
    } catch (e: any) {
      set({ error: describeError(e), loading: false });
    }
  },

  save: async (data) => {
    try {
      const saved = await termApi.saveTerm(data);
      set((s) => ({ savedTerms: [saved, ...s.savedTerms] }));
    } catch (e: any) {
      set({ error: describeError(e) });
    }
  },

  saveBatch: async (terms, workspaceId) => {
    try {
      const result = await termApi.saveTermsBatch(terms, workspaceId);
      set((s) => ({ savedTerms: [...result.terms, ...s.savedTerms] }));
    } catch (e: any) {
      set({ error: describeError(e) });
    }
  },

  remove: async (id) => {
    try {
      await termApi.deleteTerm(id);
      set((s) => ({ savedTerms: s.savedTerms.filter((t) => t.id !== id) }));
    } catch (e: any) {
      set({ error: describeError(e) });
    }
  },
}));

// ============================================================
// useUIStore
// ============================================================

interface UIState {
  view: ViewMode;
  activeTerm: string | null;
  search: string;
  settingsOpen: boolean;
  /** null = 收起，'file' = 文件面板，'doc' = 文档面板 */
  sidebarPanel: 'file' | 'doc' | null;
  /** 右侧编辑栏是否打开（选中卡片时默认打开，可手动关闭避免遮挡） */
  viewSidebarOpen: boolean;
  setView: (v: ViewMode) => void;
  setActiveTerm: (t: string | null) => void;
  setSearch: (q: string) => void;
  setSettingsOpen: (open: boolean) => void;
  toggleSidebarPanel: (panel: 'file' | 'doc') => void;
  setViewSidebarOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  view: 'cards',
  activeTerm: null,
  search: '',
  settingsOpen: false,
  sidebarPanel: null,
  viewSidebarOpen: true,
  setView: (v) => set({ view: v }),
  setActiveTerm: (t) => set({ activeTerm: t }),
  setSearch: (q) => set({ search: q }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  toggleSidebarPanel: (panel) =>
    set((s) => ({ sidebarPanel: s.sidebarPanel === panel ? null : panel })),
  setViewSidebarOpen: (open) => set({ viewSidebarOpen: open }),
}));

