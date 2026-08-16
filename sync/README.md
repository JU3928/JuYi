# ⛅ JuYi 云同步后端

JuYi 的「一个密钥互通所有设备」同步层——一个零依赖的 Cloudflare Worker + KV，与前端首页的「⛅ 云同步」面板配套。

## 为什么存在

JuYi 核心模块保持「双击即用、零框架、离线可用」；云同步是**可选基础设施**，解决多设备/换手机时的数据迁移问题。数据仍以现有 `JuYiSysBackup/1` JSON 格式在设备与云端之间传输，不引入任何账号体系。

## 一次性部署（约 5 分钟）

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
