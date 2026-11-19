# Windows 发布与应用内更新

## 仓库与更新入口

- 发布仓库：<https://github.com/1578393930/MaikNote-for-Windows>
- 更新清单：<https://github.com/1578393930/MaikNote-for-Windows/releases/latest/download/latest.json>
- 支持平台：Windows x64；完整 NSIS 安装包，无增量更新。
- 用户在「设置 → 关于」手动检查，再点击更新。不会后台自动安装。

## 发布标题与说明确认

以下规则适用于后续每个版本、自动发布和本地手动发布，也适用于修改已公开版本的标题或说明。

1. 构建、校验、创建 Draft 和上传附件可以先完成。公开发布前，必须在对话中展示本次完整的发布标题和说明，请用户确认。
2. 只有用户明确确认本次文案后，才能使用该文案 Publish release 并设为 Latest。没有回复、此前版本的确认、仅要求打包或上传，都不视为本次文案已确认。
3. 用户要求修改时，先展示修改后的完整文案并重新确认。发布时保持与确认版本一致，不追加内部备注，不使用自动生成的说明覆盖它。
4. 说明面向软件用户，只包含实际完成且经核实的新增功能、体验改进、问题修复、使用提示，以及影响使用的已知问题。不编造更新内容或测试结论。
5. 不写“代码未提交”“本地修改未推送”“工作区存在未提交修改”等内部开发信息，也不罗列构建日志、提交状态、调试过程。需要处理的内部问题单独在对话中告知维护者；影响发布正确性的问题应先解决。
6. 等待用户确认时，Release 保持 Draft，不提前公开或设为 Latest。用户在当前对话中的明确指令优先。

标题格式建议：`MaikNote for Windows vX.Y.Z`。说明按本次实际变化选用以下模板，删除无内容的栏目和占位文字：

```markdown
## 新增与优化
- 本次实际新增功能或体验改进。

## 问题修复
- 本次实际修复的问题。

## 下载与使用
- 安装版：下载 MaikNote_X.Y.Z_x64-setup.exe。
- 便携版：下载 MaikNote_X.Y.Z_x64-portable.zip，解压后运行 MaikNote.exe。
```

每次上传安装包、`.sig`、便携 ZIP 和 `latest.json` 四个附件。GitHub 自动提供的 Release attestation 无需手动上传。

## 文件提交与上传限制

- **源码仓库**：仅提交本次任务必要的源码、运行资源、依赖清单与锁文件、构建配置、测试和文档。源码提交不附带安装包、便携包或其他本地产物。
- **禁止上传**：私钥、密码、Token、真实 `.env`、签名配置、GitHub 登录凭据、用户笔记/数据库、日志、缓存、备份、测试报告和临时文件。`.tmp/`（包括本机 GitHub CLI 配置）、`keys/`、`.tauri-signing.env` 等由 `.gitignore` 排除。需要共享配置格式时只提供不含真实凭据的示例。
- **逐项暂存**：使用 `git add -- <明确的必要文件路径>`，禁止 `git add .`、`git add -A` 或强制添加被忽略文件。提交/推送前运行 `npm run upload:check`，审阅 `git diff --cached --name-status` 和 `git diff --cached`，排除无关文件和敏感内容。检查工具只检查路径，不代表完成了内容审查。
- **Release 附件**：仅允许当前版本的 `MaikNote_X.Y.Z_x64-setup.exe`、`MaikNote_X.Y.Z_x64-setup.exe.sig`、`MaikNote_X.Y.Z_x64-portable.zip` 和 `latest.json`。上传时指定这四个文件的完整路径，不使用通配符或整个文件夹。工作流使用明确文件名，并拒绝缺失、空白或多余附件。
- **便携 ZIP**：仅包含 `MaikNote.exe` 与 `README.txt`，不要将项目目录、环境配置或用户数据打进包内。签名 `.sig`、清单中的 signature 和应用验签公钥属于公开验证信息，可以随必要发布文件提供。
- **已跟踪文件**：`.gitignore` 不会自动移除已跟踪文件。`npm run upload:check` 发现被忽略但仍被跟踪/暂存的文件时会失败；发现已泄露凭据时先停止上传并处理，不靠新增忽略规则掩盖，不擅自改写历史或删除本地文件。

新增忽略规则不会自动清理历史提交或远端附件；这些操作应单独处理。

## 安装权限与 Windows 信任提示

- NSIS 使用 `bundle.windows.nsis.installMode: "perMachine"`，安装和升级时请求管理员权限，默认安装到 Program Files，并为所有用户注册安装信息。用户手动安装时，右键安装程序选择「以管理员身份运行」，并在 UAC 提示中授权；日常运行的主程序不要求管理员权限。
- 原来的 `currentUser` 安装记录在 HKCU，新模式记录在 HKLM，不能把切换模式视为已经验证的原地迁移。已有用户首次切换时，退出 MaikNote，卸载旧版（不要勾选删除应用数据），再手动安装新版。发布前须验证此流程、笔记与工作空间保留情况，以及新模式下的应用内升级。
- 用户取消 UAC 或没有可用的管理员凭据时，无法继续安装。自定义目录的文件占用、只读属性或特殊 ACL 仍可能阻止写入，管理员权限不保证解决所有写入错误。
- 当前 Tauri 更新签名仅供应用内验签，不是 Windows Authenticode 代码签名。可信发布者需要另外申请可信的代码签名证书或签名服务，对主程序和安装包签名并添加可信时间戳；不得使用自签名证书声称已解决公开分发的信任问题。
- 有效代码签名不保证 SmartScreen 立即停止提示；UAC 的权限确认也不会因代码签名而消失。

