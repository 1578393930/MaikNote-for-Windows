# MaikNote for Windows — 与 macOS 版差异 & 构建指南

> 使用说明（功能特性、快捷键、数据存储、WebDAV 同步、常见问题）见主文档 [README.md](README.md)。本页聚焦两件事：**与 macOS 原版的差异对照** 与 **Windows 构建指南**。

## 项目来源

> **本项目基于开源项目 [Aprilming/maiknote](https://github.com/Aprilming/maiknote)（macOS 原生版）迁移并二次开发而来。**
>
> - **原作者**：[Aprilming](https://github.com/Aprilming) —— 本项目的核心架构、功能设计与绝大部分代码均出自原项目
> - **Windows 版迁移与二次开发**：sansui · [gitee.com/wyq517](https://gitee.com/wyq517)

macOS 原生 AI Markdown 悬浮便签应用 [MaikNote](https://github.com/Aprilming/maiknote) 的 **Windows 完整移植版**。

原项目完全通过 vibe coding 开发，本仓库在其基础上将 macOS 专属实现全部替换为 Windows 等价物，功能与交互保持一致。

## 与 macOS 版的差异

| 模块 | macOS 版 | Windows 版 |
|------|----------|------------|
| 存储目录 | iCloud (`~/Library/Mobile Documents/.../MaikNote`) | `文档\MaikNote`（可在「设置 → 工作空间」自定义任意目录，放进 OneDrive 目录即可实现同步） |
| 同步方式 | iCloud 系统同步 | **WebDAV 双向同步**（坚果云 / Nextcloud / 自建，含冲突保底与索引合并）+ OneDrive 目录 |
| 毛玻璃 | NSVisualEffectView (HudWindow) | 亚克力 Acrylic（window-vibrancy） |
| 全局快捷键 | Option+Cmd+A | **Ctrl+Alt+A**（Win 键被系统保留，全部键位为 Ctrl/Alt 体系） |
| 窗口按钮 | 左上角红绿灯 | 右上角最小化/最大化/关闭（关闭悬停变红） |
| 删除笔记 | 移入废纸篓 (~/.Trash) | 移入系统回收站（trash crate） |
| 开机自启 | SMAppService / LaunchAgent | 注册表 `HKCU\...\CurrentVersion\Run` |
| 桌面卡片层级 | kCGDesktopIconWindowLevel（真正贴桌面） | 置顶 / 普通 / 压到 Z 序最底（三档保留，"贴桌面"为近似效果） |
| 应用图标换配色 | 写 icns 进 .app 包 | 不支持更换 exe 图标，应用内 Logo 照常切换 |
| 完全磁盘访问 | TCC 检测/授权 | 无此机制，设置页隐藏该项 |
| Skill 软链接 | unix symlink | 目录软链接（需开启 Windows「开发者模式」，否则提示报错） |
| 全局快捷键唤起 | 跨 Space 唤起（CGSAddWindowsToSpaces） | 可见↔隐藏 真切换 |
| 剪贴板写入 | NSPasteboard | Rust 剪贴板插件优先（未聚焦窗口也能复制），Clipboard API / execCommand 兜底 |
| 粘贴纯文本 Markdown | 原生粘贴解析 | 纯文本粘贴自动识别 Markdown 形态并解析渲染（普通纯文本不转换） |

其余功能（WYSIWYG 编辑器、块菜单、桌面卡片、边缘面板、AI 助手、多工作空间、中英双语、主题等）与原版一致。

## 构建要求

- Node.js 20+
- Rust 1.85+（stable-x86_64-pc-windows-msvc）
- Visual Studio 2022/2026（MSVC C++ 生成工具）
- WebView2 Runtime（Win10/11 一般已内置）

## 构建与开发

```bat
build-win.bat dev     REM 开发热重载
build-win.bat         REM 打包 NSIS 安装包
```

`build-win.bat` 已处理两个环境坑：

1. **PATH 顺序**：先加 `%USERPROFILE%\.cargo\bin` 再 call vcvars64.bat（反过来的话 cmd 的解析期展开会把 VS 目录从 PATH 里抹掉）；
2. **`CRATE_CC_NO_DEFAULTS=1`**：去掉 cc-rs 默认注入的 `-Brepro` 标志——该标志要求 cl.exe 记录文件安全属性，在本工作区（带沙箱 ACL 标签）会触发 `error D8050: 无法执行 c1.dll`。

不使用脚本时的等价命令（VS 安装路径按实际填写，或先 `set VCVARS=...` 供脚本自动探测）：

```bat
set PATH=%USERPROFILE%\.cargo\bin;%PATH%
call "<VS 安装路径>\VC\Auxiliary\Build\vcvars64.bat"
set CRATE_CC_NO_DEFAULTS=1
npm run tauri build
```

产物位于 `src-tauri/target/release/bundle/nsis/MaikNote_<版本>_x64-setup.exe`，便携版同步刷新到 `release-portable/`。

## 测试

```bash
npm test                                        # Vitest 前端单元测试
cargo test --release                            # Rust 侧测试（同步引擎等）
node scripts/webdav-test-server.mjs <目录>       # 本地联测用迷你 WebDAV 服务器
cargo test --release webdav::tests::live_sync -- --include-ignored   # WebDAV 端到端联测（需先起上面的服务器）
```

完整测试用例清单（自动化 + 手工验收）见 [docs/测试用例.md](docs/测试用例.md)。

## 技术栈

Tauri 2.x + Vue 3.x + TypeScript · Tiptap 2.x · Pinia · UnoCSS · vue-i18n · DeepSeek/OpenAI 兼容接口 · WebDAV（reqwest）

## 作者与致谢

- **原项目 / 原作者**：[Aprilming/maiknote](https://github.com/Aprilming/maiknote) · 作者 **[Aprilming](https://github.com/Aprilming)** —— 本项目基于该开源 macOS 版迁移而来，核心架构、功能设计与绝大部分代码均出自原项目
- **Windows 版迁移与二次开发**：sansui · [sansui@jun-mou.top](mailto:sansui@jun-mou.top) · [gitee.com/wyq517](https://gitee.com/wyq517)

## 许可

本项目采用**非商业使用许可**（全文见仓库 [LICENSE](LICENSE)）：仅供个人学习、研究和私人使用，禁止任何商业使用；个人范围内可修改与分享，须保留署名。沿用上游「禁止商业用途」的使用意愿。
