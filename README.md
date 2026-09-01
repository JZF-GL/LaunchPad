# 🚀 LaunchPad - 现代前端项目启动与管理桌面客户端

<p align="center">
  <b>专为前端开发者打造的轻量、高效、可视化的项目管理与进程控制中心</b>
</p>

---

## 📖 项目简介

**LaunchPad** 是一款基于 **Electron 33 + React 18 + Vite 5 + TypeScript** 构建的现代化跨平台桌面客户端应用。

日常前端开发中，开发者常常需要同时维护多个项目，频繁在不同的终端窗口中启动 `dev`、`build`、`test`、`lint` 等命令，还经常遇到端口冲突（`EADDRINUSE`）、进程残留占用、难以直观掌控各项目资源消耗等痛点。

LaunchPad 将**项目管理、脚本执行、多任务终端、端口冲突诊断、硬件指标监控**集成于一体，为前端开发者提供开箱即用、沉浸式、极客风的一站式工作台。

---

## ✨ 核心特性

### 1. 🔍 智能项目扫描与技术栈识别
- **自动解析配置**：自动扫描选定目录下的 `package.json`，提取全部可执行指令（`scripts`）。
- **包管理器自动识别**：根据 Lock 文件（`pnpm-lock.yaml` / `yarn.lock` / `bun.lock` / `package-lock.json`）智能匹配首选包管理器（**pnpm / npm / yarn / bun**），并支持随时手动切换。
- **技术栈徽章识别**：自动探测并高亮项目使用的前端框架与工具链（**React、Vue、Next.js、Nuxt、Svelte、Astro、Angular、Vite、Webpack、TailwindCSS、TypeScript、Electron** 等）。
- **便捷导入**：支持文件夹选择弹窗与**拖拽项目文件夹直接导入**，支持模糊搜索与快速过滤。

### 2. ⚡ 灵活的脚本指令运行与进程控制
- **双视图模式**：
  - **标准模式**：展示完整指令脚本、运行状态、PID，支持展开配置**自定义启动参数**（如 `--port 8080`、`--host` 等）。
  - **简易模式**：紧凑磁贴网格布局，专注核心开发脚本的快速启停与重启。
- **安全的进程树管理**：底层采用 `tree-kill` 与多进程管理架构，一键安全终止完整子进程树，杜绝 Windows / macOS 下 node 进程残留或成为孤儿进程。
- **应用关闭保护**：退出主程序时自动清理所有正在运行的后台子进程。

### 3. 🖥️ 极客风多任务集成终端 (Terminal)
- **深度集成 xterm.js**：具备完整的 ANSI 彩色渲染输出、自适应缩放（FitAddon）与清屏功能。
- **多任务标签页**：支持在多个运行中脚本间无缝切换，日志缓冲区独立保存。
- **URL 智能捕获**：自动识别控制台输出中的本地预览链接（如 `http://localhost:5173`、`http://127.0.0.1:3000`），支持**一键在默认浏览器中打开**。
- **日志快速复制**：一键复制终端完整输出日志，便于排查错误或分享排障。

### 4. 🛡️ 智能端口占用诊断与一键清理 (Port Killer)
- **错误智能感知**：实时监听控制台报错，命中 `EADDRINUSE` / `port is already in use` 等特征时自动触发告警弹窗。
- **占用进程深度定位**：自动探测占用目标端口的进程名称（如 `node.exe`）及 PID。
- **一键清理并重启**：支持在弹窗中一键强制释放占用端口并自动重新拉起当前开发任务；同时也支持手动输入任意端口号进行一键释放。

### 5. 📊 实时性能与硬件指标监控仪表盘
- **项目进程内存统计**：基于系统底层 `wmic` / `ps` 实时递归计算当前项目所有子进程树的物理内存消耗（RSS）。
- **LaunchPad 应用自身开销**：实时展示常驻内存（RSS）与已分配堆内存（Heap Used），保持轻量低耗。
- **系统内存监控**：直观展示宿主机总内存、已用内存、空闲内存与实时使用率仪表。
- **CPU 处理器监控**：实时计算多核 CPU 使用率，展示核心数、架构与芯片型号。

