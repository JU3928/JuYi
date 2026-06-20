# JuYi

前端 + Node.js + MySQL 学习工具箱，每个模块可独立运行。

## 项目结构

```
JuYi/
├── README.md
├── index.html                     # 项目首页
├── shared/                        # 共享层
│   ├── base.css
│   └── db-core.js                 # IndexedDB 封装（离线备用）
├── server/                        # 后端
│   ├── package.json
│   ├── config.js                  # 数据库 & 服务器配置
│   ├── db.js                      # MySQL 连接池
│   ├── server.js                  # Express 入口 (含静态文件服务)
│   ├── test.js                    # 全功能测试脚本
│   ├── routes/
│   │   └── errorNotes.js          # 错题本 API
│   └── sql/
│       └── init.sql               # 建库建表 SQL
└── modules/
    └── error-notebook/            # 错题本前端
        ├── index.html
        ├── styles.css
        └── app.js
```

## 运行步骤

### 1) 初始化数据库

打开 Navicat 或任意 MySQL 客户端，执行：

```
server/sql/init.sql
```

或命令行：

```bash
mysql -u root -p123456 < server/sql/init.sql
```

这会创建 `juyi` 库和 `error_notes` 表。

### 2) 启动服务器

```bash
cd server
npm install
npm start
```

看到 `JuYi server running at http://localhost:3000` 即成功。

### 3) 打开前端

浏览器访问：

```
http://localhost:3000/modules/error-notebook/
```

或首页：`http://localhost:3000/`

> 不要直接双击打开 HTML 文件，走服务器才能正常加载 CSS/JS 并连接 MySQL。

## MySQL 配置

| 项 | 值 |
|----|-----|
| Host | localhost |
| Port | 3306 |
| User | root |
| Password | 123456 |
| Database | juyi |

修改配置：编辑 `server/config.js`。

## API 端点

| Method | Path | 说明 |
|--------|------|------|
| GET | /api/errors | 列表（支持 ?subject=&difficulty=&tag=&search=&sortBy=&sortOrder=） |
| GET | /api/errors/:id | 详情 |
| POST | /api/errors | 新增 |
| PUT | /api/errors/:id | 更新 |
| DELETE | /api/errors/:id | 删除 |
| POST | /api/errors/:id/review | 标记已复习 |
| GET | /api/errors/export | 导出 |
| POST | /api/errors/import | 导入 |

## 模块

| 模块 | 亮点 |
|------|------|
| 📒 错题本 | 富文本截图粘贴、普通/难题分类、断点续复习 |
| 🏃 健身 | 体重 Canvas 曲线图、运动强度统计、标签筛选 |
| 💰 记账 | 收支记录、分类饼图、月度切换、标签管理 |
| 📔 日记 | 🔮 日期索引、情绪标签 |

双击任意 `modules/xxx/index.html` 独立运行，或通过首页导航。

## 技术栈

- Canvas 绘图（图表不依赖外部库）
- IndexedDB（数据完全本地）
- 暗色模式（CSS 变量 + JS 图表自适应）
- 标签系统（跨模块统一，支持 JSON 导出导入）

## 测试

```bash
cd server
node test.js
```

覆盖 58 项测试：CRUD、筛选、搜索、排序、导入导出、静态文件。

## License

MIT