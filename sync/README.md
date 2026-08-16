# ⛅ JuYi 云同步

JuYi 的「一个密钥互通所有设备」同步层。首页「⛅ 云同步」面板支持两种后端：

| 模式 | 需要什么 | 适用场景 |
|---|---|---|
| **GitHub 私有 Gist（默认推荐）** | 已有 GitHub 账号即可，无需任何服务器 | 绝大多数用户 |
| Cloudflare Worker + KV（本目录代码） | 一个 Cloudflare 免费账号 | 想自建、或备份超过 Gist 10MB 单文件上限时 |

## 方式一：GitHub 私有 Gist（零部署，推荐）

1. 到 GitHub → Settings → Developer settings → **Fine-grained personal access tokens**（或 classic token），新建一个**只勾选 Gist 权限**的 Token（务必只勾 gist）。
2. 打开 JuYi 首页 → 「⛅ 云同步」→ 粘入 Token → 点「✨ 一键创建云端文件」（会自动创建一个**私有** Gist 并保存 Gist ID）。
3. 点「⬆️ 推送到云端」；换设备后粘同一个 Token + Gist ID 点「⬇️ 从云端拉取」。

原理：页面直接调用 `api.github.com/gists`（GitHub 官方支持浏览器 CORS），读写一个私有 Gist 里的 `juyi-backup.json`。**没有中间服务器、没有新账号。**

限制与注意：

- Gist 单文件上限约 10MB：备份超限时先做图片降采样/增量导出。
- Token 只存本机 localStorage（`jy_sync_gist_token`），已加入备份黑名单，不会随备份导出；泄露后到 GitHub 后台吊销即可。
- Gist 为私有（`public: false`），不会出现在你的公开仓库里。

## 方式二：Cloudflare Worker + KV（自建，本目录）

```bash
# 0. 安装 wrangler（开发机工具，与产品零依赖原则无关）
npm i -g wrangler

# 1. 登录 Cloudflare（需要你的 Cloudflare 账号，免费套餐即可）
npx wrangler login

# 2. 创建 KV 命名空间，把输出的 id 填进 wrangler.toml
npx wrangler kv namespace create JUYI_SYNC

# 3. 设置同步密钥（与首页「云同步」面板里填的密钥一致）
npx wrangler secret put SYNC_KEY

# 4. 部署
npx wrangler deploy
# 输出形如 https://juyi-sync.<你的子域>.workers.dev 的地址，即首页要填的「Worker 地址」
```

## 接口

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| `GET` | `/api/sync` | `X-Sync-Key` 头 | 拉取云端备份 JSON；无数据返回 404 |
| `PUT` | `/api/sync` | `X-Sync-Key` 头 | 上传备份 JSON（≤ 20MB，覆盖写入） |
| `OPTIONS` | `/api/sync` | 无 | CORS 预检 |

## 安全说明

- 密钥存在 Worker 的 secret 里，不进仓库；首页把密钥存在 localStorage（`jy_sync_key`），**已加入系统备份黑名单**，导出备份不会带出。
- `Access-Control-Allow-Origin: *` 是刻意为之（方便任意设备浏览器直连），真正的门禁是密钥本身——请使用足够长的随机串，泄露后在 Cloudflare 后台轮换即可。
- KV 默认不支持覆盖前自动备份；如需版本历史，可在 Worker 里按日期存多个 key（后续可按需扩展）。
