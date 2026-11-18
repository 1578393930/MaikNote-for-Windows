<div align="center">
  <h1>MaikNote for Windows</h1>
  <p>基于 MaikNote 移植与二次开发的 Windows AI Markdown 悬浮便签</p>
  <p>
    <img src="https://img.shields.io/badge/Platform-Windows-0078d4?style=flat-square&logo=windows" />
    <img src="https://img.shields.io/badge/Tauri-2.x-blue?style=flat-square" />
    <img src="https://img.shields.io/badge/Vue-3.x-42b883?style=flat-square&logo=vue.js" />
    <img src="https://img.shields.io/badge/WebDAV-同步-0071e3?style=flat-square" />
    <img src="https://img.shields.io/github/v/release/1578393930/MaikNote-for-Windows?style=flat-square&label=Version" />
  </p>
</div>

---

## 简介

全局快捷键随叫随到（`Ctrl+Alt+A`），所见即所得写 Markdown，笔记以纯 `.md` 文件落在本地目录，支持 **WebDAV 双向同步**（坚果云 / Nextcloud / 自建 NAS），并内置 AI 改写与桌面笔记卡片。

## 项目来源

[下载 Windows 版](https://github.com/1578393930/MaikNote-for-Windows/releases/latest) · [English](README_EN.md) · [Windows 构建指南](README-WIN.md)

> **本项目并非从零编写的作品，而是基于开源项目 [Aprilming/maiknote](https://github.com/Aprilming/maiknote)（macOS 原生版）迁移而来的二次开发版本。**
>
> - **原项目 / 原作者**：[Aprilming/maiknote](https://github.com/Aprilming/maiknote) · 作者 **[Aprilming](https://github.com/Aprilming)**（完全通过 vibe coding 方式开发，灵感来自 [Antinote](https://antinote.io/)）
> - **Windows 版所做的工作**：适配本地文档目录、Windows 窗口与快捷键，新增 WebDAV 同步，并修复平台适配问题；平台差异见 [README-WIN.md](README-WIN.md)
> - **Windows 版维护者**：sansui · [gitee.com/wyq517](https://gitee.com/wyq517)
> - **本仓库维护与发布**：[1578393930/MaikNote-for-Windows](https://github.com/1578393930/MaikNote-for-Windows)
>
> 本项目的核心架构、功能设计与绝大部分代码均来自原项目，功劳属于原作者 Aprilming。

📘 **使用教程**：[仓库内 TUTORIAL.md](TUTORIAL.md) — 一页看完：快捷键、收藏、置顶、AI。

> 教程也内置在 App 里：**第一次启动会自动弹出**，之后随时从 **设置 → 关于 → 使用教程** 再看。

## 设计理念

**召之即来，挥之即去** · 全局快捷键随时唤起 / 隐藏 ｜ **所见即所得** · 实时渲染 Markdown，无需切换预览 ｜ **如无必要，勿增实体** · 极简界面，专注内容本身

## 主要界面

> 以下截图和 AI 演示来自 Aprilming 的 macOS 原版，用于展示编辑与布局。Windows 版窗口按钮、快捷键及系统效果以实际运行界面为准。

![主界面](resources/demo1.webp)
![深色](resources/demo1-dark.webp)

|               文件夹               |              搜索              |              主题              |
|:-------------------------------:|:----------------------------:|:----------------------------:|
| ![文件夹](resources/demo6.webp) | ![搜索](resources/demo3.webp) | ![主题](resources/demo4.webp) |

|              配色               |              快捷键              |              源码模式              |
|:----------------------------:|:-----------------------------:|:------------------------------:|
| ![配色](resources/demo2.webp) | ![快捷键](resources/demo5.webp) | ![源码模式](resources/demo7.webp) |

## AI 演示

> 有选中文字时，只把选中的内容发给 AI；没有选中时，发送整篇笔记。

![AI 改写](resources/xw_20260611145459.gif)

## 功能特性

**编辑** — Notion 风格块菜单、块拖拽、`/` 斜杠命令；表格 / 待办 / 代码高亮 / 图片与行内样式；源码模式（`Ctrl+/`）与源码内搜索；链接自动转卡片预览；字号、Tab 空格数与编辑器样式预设；防抖自动保存，空段落与中文输入法往返无损。

**窗口与桌面** — 无边框悬浮窗 + 亚克力毛玻璃（Acrylic），透明度 / 置顶 / 层级可调；**桌面笔记卡片**（右键钉到桌面，可拖动缩放、勾选回写正文、置顶 / 普通 / 贴桌面三档）；**边缘面板**（贴边小白条，四向触发、可调宽度与颜色、收藏笔记直达编辑）；关闭行为可选隐藏或退出，支持开机自启。

**组织与检索** — 多工作空间（默认 `文档\MaikNote`，可自定义任意目录）；多级文件夹文件树，同级拖拽排序、拖进文件夹自动搬运；收藏与固定分组；回收站、笔记锁定；全局搜索（↑↓ / Enter / Esc）；文件树字号 11–18px 可调；跨工作空间复制 / 移动笔记。

**同步** — **WebDAV 双向同步**：支持坚果云（应用密码）、Nextcloud、自建 NAS（含 http / 自签名证书）；三方比较增量传输，索引按 id 自动合并，冲突文件各保留一份不覆盖；启动同步 / 定时同步（5–60 分钟）。

**AI 与集成** — 右键 AI 优化（选中即局部改写）；自定义助手与提示词，默认接 DeepSeek API；联网搜索；`/ip` 查出口 IP 与本地网卡；内置 `maiknote-guide` Skill 软链。

**外观与隐私** — 深色 / 浅色 / 跟随系统，多套代码高亮主题；笔记背景色与默认背景；首启隐私承诺页；笔记就是本地目录里能直接看到、直接改的 `<标题>.md`。

## 快捷键

| 快捷键 | 功能 | 快捷键 | 功能 |
|:---|:---|:---|:---|
| `Ctrl+Alt+A` | 唤起 / 隐藏主窗口（全局） | `Ctrl+Alt+P` | 窗口置顶 |
| `Ctrl+Alt+Shift+A` | 窗口居中（全局） | `Ctrl+F` | 搜索笔记 |
| `Ctrl+N` | 新建笔记 | `Ctrl+L` | 锁定 / 解锁笔记 |
| `Ctrl+Shift+N` | 在当前笔记之前新建 | `Ctrl+/` | 切换源码模式 |
| `Ctrl+Backspace` | 删除当前笔记 | `Ctrl+\` | 展开 / 收起侧栏 |
| `Ctrl+[` / `Ctrl+]` | 上一条 / 下一条笔记 | `Esc` | 关闭搜索、从设置返回 |
| `Alt+Ctrl+[` / `Alt+Ctrl+]` | 上一个 / 下一个目录 | `Ctrl+,` | 打开设置 |

> 除全局快捷键外都可在「设置 → 快捷键」中改键、留空或恢复默认；边缘面板有独立快捷键位（默认未设置，可在设置里指定）。

## 数据存储

笔记以 Markdown 文件存放在本地目录，文件名即标题，文件夹即目录：

```
%USERPROFILE%\Documents\MaikNote\
├── metadata.json        # 索引（收藏、锁定、回收站、排序）
├── assistants.json      # AI 助手配置
├── images\              # 笔记图片
├── 灵感.md
└── 工作\
    └── 周报.md
```

- 默认空间在 `文档\MaikNote`；可在「设置 → 工作空间」添加任意文件夹作为自定义空间
- 自定义空间的索引存放在应用配置目录，不往用户文件夹塞额外文件
- 把目录放进 OneDrive 文件夹，配合系统同步也能多设备使用
- **WebDAV 同步**：设置 → 通用设置 → WebDAV 同步，填地址 / 账号 / 密码（坚果云需用官网生成的应用密码），先「测试连接」再「立即同步」

旧版 `note_<uuid>.md` 扁平布局会在启动时自动迁移。

## 下载与安装

前往 [本仓库最新 Release](https://github.com/1578393930/MaikNote-for-Windows/releases/latest) 选择 **Windows x64** 文件。运行需要 WebView2 Runtime；未安装时请先安装该运行环境。

- **安装版**：`MaikNote_<版本>_x64-setup.exe`（NSIS），双击安装
- **便携版**：`MaikNote_<版本>_x64-portable.zip`，解压即用，数据仍写在 `文档\MaikNote`

> 首次运行可能遇到 Windows SmartScreen 提示。请先确认文件来自上述仓库且下载完整，再按系统提示操作。应用更新签名用于验证更新包，与 Windows 代码签名不同。

**检查与安装更新** — 在「设置 → 关于」手动点击「检查更新」，发现更高版本后再点击下载并安装。更新包经 minisign 签名校验，指向本仓库 Releases；不会在启动时自动弹窗或后台安装。

便携版若要保持解压即用，请手动下载新 ZIP 替换程序；应用内更新按钮使用安装器。维护者发布步骤见 [Windows 发布与更新](docs/windows-release.md)。

## 常见问题

**SmartScreen 提示"已保护你的电脑"** — 当前安装包未提供 Windows 代码签名。先核对下载来源与文件，再决定是否按系统提示继续运行；便携版同理。

**双击 exe 提示 `PluginInitialization("http", "拒绝访问。")`** — 直接从压缩包里双击运行 exe 导致：先把**整个文件夹解压到本地磁盘**（不要在压缩软件里直接运行）再启动。

**Skill 软链接报错** — Windows 创建目录软链接需要开启系统「设置 → 隐私和安全性 → 开发者模式」。

**笔记放 OneDrive 能同步吗** — 能。在「设置 → 工作空间」把工作空间指到 OneDrive 内的文件夹即可；或直接使用 WebDAV 同步。

**macOS 版可以用吗** — 可以，本项目的 macOS 原版在 [Aprilming/maiknote](https://github.com/Aprilming/maiknote)，官网 [maiknote.91kfc.vip](https://maiknote.91kfc.vip)。

## 与 macOS 版的差异

完整差异对照表见 [README-WIN.md](README-WIN.md)。要点：存储从 iCloud 改为本地目录 / WebDAV；快捷键从 Cmd 体系改为 Ctrl 体系（`Ctrl+Alt+A` 唤起）；毛玻璃用 Acrylic 实现；删除走系统回收站。

## 技术栈

Tauri 2.x + Vue 3.x + TypeScript · Tiptap 2.x（Notion 风格块操作）· Pinia · UnoCSS · 本地 `.md` 文件 + WebDAV（reqwest）· DeepSeek / OpenAI 兼容接口 · vue-i18n（中文 / English）

## 开发指南

需要 Node.js 22+、Rust 1.85+（MSVC）、Visual Studio C++ 生成工具、WebView2 Runtime。首次使用请先运行 `npm ci` 安装依赖。

```bat
build-win.bat dev     REM 开发热重载
build-win.bat         REM 打包 NSIS 安装包 + 便携版 ZIP
```

构建脚本的环境要求与已知坑见 [README-WIN.md](README-WIN.md)。测试：`npm test`（Vitest 单元测试）。

## 作者与致谢

- **原项目 / 原作者**：[Aprilming/maiknote](https://github.com/Aprilming/maiknote) · 作者 **[Aprilming](https://github.com/Aprilming)** —— 本项目基于该开源 macOS 版迁移而来，核心架构、功能设计与绝大部分代码均出自原项目
- **Windows 版迁移与二次开发**：sansui · [sansui@jun-mou.top](mailto:sansui@jun-mou.top) · [gitee.com/wyq517](https://gitee.com/wyq517) —— 平台移植（iCloud → 本地 / WebDAV、Cmd → Ctrl 快捷键体系等）、Bug 修复，以及 WebDAV 同步等新增功能
- 原项目的灵感来源：[Antinote](https://antinote.io/)；原项目官网：[maiknote.91kfc.vip](https://maiknote.91kfc.vip)
- 本仓库维护与发布：[1578393930/MaikNote-for-Windows](https://github.com/1578393930/MaikNote-for-Windows)

## 许可协议

本项目采用**非商业使用许可**，全文见 [LICENSE](LICENSE)：

- ✅ 个人学习、研究、私人使用；个人范围内修改与分享（须保留本声明与署名）
- ❌ 任何商业使用（出售、捆绑于商业产品或服务、营利性二次开发与分发）

> 本项目基于 [Aprilming/maiknote](https://github.com/Aprilming/maiknote) 迁移开发，沿用上游「禁止商业用途」的使用意愿；如需商业授权请联系原作者。
