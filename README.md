# JuYi

纯前端个人工具箱，每个模块可独立运行。

## 项目结构

```
JuYi/
├── README.md
├── index.html                     # 项目首页
├── shared/                        # 共享层
│   ├── base.css                   #   CSS 令牌 + 通用组件
│   └── db-core.js                 #   IndexedDB 封装
└── modules/
    ├── error-notebook/            # 错题本
    │   ├── index.html
    │   ├── styles.css
    │   ├── app.js
    │   └── README.md
    ├── fitness/                   # 健身
    │   ├── index.html
    │   ├── styles.css
    │   ├── app.js
    │   └── test.html
    └── accounting/                # 记账
        ├── index.html
        ├── styles.css
        ├── app.js
        └── test.html
```

## 运行方式

双击任意 `modules/xxx/index.html` 即可运行，或通过首页 `index.html` 导航。

线上地址：`https://ju3928.github.io/JuYi/`

> 数据存储在浏览器 IndexedDB 中，完全本地。更换设备/域名需导出导入迁移。

## 模块

| 模块 | 亮点 |
|------|------|
| 📒 错题本 | 富文本截图粘贴、普通/难题分类、断点续复习 |
| 🏃 健身 | 体重 Canvas 曲线图、运动强度统计、标签筛选 |
| 💰 记账 | 收支记录、分类饼图、月度切换、标签管理 |

每个模块独立运行，互不干扰，各自有独立的 IndexedDB 数据库。

## 技术栈

- Canvas 绘图（图表不依赖外部库）
- IndexedDB（数据完全本地）
- 暗色模式（CSS 变量 + JS 图表自适应）
- 标签系统（跨模块统一，支持 JSON 导出导入）

## 测试

浏览器打开 `modules/fitness/test.html` 或 `modules/accounting/test.html`，点按钮即可跑测试。

## License

MIT