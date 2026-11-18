<div align="right"><a href="README.md">中文</a></div>

<div align="center">
  <h1>MaikNote for Windows</h1>
  <p>A Windows port of MaikNote: floating Markdown notes with AI assistance</p>
  <p>
    <img src="https://img.shields.io/badge/Platform-Windows-0078d4?style=flat-square" alt="Windows" />
    <img src="https://img.shields.io/badge/Tauri-2.x-blue?style=flat-square" alt="Tauri 2" />
    <img src="https://img.shields.io/badge/Vue-3.x-42b883?style=flat-square" alt="Vue 3" />
    <img src="https://img.shields.io/badge/WebDAV-sync-0071e3?style=flat-square" alt="WebDAV sync" />
    <img src="https://img.shields.io/github/v/release/1578393930/MaikNote-for-Windows?style=flat-square&label=Version" alt="Latest Windows release" />
  </p>
</div>

## About and attribution

Summon or hide the window with `Ctrl+Alt+A`, write Markdown with live formatting, and keep notes as plain `.md` files in a local folder. Optional WebDAV sync supports services such as Nextcloud, NAS servers and Jianguoyun. AI rewriting, desktop note cards and an edge panel are included.

**This project is a Windows port and derivative of [Aprilming/maiknote](https://github.com/Aprilming/maiknote), originally developed for macOS by [Aprilming](https://github.com/Aprilming).** Its architecture, editor and much of its functionality come from that project.

- Original project and developer: [Aprilming/maiknote](https://github.com/Aprilming/maiknote) · [Aprilming](https://github.com/Aprilming).
- Windows port and additional development: sansui · [gitee.com/wyq517](https://gitee.com/wyq517).
- This repository and Windows releases: [1578393930/MaikNote-for-Windows](https://github.com/1578393930/MaikNote-for-Windows).
- Original macOS website: [maiknote.91kfc.vip](https://maiknote.91kfc.vip). The original project drew inspiration from [Antinote](https://antinote.io/).

The Windows adaptation covers storage, window behavior, Ctrl shortcuts, WebDAV sync and platform fixes. For platform differences, see [README-WIN.md](README-WIN.md).

## Download and install

Open the [latest Windows release](https://github.com/1578393930/MaikNote-for-Windows/releases/latest). Current packages target **Windows x64** and require the Microsoft Edge WebView2 Runtime.

- **Installer:** `MaikNote_<version>_x64-setup.exe` — run it to install.
- **Portable:** `MaikNote_<version>_x64-portable.zip` — extract the archive, then run `MaikNote.exe`. Notes still live in your Documents folder or configured workspace.

The app does not currently provide Windows code signing. If SmartScreen displays a warning, verify the download source before deciding whether to continue. Updater signatures serve a different purpose: they verify update packages.

### Updates

In **Settings → About**, click **Check for updates**. When a higher version is available, click again to download and install it. There is no automatic startup prompt or background installation. Downloads use this repository's Releases and are verified against the public key embedded in the app.

The app saves pending notes before handing control to the installer. Portable users who want to stay portable should close the app and replace its program files using the new ZIP; the in-app update uses the installer.

## Screenshots

These screenshots and the AI demo come from Aprilming's original macOS version. They illustrate the editor and layout; Windows window controls, shortcuts and system effects differ.

![Main window from the original macOS app](resources/demo1.webp)
![Dark theme from the original macOS app](resources/demo1-dark.webp)

| Folders | Search | Themes |
|:---:|:---:|:---:|
| ![Folders](resources/demo6.webp) | ![Search](resources/demo3.webp) | ![Themes](resources/demo4.webp) |

![AI rewriting in the original app](resources/xw_20260611145459.gif)

## Features

- **Editing:** block menus, drag and drop, slash commands, tables, tasks, code highlighting, images, source mode and autosave.
- **Window and desktop:** Acrylic window effects, opacity and always-on-top settings, desktop note cards, an edge panel, close-to-background and launch at login. The desktop layer approximates the macOS behavior.
- **Organization:** multiple workspaces, folders, favorites, note locking, recycle bin, search, and moving or copying notes between workspaces.
- **Sync:** optional WebDAV sync with connection testing, scheduled sync and conflict copies. Workspaces can also be placed in a OneDrive-synced folder.
- **AI:** selection-aware rewriting, custom assistants and prompts, DeepSeek or OpenAI-compatible endpoints, web search and `/ip`.
- **Appearance:** light, dark and system themes, editor presets, syntax themes and note colors.

Notes stay local unless you enable sync or use a connected service. AI actions send the selected text, or the current note when nothing is selected, to your configured API.

## Keyboard shortcuts

| Shortcut | Action |
|:---|:---|
| `Ctrl+Alt+A` | Show / hide the main window |
| `Ctrl+Alt+Shift+A` | Center the main window |
| `Ctrl+N` / `Ctrl+Shift+N` | New note / new note before the current one |
| `Ctrl+Backspace` | Delete the current note |
| `Ctrl+[` / `Ctrl+]` | Previous / next note |
| `Ctrl+Alt+[` / `Ctrl+Alt+]` | Previous / next folder |
| `Ctrl+F` | Search notes |
| `Ctrl+Alt+P` | Toggle always-on-top |
| `Ctrl+Shift+D` | Pin to desktop / remove |
| `Ctrl+L` | Lock / unlock the current note |
| `Ctrl+/` | Toggle source mode |
| `Ctrl+\` | Toggle the sidebar |
| `Ctrl+,` | Open settings |

Configurable shortcuts are available in **Settings → Shortcuts**. The edge panel has a separate shortcut setting and no default binding.

## Storage and sync

The default workspace is the system **Documents\MaikNote** folder. A typical location is:

```text
%USERPROFILE%\Documents\MaikNote\
├── metadata.json
├── assistants.json
├── images\
├── ideas.md
└── Work\
    └── weekly.md
```

The actual Documents location follows Windows settings, including folder redirection. Add other folders in **Settings → Workspaces**. Custom workspace indexes are stored in the app configuration directory.

To use WebDAV, enter your server URL and credentials in **Settings → General → WebDAV sync**, test the connection, then sync. Jianguoyun requires an app password. Alternatively, select a workspace folder managed by OneDrive. Windows storage does not require iCloud or an Apple ID.

## Development

Requires Node.js 22+, Rust 1.85+ with the MSVC toolchain, Visual Studio C++ build tools and WebView2 Runtime.

```bat
npm ci
build-win.bat dev
build-win.bat
```

The full build creates a signed updater installer, its `.sig`, the portable ZIP and `latest.json` in `release-portable/`. `build-win.bat app` only creates the portable program and ZIP. Keep private signing keys and `.tauri-signing.env` local.

See [Windows release instructions](docs/windows-release.md) for signing and publishing, and [site/README.md](site/README.md) for the static website. Release titles and notes require the maintainer's explicit approval before publication.

## Troubleshooting

- **Missing WebView2:** install Microsoft's WebView2 Runtime before running the app.
- **Starting from a ZIP fails:** extract it to a local folder first; do not run the EXE inside the archive viewer.
- **Skill link fails:** creating directory symlinks may require Windows Developer Mode.
- **No update detected:** confirm that a higher stable version is published as Latest and GitHub is reachable.

## License and credits

Keep the original project link and both the original developer and Windows port credits when sharing this derivative. The current repository's use and distribution terms are in [LICENSE](LICENSE); they describe personal, non-commercial use. This documentation does not change those terms.
