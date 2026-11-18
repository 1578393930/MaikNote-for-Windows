# MaikNote for Windows — 与 macOS 版差异 & 构建指南

> 使用说明（功能特性、快捷键、数据存储、WebDAV 同步、常见问题）见主文档 [README.md](README.md)。本页聚焦两件事：**与 macOS 原版的差异对照** 与 **Windows 构建指南**。

## 项目来源

> **本项目基于开源项目 [Aprilming/maiknote](https://github.com/Aprilming/maiknote)（macOS 原生版）迁移并二次开发而来。**
>
> - **原作者**：[Aprilming](https://github.com/Aprilming) —— 本项目的核心架构、功能设计与绝大部分代码均出自原项目
> - **Windows 版迁移与二次开发**：sansui · [gitee.com/wyq517](https://gitee.com/wyq517)
> - **本仓库维护与发布**：[1578393930/MaikNote-for-Windows](https://github.com/1578393930/MaikNote-for-Windows)

macOS AI Markdown 悬浮便签应用 [MaikNote](https://github.com/Aprilming/maiknote) 的 **Windows 移植与二次开发版本**。

保留原项目的编辑器与主要交互，并适配 Windows 存储、窗口、快捷键和同步；桌面层级、图标等系统能力存在下表所列差异。

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

Windows 版保留 WYSIWYG 编辑器、块菜单、桌面卡片、边缘面板、AI 助手、多工作空间、中英双语和主题等功能，具体表现以 Windows 构建为准。

## 构建要求

- Node.js 22+
- Rust 1.85+（stable-x86_64-pc-windows-msvc）
- Visual Studio 2022/2026（MSVC C++ 生成工具）
- WebView2 Runtime（Win10/11 一般已内置）

## 构建与开发

```bat
npm ci               REM 首次安装依赖
build-win.bat dev     REM 开发热重载
build-win.bat         REM 打包 NSIS 安装包（含更新签名 + latest.json）
```

### 手动检查与安装更新（发布流程）

更新签名使用 minisign 密钥对，私钥在本地 `keys\maiknote.key`（**已 gitignore，勿提交、勿丢失**——丢失后已发布版本的自动更新无法继续签名，需换密钥并重新发版）。

本仓库的发布目标固定为 **1578393930/MaikNote-for-Windows**。Windows 更新地址不会使用上游 Aprilming 仓库。

完整配置、发布和验收步骤见 [Windows 发布与更新](docs/windows-release.md)。常用流程：

1. 首次在本仓库 Actions Secrets 配置 `TAURI_SIGNING_PRIVATE_KEY`（现有 `keys\maiknote.key` 的完整内容）；有密码时另配 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。
2. 修改 `version.json` 为更高的正式版本，执行 `npm run sync-version`，提交版本文件和本次发布的代码。
3. 推送提交和对应的 `vX.Y.Z` tag 到 **origin**。GitHub Actions 自动测试、构建 Windows x64 安装包、验证签名、生成清单和便携 ZIP，上传到 Release 草稿。
4. 检查草稿中的四个附件，将完整发布标题和说明交给维护者确认，再点击 Publish release，并将此正式版本设为 Latest。旧版本在「设置 → 关于 → 检查更新」手动检查后可发现新版。

也可以执行 `build-win.bat` 本地构建：四个发布附件统一位于 `release-portable/`，上传到同版本 tag 的 Release 即可。不要上传私钥。

应用内更新为用户手动触发，下载完整安装包；下载签名验证通过后，触发待保存笔记落盘，再交给安装器退出和更新。便携版的应用内更新同样使用安装器；若要保持便携使用，请退出应用后手动用新 ZIP 替换程序文件。

`build-win.bat` 通过 `scripts/tauri-build-signed.ps1` 读取本地 `.tauri-signing.env`（`TAURI_SIGNING_PRIVATE_KEY_PATH=keys/maiknote.key`）注入签名环境；密钥文件缺失时构建会明确报错。

`build-win.bat` 已处理以下构建环境问题：

1. **PATH 顺序**：先加 `%USERPROFILE%\.cargo\bin` 再 call vcvars64.bat（反过来的话 cmd 的解析期展开会把 VS 目录从 PATH 里抹掉）；
2. **`CRATE_CC_NO_DEFAULTS=1`**：去掉 cc-rs 默认注入的 `-Brepro` 标志——该标志要求 cl.exe 记录文件安全属性，在本工作区（带沙箱 ACL 标签）会触发 `error D8050: 无法执行 c1.dll`。

临时目录 `TMP` 和 `TEMP` 也会指向项目内的 `.tmp`，避免系统临时目录权限影响构建。

只需要直接验证 Tauri 构建时，可在配置好 MSVC 后运行以下命令。它不执行完整的签名配置、清单生成和便携 ZIP 整理；正式发布请使用 `build-win.bat`：

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
cargo test --release --manifest-path src-tauri/Cargo.toml   # Rust 侧测试
node scripts/webdav-test-server.mjs <目录>       # 本地联测用迷你 WebDAV 服务器
cargo test --release --manifest-path src-tauri/Cargo.toml webdav::tests::live_sync -- --include-ignored   # WebDAV 端到端联测
```

完整测试用例清单（自动化 + 手工验收）见 [docs/测试用例.md](docs/测试用例.md)。

## 技术栈

Tauri 2.x + Vue 3.x + TypeScript · Tiptap 2.x · Pinia · UnoCSS · vue-i18n · DeepSeek/OpenAI 兼容接口 · WebDAV（reqwest）

## 作者与致谢

- **原项目 / 原作者**：[Aprilming/maiknote](https://github.com/Aprilming/maiknote) · 作者 **[Aprilming](https://github.com/Aprilming)** —— 本项目基于该开源 macOS 版迁移而来，核心架构、功能设计与绝大部分代码均出自原项目
- **Windows 版迁移与二次开发**：sansui · [sansui@jun-mou.top](mailto:sansui@jun-mou.top) · [gitee.com/wyq517](https://gitee.com/wyq517)

## 许可

本项目采用**非商业使用许可**（全文见仓库 [LICENSE](LICENSE)）：仅供个人学习、研究和私人使用，禁止任何商业使用；个人范围内可修改与分享，须保留署名。沿用上游「禁止商业用途」的使用意愿。
