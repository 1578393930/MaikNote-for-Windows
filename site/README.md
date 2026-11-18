# MaikNote for Windows 展示站

这是本仓库 Windows 移植版的静态展示页面，使用 HTML、CSS 和原生 JavaScript，无需 npm 构建。应用原项目为 [Aprilming/maiknote](https://github.com/Aprilming/maiknote)，原作者 [Aprilming](https://github.com/Aprilming)；Windows 移植与二次开发者为 sansui（[gitee.com/wyq517](https://gitee.com/wyq517)）。本仓库维护与发布：[1578393930/MaikNote-for-Windows](https://github.com/1578393930/MaikNote-for-Windows)。

## 目录

```text
site/
├── index.html                  # 功能、截图、快捷键、Windows 下载与来源署名
├── assets/
│   ├── styles.css              # 样式与深浅主题
│   ├── main.js                 # 主题切换、版本查询和下载链接
│   └── img/                    # 原项目截图、演示和应用图标
├── deploy/nginx.conf.template  # 容器 Nginx 配置
├── Dockerfile
└── docker-compose.yml
```

## 本地预览

在项目根目录运行：

```powershell
python -m http.server 4173 --bind 127.0.0.1 --directory site
```

打开 <http://127.0.0.1:4173>。也可直接打开 `site/index.html`，但浏览器可能限制文件页面的存储或网络能力，推荐本地 HTTP 预览。

## 部署范围

静态托管时只上传 `site/index.html` 和 `site/assets/`，所有页面资源使用相对路径，支持子路径部署。不要上传项目根目录、密钥、环境配置、笔记、日志、临时目录或开发文档。

本仓库目前没有 GitHub Pages 发布工作流。如需使用 Pages，应另行配置；此文档不代表网站已经部署。上游的 maiknote.91kfc.vip 是原版官网，不是本仓库的 Windows 展示站。

### Docker 部署

在已安装 Docker Compose 的环境中，从 `site/` 目录执行：

```sh
docker compose up -d --build
```

默认访问 <http://127.0.0.1:8099>，健康检查地址为 `/healthz`。更新页面后再次运行上述命令以重新构建并替换容器。对外域名、HTTPS 和反向代理由部署者按自己的环境配置，无需沿用上游服务器、域名或证书。

Docker 构建上下文只允许网页、静态资源、Nginx 模板和 Dockerfile；镜像中只复制运行网站所需内容。

## Windows 下载按钮

下载区提供两种 Windows x64 包，初始链接均为：

<https://github.com/1578393930/MaikNote-for-Windows/releases/latest>

`assets/main.js` 从本仓库 GitHub Releases API 读取最新正式版本，按当前版本的完整文件名定位附件：

| 按钮 | 附件 |
|:---|:---|
| 安装版 | `MaikNote_<版本>_x64-setup.exe` |
| 便携版 | `MaikNote_<版本>_x64-portable.zip` |

只接受本仓库对应 tag 下的附件 URL，不将 `.sig`、证明文件或上游 macOS 包作为下载目标。版本查询不可用或附件缺失时，按钮保留发布页链接。

版本号仅来自 API，不在 HTML 中写死。缓存键为 `mn-windows-release`，有效期为 10 分钟，不复用旧版站点的 macOS 缓存。调试时可执行 `sessionStorage.removeItem('mn-windows-release')` 清除缓存。

## 文案与署名规则

- 中文、英文 README 与网站保持一致：Windows x64、本地「文档」目录、自定义工作空间、WebDAV/OneDrive、Ctrl 快捷键、设置中手动检查更新。
- 保留原仓库和 Aprilming 原作者链接，以及既有 Windows 移植者 sansui 的署名。页面的原项目、Windows 仓库和下载入口须清晰区分。
- 当前截图和 AI 演示来自 macOS 原版，页面必须标注来源。更换为实际 Windows 截图后再更新说明，不把原版图片直接称为 Windows 实机截图。
- macOS 安装、iCloud 路径、Apple 公证、双架构 DMG 和 Cmd 快捷键不作为 Windows 使用指引。
- 运行环境需要 WebView2；便携版的数据仍放在工作空间。应用内更新使用安装器，保持便携使用时手动替换 ZIP 中的程序文件。
- 使用与分发条件引用本仓库 [LICENSE](../LICENSE)，本次文案适配不修改许可条款。
- 修改 JS 或 CSS 时递增 HTML 中对应的 `?v=` 缓存参数。主题通过 `localStorage.mn-theme` 保存。

网站修改不等于发布新版应用。GitHub Release 标题和说明仍须按照 [发布规则](../docs/windows-release.md) 先取得维护者确认。