### 6. 🎨 沉浸式极客暗黑 UI 与快捷工具
- **无边框窗口设计**：精致的暗黑主题（Dark 950 风格），集成自定义跨平台无边框标题栏。
- **IDE 快速联动**：一键在 VSCode 中直接打开对应工程目录。
- **系统资源管理器联动**：一键定位并打开操作系统所在文件夹。
- **本地持久化**：自动记忆导入的项目列表、选中的包管理器与视图配置。

---

## 🛠️ 技术架构

```
LaunchPad
├── electron/                 # Electron 主进程与底层能力
│   ├── main.ts              # 主进程入口、窗口创建、IPC 通信调度、系统指标采集
│   ├── preload.ts           # 预加载脚本、通过 contextBridge 暴露安全 API
│   ├── processManager.ts    # 子进程生命周期管理、进程树终止、日志管道转发、端口冲突识别
│   ├── projectScanner.ts    # package.json 解析、包管理器与技术栈智能识别
│   └── portManager.ts       # 跨平台端口占用查询 (netstat/lsof) 与进程强制清理
│
├── src/                     # React 前端渲染进程 (UI 层)
│   ├── components/          # UI 业务组件
│   │   ├── TitleBar.tsx          # 自定义无边框窗口标题栏与窗口控制
│   │   ├── Sidebar.tsx           # 左侧项目列表导航、搜索、环境状态、添加项目
│   │   ├── ProjectDetail.tsx     # 顶部项目详情、包管理器切换、Scripts 指令面板、端口清理工具
│   │   ├── TerminalView.tsx      # 基于 xterm.js 的实时彩色日志控制台、Localhost 地址识别
│   │   ├── StatusDashboard.tsx   # 右侧硬件性能监控（项目内存/应用内存/系统内存/CPU 状态）
│   │   └── PortConflictModal.tsx # 端口冲突捕获与自动重试弹窗
│   ├── types/               # TypeScript 类型定义
│   ├── utils/               # 工具函数与框架 Badge 配色
│   ├── App.tsx              # 应用主框架与全局状态协调
│   └── main.tsx             # React 渲染入口
│
├── scripts/                 # 构建与辅助脚本
│   └── generate-icons.js    # 应用图标生成脚本 (.ico / .png)
│
├── vite.config.ts           # Vite + Electron 构建配置
├── tailwind.config.js       # Tailwind CSS 极客暗黑主题定制
└── package.json             # 依赖管理与 electron-builder 打包配置
```

---

## 📦 技术选型一览

| 维度 | 技术选型 | 说明 |
| :--- | :--- | :--- |
| **应用容器** | Electron 33 | 最新稳定版 Electron，搭配 Node 20 运行时 |
| **前端框架** | React 18 + TypeScript | 强类型保障与高效 UI 组件化 |
| **构建工具** | Vite 5 + vite-plugin-electron | 极速秒级热重载与一体化构建流程 |
| **样式与图标** | TailwindCSS + Lucide Icons | 暗黑主题极客视觉设计与丰富图标 |
| **终端组件** | @xterm/xterm + @xterm/addon-fit | 工业级 Web 终端控制台 |
| **进程管理** | tree-kill + Node.js child_process | 跨平台完整进程树终止控制 |
| **安装包分发** | electron-builder (NSIS) | Windows 平台安装包构建与快捷方式生成 |

---

## 🚀 快速上手与本地开发

### 环境要求
- **Node.js** >= 18.0.0
- 包管理器推荐使用 **npm** 或 **pnpm**

### 安装依赖
```bash
npm install
```

### 启动开发环境
运行以下命令即可启动 Vite 开发服务器并自动拉起 Electron 桌面应用窗口：
```bash
npm run dev
```
*(或者使用 `npm run electron:dev`)*

---

## 🏗️ 构建与打包分发

### 1. 自动生成图标
```bash
npm run generate:icons
```

### 2. 编译前端与 TypeScript
```bash
npm run build
```

### 3. 生成 Windows 安装程序 (.exe)
```bash
npm run build:electron
```
打包输出文件将存放于 `release/` 目录下（如 `LaunchPad Setup 1.0.0.exe`）。

---

## 📝 许可证

本项目采用 [ISC License](LICENSE) 开源许可。
