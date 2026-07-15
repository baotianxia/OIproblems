# TODO列表

一个基于 Electron + React + Ant Design + SQLite 的本地 TODO 列表管理系统，支持树形目录、题单/Part/题目 CRUD、Markdown 导入导出、批量导入、全局搜索、完成状态切换、暗黑主题、统计信息。

## 功能

- **树形目录** — 文件夹无限嵌套，题单/Part 层级清晰，右键菜单操作
- **CRUD** — 文件夹、题单、Part、题目的创建/重命名/删除/复制
- **导入导出** — Markdown 文件/文本导入（支持 `#`/`##`/`###` 层级解析），完整导出为 Markdown
- **批量导入** — 纯文本列表导入，自动清理行首符号
- **全局搜索** — 搜索文件夹/题单/Part/题目，点击跳转
- **完成状态** — Checkbox 切换，完成率统计
- **拖拽排序** — 题目上下移动排序
- **暗黑主题** — 一键切换，偏好持久化
- **统计信息** — 全局/文件夹/题单/Part 各级完成率
- **描述备注** — 文件夹和题单可添加描述文本，支持复制

## 技术栈

- **框架**: Electron 33 + React 18
- **构建**: electron-vite
- **UI**: Ant Design 5
- **数据库**: better-sqlite3 (SQLite)
- **语言**: TypeScript

## 开发

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 构建
npm run build

# 打包分发
npm run pack
```

## 打包产物

运行 `npm run pack` 后产出在 `release/` 目录：

| 文件/目录 | 说明 |
|---|---|
| `win-unpacked/` | 便携版目录，解压即用 |
| `TODO列表 Setup 1.0.0.exe` | NSIS 安装包 |

## 项目结构

```
src/
├── main/          # Electron 主进程 (数据库/IPC)
├── preload/       # preload 脚本 (contextBridge)
└── renderer/      # React 渲染进程
    ├── components/  # UI 组件
    ├── context/     # React Context
    └── types/       # TypeScript 类型
```
