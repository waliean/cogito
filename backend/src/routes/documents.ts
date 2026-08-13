// ============================================================
// 文档路由 —— /api/workspaces/:wsId/documents 与 /api/documents/:id
// ============================================================

import { Router } from 'express';
import {
  upload,
  createDocument,
  getWorkspaceDocuments,
  getDocument,
  deleteDocument,
  processDocument,
} from '../services/documentService.js';
import { appError } from '../services/cardService.js';
import { mutate } from '../services/storage.js';
import { ErrorCode } from '@cogito/shared';

const router = Router();

// POST /api/workspaces/:wsId/documents —— multipart（字段名 file）-> 202 异步
router.post('/workspaces/:wsId/documents', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      throw appError(ErrorCode.VALIDATION, 'No file uploaded (field name: "file")');
    }
    const wsId = String(req.params.wsId);
    const document = await createDocument(wsId, req.file);
    res.status(202).json({ document });
  } catch (err) {
    next(err);
  }
});

// GET /api/workspaces/:wsId/documents
router.get('/workspaces/:wsId/documents', (req, res, next) => {
  try {
    const documents = getWorkspaceDocuments(req.params.wsId);
    res.json({ documents });
  } catch (err) {
    next(err);
  }
});

// GET /api/documents/:id（前端轮询至 done/failed）
router.get('/documents/:id', (req, res, next) => {
  try {
    const document = getDocument(req.params.id);
    if (!document) {
      res.status(404).json({
        error: { code: 'E_NOT_FOUND', message: `Document ${req.params.id} not found` },
      });
      return;
    }
    res.json({ document });
  } catch (err) {
    next(err);
  }
});

// POST /api/documents/:id/retry —— 失败后重新入队（P2 重试）
router.post('/documents/:id/retry', async (req, res, next) => {
  try {
    const document = getDocument(req.params.id);
    if (!document) {
      throw appError(ErrorCode.NOT_FOUND, `Document ${req.params.id} not found`);
    }
    if (document.status === 'processing') {
      throw appError(ErrorCode.CONFLICT, `Document ${req.params.id} is already processing`);
    }
    await mutateDocumentStatus(req.params.id, 'processing', undefined);
    void processDocument(req.params.id);
    res.json({ document: getDocument(req.params.id) });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/documents/:id
router.delete('/documents/:id', async (req, res, next) => {
  try {
    await deleteDocument(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// 局部辅助：直接改状态（retry 用）
async function mutateDocumentStatus(
  id: string,
  status: 'processing',
  error: string | undefined,
): Promise<void> {
  await mutate((db) => {
    const d = db.documents.find((x) => x.id === id);
    if (d) {
      d.status = status;
      d.error = error;
      d.updatedAt = new Date().toISOString();
    }
  });
}

export default router;