## 首次配置 GitHub

1. 打开 <https://github.com/1578393930/MaikNote-for-Windows/settings/secrets/actions>。
2. New repository secret，名称 `TAURI_SIGNING_PRIVATE_KEY`。值是本地 `keys/maiknote.key` 的完整文本内容，不是路径，不是 `.pub`。
3. 如果私钥有密码，再添加 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`；没有密码则不需要。
4. 仓库 Settings → Actions → General 中启用 Actions，并允许本工作流使用的 GitHub Actions。工作流为发布任务申请 `contents: write`，使用 GitHub 自动提供的 `GITHUB_TOKEN`，无需另建 PAT。
5. 保留当前应用配置中的公钥，使用同一把私钥签名。换密钥会导致旧版无法验证新包。构建后会使用应用内公钥验证安装包，密钥不匹配会阻止生成发布清单。

私钥文件、本地 `.tauri-signing.env` 不应提交；备份私钥，不要把密钥贴到 issue 或聊天里。

## 自动发布

以下以 **0.10.22** 为例，实际应选择大于已发布版本的版本号；不要重用已有 tag。

1. 修改 `version.json`，运行 `npm run sync-version`。这会同步 package.json、package-lock.json、Cargo.toml 和 tauri.conf.json。
2. 运行 `npm run upload:check`、`npm run release:check`、`npm test` 和 `npm run build`。
3. 提交本次代码和所有版本文件，推送分支到 origin（本仓库），然后推送对应 tag：

   ```bash
   git tag v0.10.22
   git push origin v0.10.22
   ```

4. Actions → Windows Release。工作流校验 tag 与提交中的版本一致，再构建签名安装包、校验签名和制作便携 ZIP。
5. Releases 中打开生成的 **Draft**，确认下面四个附件都存在，按「发布标题与说明确认」规则取得用户对本次完整文案的确认后，再 Publish release，并将其设为 Latest。请勿勾选 pre-release；此流程只发布 `X.Y.Z` 正式版本。

   - `MaikNote_0.10.22_x64-setup.exe`
   - `MaikNote_0.10.22_x64-setup.exe.sig`
   - `MaikNote_0.10.22_x64-portable.zip`
   - `latest.json`

草稿不会影响旧版检查更新。附件全部上传并审核后再公开，避免客户端拿到不完整的版本。手动 Run workflow 仅构建并上传 Actions artifact，不创建 Release。失败重跑可以更新同 tag 草稿；工作流拒绝覆盖已公开的 Release。

## 本地发布备用流程

1. `.tauri-signing.env` 写入 `TAURI_SIGNING_PRIVATE_KEY_PATH=keys/maiknote.key`；有密码时增加 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD=你的密码`。
2. 修改版本、执行 `build-win.bat`。脚本失败时会返回非零状态。
   脚本会将安装包、签名、便携 ZIP 和 `latest.json` 统一整理到项目根目录的 `release-portable/`，逐项检查当前版本的四个文件存在且非空，并打印可上传文件列表。Tauri 的原始编译产物仍保留在 `src-tauri/target/`，发布时使用整理后的目录。
3. 将 `release-portable/` 中当前版本的上述四个文件上传到本仓库同 tag 的 Release 草稿，按「发布标题与说明确认」规则取得用户对本次完整文案的确认后，再公开发布为 Latest。

`build-win.bat app` 仅构建未签名的便携 EXE/ZIP，不生成可用于应用内更新的安装包或清单。

## 发布验收

1. 下载公开 Release 的 `latest.json`，确认 version、`windows-x86_64`、安装包 URL 都属于当前版本和本仓库，signature 非空。
2. 在测试机器/虚拟机上安装较旧版本，编辑一条测试笔记，再到设置检查更新。
3. 确认显示新版本，点击更新，观察下载进度、安装与重新启动。
4. 确认关于页为新版本，笔记与自定义工作空间仍可打开，再检查更新应显示无更新。
5. 断网测试：显示检查失败，恢复网络后可以重试。取消安装或安装失败时可手动下载安装包恢复。
6. 便携版需要保持便携时，用新 ZIP 手动替换。应用内按钮使用 NSIS 安装器，不会替换原便携 EXE；运行环境需要 WebView2。

自动测试覆盖更新状态、重复点击、错误后重试、安装前保存顺序，以及清单签名验证的篡改和错误密钥情况。真实 Windows 安装器执行与 GitHub 下载需要上述实际升级验收。

## 常见失败

- 找不到 secret：检查名称、所属仓库、完整私钥文本；不要把文件路径填入 secret。
- 签名与内置公钥不匹配：恢复原私钥。不要为了让构建通过而随意改客户端公钥。
- tag 与版本不一致：发布新 tag 前先同步版本并提交，不要覆盖旧 tag。
- 403 发布失败：检查仓库/组织是否限制工作流 `contents: write` 或禁用了 Actions。
- 没有发现新版本：确认 Release 已公开且为 Latest，版本高于本机，并且公开下载地址能返回完整清单。
- GitHub 网络不可达：客户端目前只使用官方 GitHub 地址；可联网后重试，或通过浏览器下载本仓库安装包。
- 旧包没有本仓库更新地址或相同公钥：先手动安装一次当前正确配置的版本，后续才能使用这条更新链路。
