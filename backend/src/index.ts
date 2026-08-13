// ============================================================
// 入口 —— 启动 Express 服务器
// 仅当直接执行时监听端口；被 import（如 supertest 测试）时不监听
// ============================================================

import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { app, DATA_DIR } from './app.js';
import { registerGracefulShutdown } from './services/storage.js';

// 当直接执行时启动监听（tsx 下 process.argv[1] 为 .ts 路径）
const isDirectRun = import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const PORT = parseInt(process.env.PORT || '3001', 10);
  const server = app.listen(PORT, () => {
    // 随机端口(0)时输出实际监听端口，供 Electron 主进程解析
    const addr = server.address();
    const actualPort = typeof addr === 'object' && addr ? addr.port : PORT;
    console.log(`[backend] PORT=${actualPort}`);
    console.log(`[backend] data dir: ${DATA_DIR}`);
  });

  // 注册优雅关闭：tsx watch 热重启时等待写队列完成
  registerGracefulShutdown();
}

export default app;