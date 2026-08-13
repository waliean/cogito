// ============================================================
// 桌面版构建脚本 —— 编译三包后调用 electron-builder 打 Windows 安装包
// 用法: npm run dist:win
// ============================================================

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

function run(cmd) {
  console.log(`\n>> ${cmd}`);
  execSync(cmd, { cwd: root, stdio: 'inherit', env: process.env });
}

// 1. 编译 shared + backend + frontend
run('npm run build');

// 2. 检查产物
const needed = [
  'backend/dist/index.js',
  'frontend/dist/index.html',
  'shared/dist/index.js',
  'electron/main.cjs',
];
for (const p of needed) {
  if (!existsSync(resolve(root, p))) {
    console.error(`[build-desktop] 缺少产物: ${p}`);
    process.exit(1);
  }
}

// 3. electron-builder（国内网络自动走镜像）
const env = {
  ...process.env,
  ELECTRON_MIRROR: process.env.ELECTRON_MIRROR || 'https://npmmirror.com/mirrors/electron/',
  ELECTRON_BUILDER_BINARIES_MIRROR:
    process.env.ELECTRON_BUILDER_BINARIES_MIRROR ||
    'https://npmmirror.com/mirrors/electron-builder-binaries/',
};

console.log('\n[build-desktop] 开始打包 Windows 安装包...');
execSync('npx electron-builder --win nsis', { cwd: root, stdio: 'inherit', env });

console.log('\n[build-desktop] 完成，产物在 release/ 目录');
