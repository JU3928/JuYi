/**
 * 做题本 — Vite 开发入口
 * ======================
 * 由 Vite dev server 加载，支持热更新。
 * 生产环境使用 modules/question-book/app.js（IIFE 打包版本）。
 */

import { QuestionBookApp } from './state.js';

document.addEventListener('DOMContentLoaded', () => {
  const app = new QuestionBookApp();
  app.init().catch(err => {
    console.error('做题本初始化失败', err);
    alert('做题本初始化失败，请刷新重试');
  });
  window._questionBookApp = app;
});
