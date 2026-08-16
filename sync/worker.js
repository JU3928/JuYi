/**
 * JuYi 云同步 Worker（Cloudflare Workers + KV）
 * =============================================
 * 为 JuYi 提供「一个密钥互通所有设备」的同步端点。
 *
 * 接口：
 *   GET /api/sync        → 返回 KV 中存储的备份 JSON（不存在返回 404）
 *   PUT /api/sync        → 覆盖写入备份 JSON（Body ≤ 20MB）
 *   OPTIONS              → CORS 预检
 *
 * 鉴权：请求头 X-Sync-Key 必须等于 Worker 的 SYNC_KEY 密钥（wrangler secret）。
 *
 * 部署（一次性）：
 *   1. npm i -g wrangler && npx wrangler login
 *   2. npx wrangler kv namespace create JUYI_SYNC   # 把返回的 id 填进 wrangler.toml
 *   3. npx wrangler secret put SYNC_KEY             # 设置同步密钥（与首页配置一致）
 *   4. npx wrangler deploy                          # 得到 https://juyi-sync.<你的子域>.workers.dev
 *
 * 零依赖：只使用 Web 平台 API，无 npm 包。
 */

const KV_KEY = 'backup.json';
const MAX_BYTES = 20 * 1024 * 1024; // 20MB
const AUTH_HEADER = 'x-sync-key';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': `${AUTH_HEADER}, content-type`,
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/sync') {
      return new Response('not found', { status: 404, headers: CORS });
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // 鉴权：API Key 必须匹配
    const key = (request.headers.get(AUTH_HEADER) || '').trim();
    if (!env.SYNC_KEY || key !== env.SYNC_KEY) {
      return new Response('unauthorized', { status: 401, headers: CORS });
    }

    if (request.method === 'GET') {
      const data = await env.JUYI_SYNC.get(KV_KEY);
      if (!data) return new Response('no backup yet', { status: 404, headers: CORS });
      return new Response(data, {
        status: 200,
        headers: { 'content-type': 'application/json', ...CORS },
      });
    }

    if (request.method === 'PUT') {
      const body = await request.text();
      if (body.length > MAX_BYTES) {
        return new Response('too large', { status: 413, headers: CORS });
      }
      await env.JUYI_SYNC.put(KV_KEY, body);
      return new Response(JSON.stringify({ ok: true, bytes: body.length, savedAt: new Date().toISOString() }), {
        status: 200,
        headers: { 'content-type': 'application/json', ...CORS },
      });
    }

    return new Response('method not allowed', { status: 405, headers: CORS });
  },
};
