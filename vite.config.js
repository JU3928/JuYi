/**
 * JuYi — Vite 配置
 * ================
 * 开发时：Vite dev server 提供 ES module 的热更新
 * 生产时：保留零依赖，HTML 可双击直接打开（file:// 协议）
 *
 * 约定：
 * - 源码模块拆分放在 src/modules/<name>/
 * - 共享代码在 shared/（保持 global 脚本，各模块 <script> 引入）
 * - 生产环境各模块 index.html 直接使用 <script> 标签加载
 */

import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readdirSync, existsSync } from 'fs';

const projectRoot = resolve(__dirname);

// 自动发现模块中带有 dev 入口的 HTML 文件
function discoverModules() {
  const modulesDir = resolve(projectRoot, 'modules');
  if (!existsSync(modulesDir)) return {};
  const input = {};
  const dirs = readdirSync(modulesDir, { withFileTypes: true })
    .filter(d => d.isDirectory());
  for (const d of dirs) {
    const devHtml = resolve(modulesDir, d.name, 'index.html');
    if (existsSync(devHtml)) {
      input[d.name] = devHtml;
    }
  }
  return input;
}

export default defineConfig({
  root: projectRoot,

  // 开发服务器
  server: {
    port: 3000,
    open: false,
    // 直接代理到项目根目录，所有文件可访问
    fs: { allow: ['..'] },
  },

  // 生产构建：将所有模块 HTML 作为入口
  build: {
    outDir: 'dist',
    // base 设为相对路径，使 file:// 协议下也可用
    base: './',
    rollupOptions: {
      input: discoverModules(),
      output: {
        // 每个模块独立打包，不拆 chunk（兼容 file://）
        manualChunks: undefined,
        inlineDynamicImports: false,
      },
    },
    // 关闭 modulePreload，file:// 协议不需要
    modulePreload: false,
  },

  // 路径别名
  resolve: {
    alias: {
      '@shared': resolve(projectRoot, 'shared'),
      '@src': resolve(projectRoot, 'src'),
    },
  },
});
