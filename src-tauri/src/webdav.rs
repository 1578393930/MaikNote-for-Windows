//! WebDAV 双向同步（当前工作空间 → 远端目录）。
//!
//! 设计要点：
//! - 每台设备各自维护本地清单 `.maiknote-sync.json`（记录上次同步时两侧的修改时间），
//!   三方比较（本地 / 远端 / 清单）决定上传、下载或合并；
//! - 索引文件 metadata.json / directories.json / assistants.json 双方都改过时按 id 合并，不丢数据；
//! - `.md` 双方都改过时，远端版本以「标题（冲突 日期）.md」落盘并登记为新笔记；
//! - 图片等其它文件双方都改过时取修改时间较新的一方；
//! - 删除不跨设备传播（v1 安全策略：本地删了不动远端，远端删了不补回本地）。

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use regex::Regex;
use reqwest::{Client, Method, StatusCode};
use serde::{Deserialize, Serialize};
use url::Url;

/// 远端同步根目录下的清单文件名（远端不存清单：每台设备的同步状态各自独立）
const MANIFEST_NAME: &str = ".maiknote-sync.json";
/// 根目录下的索引文件：双向都改过时按 id 合并，而不是覆盖
const META_FILES: [&str; 3] = ["metadata.json", "directories.json", "assistants.json"];
/// metadata.json 的当前版本号（与前端 METADATA_VERSION 保持一致）
const METADATA_VERSION: u64 = 2;

// ============================================================
// 配置与结果
// ============================================================

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebDavConfig {
    pub url: String,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub password: String,
    #[serde(default)]
    pub remote_dir: String,
    #[serde(default)]
    pub allow_insecure: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncArgs {
    pub config: WebDavConfig,
    pub content_path: String,
    pub meta_path: String,
    /// 自定义工作空间用内容文件夹名做远端子目录；默认空间为空串
    #[serde(default)]
    pub workspace_key: String,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncReport {
    pub uploaded: u32,
    pub downloaded: u32,
    pub conflicts: u32,
    pub merged_meta: u32,
    pub errors: Vec<String>,
}

// ============================================================
// HTTP 与 WebDAV 基础操作
// ============================================================

struct RemoteLayout {
    client: Client,
    origin: String,
    /// 从站点根开始的远端目录路径，如 `/dav/MaikNote/`（未编码，含首尾斜杠）
    root_raw: String,
    username: String,
    password: String,
}

fn build_client(config: &WebDavConfig) -> Result<Client, String> {
    Client::builder()
        .user_agent("MaikNote-WebDAV/1.0")
        .danger_accept_invalid_certs(config.allow_insecure)
        .danger_accept_invalid_hostnames(config.allow_insecure)
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|e| format!("初始化网络客户端失败: {}", e))
}

fn parse_origin(raw_url: &str) -> Result<(String, String), String> {
    let mut raw = raw_url.trim().to_string();
    if raw.is_empty() {
        return Err("未填写服务器地址".to_string());
    }
    if !raw.contains("://") {
        raw = format!("https://{}", raw);
    }
    let parsed = Url::parse(&raw).map_err(|e| format!("服务器地址无效: {}", e))?;
    let host = parsed.host_str().ok_or("地址缺少主机名")?.to_string();
    let origin = match parsed.port() {
        Some(port) => format!("{}://{}:{}", parsed.scheme(), host, port),
        None => format!("{}://{}", parsed.scheme(), host),
    };
    Ok((origin, parsed.path().to_string()))
}

fn build_layout(config: &WebDavConfig, workspace_key: &str) -> Result<RemoteLayout, String> {
    let (origin, base_path) = parse_origin(&config.url)?;
    let mut root_raw = base_path.trim_end_matches('/').to_string();
    root_raw.push('/');
    let remote_dir = config.remote_dir.trim().trim_matches('/');
    if !remote_dir.is_empty() {
        root_raw.push_str(remote_dir);
        root_raw.push('/');
    }
    let ws = workspace_key.trim().trim_matches('/');
    if !ws.is_empty() {
        root_raw.push_str(ws);
        root_raw.push('/');
    }
    Ok(RemoteLayout {
        client: build_client(config)?,
        origin,
        root_raw,
        username: config.username.clone(),
        password: config.password.clone(),
    })
}

impl RemoteLayout {
    fn auth(&self) -> String {
        if self.username.is_empty() {
            String::new()
        } else {
            format!("Basic {}", basic_auth_token(&self.username, &self.password))
        }
    }

    /// rel 为相对远端根目录的路径（`/` 分隔，可为空表示根目录）
    fn url_for(&self, rel: &str) -> String {
        let mut path = self.root_raw.clone();
        path.push_str(rel);
        format!("{}{}", self.origin, percent_encode_path(&path))
    }

    async fn request(&self, method: Method, url: &str, body: Option<Vec<u8>>, depth: Option<&str>) -> Result<(StatusCode, Vec<u8>), String> {
        let mut builder = self
            .client
            .request(method, url)
            .timeout(Duration::from_secs(120));
        let auth = self.auth();
        if !auth.is_empty() {
            builder = builder.header(reqwest::header::AUTHORIZATION, auth);
        }
        if let Some(depth) = depth {
            builder = builder.header("Depth", depth);
        }
        if let Some(bytes) = body {
            builder = builder.header(reqwest::header::CONTENT_TYPE, "application/xml");
            builder = builder.body(bytes);
        }
        let resp = builder.send().await.map_err(|e| format!("连接服务器失败: {}", e))?;
        let status = resp.status();
        let bytes = resp.bytes().await.map_err(|e| format!("读取响应失败: {}", e))?.to_vec();
        Ok((status, bytes))
    }

    async fn propfind(&self, rel: &str, depth: &str) -> Result<(StatusCode, String), String> {
        let method = Method::from_bytes(b"PROPFIND").map_err(|e| format!("构造 PROPFIND 失败: {}", e))?;
        let body = br#"<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getlastmodified/><d:getcontentlength/></d:prop></d:propfind>"#.to_vec();
        let (status, bytes) = self.request(method, &self.url_for(rel), Some(body), Some(depth)).await?;
        Ok((status, String::from_utf8_lossy(&bytes).to_string()))
    }

    async fn mkcol_abs(&self, abs_path: &str) -> Result<(), String> {
        let method = Method::from_bytes(b"MKCOL").map_err(|e| format!("构造 MKCOL 失败: {}", e))?;
        let url = format!("{}{}", self.origin, percent_encode_path(abs_path));
        let (status, _) = self.request(method, &url, None, None).await?;
        // 405 = 已存在，视为成功
        if status.is_success() || status == StatusCode::METHOD_NOT_ALLOWED {
            Ok(())
        } else {
            Err(format!("创建目录失败({})", status.as_u16()))
        }
    }

    /// 逐级创建远端根目录（已存在会静默跳过）
    async fn ensure_root(&self) -> Result<(), String> {
        let trimmed = self.root_raw.trim_matches('/');
        let mut acc = String::new();
        for seg in trimmed.split('/') {
            if seg.is_empty() {
                continue;
            }
            acc.push('/');
            acc.push_str(seg);
            // 忽略单级失败（多数是“已存在”），最终以 propfind 结果为准
            let _ = self.mkcol_abs(&acc).await;
        }
        Ok(())
    }

    async fn put_file(&self, rel: &str, bytes: Vec<u8>) -> Result<(), String> {
        let (status, _) = self.request(Method::PUT, &self.url_for(rel), Some(bytes), None).await?;
        if status.is_success() {
            Ok(())
        } else {
            Err(format!("上传失败({})", status.as_u16()))
        }
    }

    /// 返回 None 表示远端不存在该文件
    async fn get_file(&self, rel: &str) -> Result<Option<Vec<u8>>, String> {
        let (status, bytes) = self.request(Method::GET, &self.url_for(rel), None, None).await?;
        if status == StatusCode::NOT_FOUND {
            return Ok(None);
        }
        if status.is_success() {
            Ok(Some(bytes))
        } else {
            Err(format!("下载失败({})", status.as_u16()))
        }
    }

    /// 递归列出远端全部文件（跳过点开头的文件与清单）
    async fn walk_remote(&self) -> Result<HashMap<String, RemoteItem>, String> {
        let mut map: HashMap<String, RemoteItem> = HashMap::new();
        let mut queue = vec![String::new()];
        while let Some(dir) = queue.pop() {
            let (status, body) = self.propfind(&dir, "1").await?;
            if status == StatusCode::NOT_FOUND {
                continue;
            }
            if status != StatusCode::MULTI_STATUS && !status.is_success() {
                return Err(format!(
                    "列目录失败({})：{}",
                    status.as_u16(),
                    if dir.is_empty() { "远端根目录" } else { &dir }
                ));
            }
            for item in parse_multistatus(&body) {
                let rel = match rel_from_href(&item.href, &self.root_raw) {
                    Some(r) => r,
                    None => continue,
                };
                if rel.is_empty() || !is_safe_rel(&rel) {
                    continue;
                }
                if item.is_dir {
                    if !map.contains_key(&rel) {
                        queue.push(rel);
                    }
                } else {
                    map.insert(
                        rel,
                        RemoteItem {
                            size: item.size,
                            mtime: item.mtime,
                        },
                    );
                }
            }
        }
        Ok(map)
    }
}

fn basic_auth_token(user: &str, pass: &str) -> String {
    const TABLE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let input = format!("{}:{}", user, pass).into_bytes();
    let mut out = String::new();
    for chunk in input.chunks(3) {
        let b = [
            chunk[0],
            *chunk.get(1).unwrap_or(&0),
            *chunk.get(2).unwrap_or(&0),
        ];
        let n = ((b[0] as u32) << 16) | ((b[1] as u32) << 8) | b[2] as u32;
        out.push(TABLE[(n >> 18) as usize & 63] as char);
        out.push(TABLE[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { TABLE[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { TABLE[n as usize & 63] as char } else { '=' });
    }
    out
}

fn percent_encode_path(path: &str) -> String {
    let mut out = String::with_capacity(path.len() * 2);
    for byte in path.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' | b'!' | b'$'
            | b'&' | b'\'' | b'(' | b')' | b'*' | b'+' | b',' | b';' | b'=' | b':' | b'@' | b'/' => {
                out.push(byte as char)
            }
            _ => out.push_str(&format!("%{:02X}", byte)),
        }
    }
    out
}

fn percent_decode(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() && bytes[i + 1].is_ascii_hexdigit() && bytes[i + 2].is_ascii_hexdigit() {
            let hi = (bytes[i + 1] as char).to_digit(16).unwrap_or(0) as u8;
            let lo = (bytes[i + 2] as char).to_digit(16).unwrap_or(0) as u8;
            out.push((hi << 4) | lo);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8_lossy(&out).to_string()
}

fn xml_unescape(text: &str) -> String {
    text.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&amp;", "&")
}

/// rel 含 `..` 或以点开头的段一律拒绝（路径穿越防护）
fn is_safe_rel(rel: &str) -> bool {
    rel.split('/').all(|seg| !seg.is_empty() && seg != ".." && !seg.starts_with('.'))
}

// ============================================================
// multistatus 解析
// ============================================================

struct RawItem {
    href: String,
    is_dir: bool,
    size: u64,
    mtime: u64,
}

struct RemoteItem {
    size: u64,
    mtime: u64,
}

fn parse_multistatus(xml: &str) -> Vec<RawItem> {
    let response_re =
        Regex::new(r"(?is)<(?:[\w-]*:)?response\b[^>]*>(.*?)</(?:[\w-]*:)?response\s*>").expect("regex");
    let href_re =
        Regex::new(r"(?is)<(?:[\w-]*:)?href\b[^>]*>(.*?)</(?:[\w-]*:)?href\s*>").expect("regex");
    let lastmod_re =
        Regex::new(r"(?is)<(?:[\w-]*:)?getlastmodified\b[^>]*>(.*?)</(?:[\w-]*:)?getlastmodified\s*>").expect("regex");
    let len_re =
        Regex::new(r"(?is)<(?:[\w-]*:)?getcontentlength\b[^>]*>(.*?)</(?:[\w-]*:)?getcontentlength\s*>").expect("regex");
    let coll_re = Regex::new(r"(?is)<(?:[\w-]*:)?collection\b[^>]*(?:/>|>)").expect("regex");

    let mut items = Vec::new();
    for cap in response_re.captures_iter(xml) {
        let block = &cap[1];
        let href = match href_re.captures(block) {
            Some(c) => c[1].trim().to_string(),
            None => continue,
        };
        let is_dir = coll_re.is_match(block);
        let size = len_re
            .captures(block)
            .and_then(|c| c[1].trim().parse::<u64>().ok())
            .unwrap_or(0);
        let mtime = lastmod_re
            .captures(block)
            .and_then(|c| httpdate::parse_http_date(c[1].trim()).ok())
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        items.push(RawItem {
            href,
            is_dir,
            size,
            mtime,
        });
    }
    items
}

/// 把 href（绝对 URI 或绝对路径，百分号编码）换算成相对远端根目录的路径
fn rel_from_href(href: &str, root_raw: &str) -> Option<String> {
    let mut h = href.trim().to_string();
    if h.starts_with("http://") || h.starts_with("https://") {
        let parsed = Url::parse(&h).ok()?;
        h = parsed.path().to_string();
    }
    let mut decoded = xml_unescape(&percent_decode(&h)).replace('\\', "/");
    // 部分服务器会在 href 里出现重复斜杠，折叠成单个，避免剥前缀后留下空段
    while decoded.contains("//") {
        decoded = decoded.replace("//", "/");
    }
    let decoded = decoded.trim_end_matches('/').to_string();
    if !decoded.starts_with('/') {
        return None;
    }
    let root = root_raw.trim_end_matches('/');
    if decoded == root {
        return Some(String::new());
    }
    let prefix = format!("{}/", root);
    decoded.strip_prefix(&prefix).map(|s| s.to_string())
}

// ============================================================
// 本地扫描与清单
// ============================================================

struct LocalItem {
    path: PathBuf,
    size: u64,
    mtime: u64,
}

fn mtime_ms(meta: &std::fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn walk_local_dir(root: &Path, dir: &Path, out: &mut HashMap<String, LocalItem>) {
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || name == "node_modules" {
            continue;
        }
        let path = entry.path();
        let rel = match path.strip_prefix(root) {
            Ok(r) => r.to_string_lossy().replace(std::path::MAIN_SEPARATOR, "/"),
            Err(_) => continue,
        };
        let Ok(meta) = entry.metadata() else { continue };
        if meta.is_dir() {
            walk_local_dir(root, &path, out);
        } else if meta.is_file() {
            out.insert(
                rel,
                LocalItem {
                    path,
                    size: meta.len(),
                    mtime: mtime_ms(&meta),
                },
            );
        }
    }
}

fn walk_local(content_dir: &Path, meta_dir: &Path, split: bool) -> HashMap<String, LocalItem> {
    let mut map = HashMap::new();
    walk_local_dir(content_dir, content_dir, &mut map);
    if split {
        // 自定义空间的索引在应用配置目录，同步时挂到远端根目录
        for name in META_FILES {
            let path = meta_dir.join(name);
            if let Ok(meta) = std::fs::metadata(&path) {
                if meta.is_file() {
                    map.insert(
                        name.to_string(),
                        LocalItem {
                            path,
                            size: meta.len(),
                            mtime: mtime_ms(&meta),
                        },
                    );
                }
            }
        }
    }
    map
}

fn is_meta_rel(rel: &str) -> bool {
    !rel.contains('/') && META_FILES.contains(&rel)
}

fn local_path_for_rel(content_dir: &Path, meta_dir: &Path, rel: &str) -> PathBuf {
    let split = meta_dir != content_dir;
    if split && is_meta_rel(rel) {
        meta_dir.join(rel)
    } else {
        content_dir.join(rel)
    }
}

fn write_local(content_dir: &Path, meta_dir: &Path, rel: &str, bytes: &[u8]) -> Result<PathBuf, String> {
    let path = local_path_for_rel(content_dir, meta_dir, rel);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }
    std::fs::write(&path, bytes).map_err(|e| format!("写入文件失败: {}", e))?;
    Ok(path)
}

#[derive(Serialize, Deserialize, Clone, Copy, Default)]
struct ManifestEntry {
    local_mtime: u64,
    remote_mtime: u64,
    size: u64,
}

#[derive(Serialize, Deserialize, Default)]
struct Manifest {
    version: u32,
    files: HashMap<String, ManifestEntry>,
}

fn manifest_path(meta_dir: &Path) -> PathBuf {
    meta_dir.join(MANIFEST_NAME)
}

fn load_manifest(meta_dir: &Path) -> Manifest {
    match std::fs::read(manifest_path(meta_dir)) {
        Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_default(),
        Err(_) => Manifest::default(),
    }
}

fn save_manifest(meta_dir: &Path, manifest: &Manifest) -> Result<(), String> {
    std::fs::create_dir_all(meta_dir).map_err(|e| format!("创建目录失败: {}", e))?;
    let bytes = serde_json::to_vec_pretty(manifest).map_err(|e| format!("序列化清单失败: {}", e))?;
    std::fs::write(manifest_path(meta_dir), bytes).map_err(|e| format!("保存清单失败: {}", e))
}

// ============================================================
// 索引文件合并
// ============================================================

/// 合并带 id 的对象数组：并集按 id 去重；prefer_newer 时同 id 取 updatedAt 较新的那条。
/// 返回是否有变化。local_arr / remote_arr 都是 Value::Array。
fn merge_id_arrays(local_arr: &mut Vec<serde_json::Value>, remote_arr: &[serde_json::Value], prefer_newer: bool) -> bool {
    let mut changed = false;
    for remote_item in remote_arr {
        let Some(remote_id) = remote_item.get("id").and_then(|v| v.as_str()).map(|s| s.to_string()) else {
            continue;
        };
        let pos = local_arr
            .iter()
            .position(|item| item.get("id").and_then(|v| v.as_str()) == Some(remote_id.as_str()));
        match pos {
            None => {
                local_arr.push(remote_item.clone());
                changed = true;
            }
            Some(idx) if prefer_newer => {
                let local_updated = local_arr[idx].get("updatedAt").and_then(|v| v.as_i64()).unwrap_or(0);
                let remote_updated = remote_item.get("updatedAt").and_then(|v| v.as_i64()).unwrap_or(0);
                if remote_updated > local_updated {
                    local_arr[idx] = remote_item.clone();
                    changed = true;
                }
            }
            _ => {}
        }
    }
    changed
}

/// 合并整个索引 JSON；返回 Some(合并后的完整字节) 表示远端内容有被吸收。
/// local_bytes / remote_bytes 任一缺失时直接用存在的那份。
fn merge_meta_file(
    name: &str,
    local_bytes: &[u8],
    remote_bytes: Option<&[u8]>,
) -> Result<Option<Vec<u8>>, String> {
    let Some(remote_bytes) = remote_bytes else {
        return Ok(None);
    };
    let mut local_val: serde_json::Value =
        serde_json::from_slice(local_bytes).map_err(|e| format!("解析本地 {} 失败: {}", name, e))?;
    let remote_val: serde_json::Value =
        serde_json::from_slice(remote_bytes).map_err(|e| format!("解析远端 {} 失败: {}", name, e))?;

    let mut changed = false;
    match name {
        "metadata.json" => {
            let mut local_notes = local_val
                .get("notes")
                .and_then(|v| v.as_array().cloned())
                .unwrap_or_default();
            let remote_notes = remote_val
                .get("notes")
                .and_then(|v| v.as_array().cloned())
                .unwrap_or_default();
            if merge_id_arrays(&mut local_notes, &remote_notes, true) {
                changed = true;
            }
            local_val["notes"] = serde_json::Value::Array(local_notes);
            let local_ver = local_val.get("version").and_then(|v| v.as_u64()).unwrap_or(1);
            let remote_ver = remote_val.get("version").and_then(|v| v.as_u64()).unwrap_or(1);
            if remote_ver > local_ver {
                local_val["version"] = serde_json::Value::from(remote_ver);
                changed = true;
            }
        }
        "directories.json" => {
            let mut local_dirs = local_val
                .get("directories")
                .and_then(|v| v.as_array().cloned())
                .unwrap_or_default();
            let remote_dirs = remote_val
                .get("directories")
                .and_then(|v| v.as_array().cloned())
                .unwrap_or_default();
            if merge_id_arrays(&mut local_dirs, &remote_dirs, true) {
                changed = true;
            }
            local_val["directories"] = serde_json::Value::Array(local_dirs);
            if local_val.get("rootDirColor").is_none() {
                if let Some(color) = remote_val.get("rootDirColor") {
                    local_val["rootDirColor"] = color.clone();
                    changed = true;
                }
            }
        }
        "assistants.json" => {
            let mut local_as = local_val
                .get("assistants")
                .and_then(|v| v.as_array().cloned())
                .unwrap_or_default();
            let remote_as = remote_val
                .get("assistants")
                .and_then(|v| v.as_array().cloned())
                .unwrap_or_default();
            if merge_id_arrays(&mut local_as, &remote_as, false) {
                changed = true;
            }
            local_val["assistants"] = serde_json::Value::Array(local_as);
            for key in ["aiConfig", "baiduSearchKey"] {
                if local_val.get(key).map(|v| v.is_null()).unwrap_or(true) {
                    if let Some(v) = remote_val.get(key) {
                        local_val[key] = v.clone();
                        changed = true;
                    }
                }
            }
        }
        _ => return Ok(None),
    }
    if !changed {
        return Ok(None);
    }
    let pretty = serde_json::to_vec_pretty(&local_val).map_err(|e| format!("序列化 {} 失败: {}", name, e))?;
    Ok(Some(pretty))
}

/// 目录「相对路径 → id」映射：按 name + parentId 链拼出 rel path
fn directory_id_map(dirs_val: &serde_json::Value) -> HashMap<String, String> {
    let dirs = dirs_val
        .get("directories")
        .and_then(|v| v.as_array().cloned())
        .unwrap_or_default();
    let mut by_id: HashMap<String, (String, Option<String>)> = HashMap::new();
    for d in &dirs {
        let id = match d.get("id").and_then(|v| v.as_str()) {
            Some(s) => s.to_string(),
            None => continue,
        };
        let name = d.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let parent = d
            .get("parentId")
            .and_then(|v| if v.is_null() { None } else { v.as_str().map(|s| s.to_string()) });
        by_id.insert(id, (name, parent));
    }
    let mut out: HashMap<String, String> = HashMap::new();
    for (id, _) in &by_id {
        let mut chain: Vec<String> = Vec::new();
        let mut cur = Some(id.clone());
        let mut guard = 0;
        while let Some(cid) = cur {
            let Some((name, parent)) = by_id.get(&cid) else { break };
            chain.push(name.clone());
            cur = parent.clone();
            guard += 1;
            if guard > 32 {
                break;
            }
        }
        chain.reverse();
        out.insert(chain.join("/"), id.clone());
    }
    out
}

/// 冲突副本登记为新笔记（写进 metadata Value）
fn add_conflict_note(
    metadata_val: &mut serde_json::Value,
    dirs_val: Option<&serde_json::Value>,
    file_name: &str,
    dir_rel: Option<&str>,
    now_ms: u64,
) -> Result<(), String> {
    let id = uuid::Uuid::new_v4().to_string();
    let stem = file_name.strip_suffix(".md").unwrap_or(file_name);
    let title = stem.split('（').next().unwrap_or(stem).to_string();
    let mut note = serde_json::json!({
        "id": id,
        "title": title,
        "createdAt": now_ms,
        "updatedAt": now_ms,
        "isPinned": false,
        "isLocked": false,
        "fileName": file_name,
    });
    if let Some(rel) = dir_rel {
        if !rel.is_empty() {
            if let Some(dirs) = dirs_val {
                let map = directory_id_map(dirs);
                if let Some(dir_id) = map.get(rel) {
                    note["directoryId"] = serde_json::Value::from(dir_id.clone());
                }
            }
        }
    }
    if !metadata_val.get("notes").map(|v| v.is_array()).unwrap_or(false) {
        metadata_val["notes"] = serde_json::Value::Array(Vec::new());
    }
    if let Some(notes) = metadata_val.get_mut("notes").and_then(|v| v.as_array_mut()) {
        notes.push(note);
    }
    Ok(())
}

// ============================================================
// 时间戳工具（冲突文件名用）
// ============================================================

pub(crate) fn stamp_from_unix(secs: u64) -> String {
    let days = (secs / 86400) as i64;
    let rem = secs % 86400;
    let (h, mi, s) = (rem / 3600, (rem % 3600) / 60, rem % 60);
    // Howard Hinnant civil_from_days
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{:04}{:02}{:02}-{:02}{:02}{:02}", y, m, d, h, mi, s)
}

fn now_stamp() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    stamp_from_unix(secs)
}

// ============================================================
// 同步主流程
// ============================================================

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// 冲突副本文件名：`标题（冲突 20261117-153000）.md`，与本地/远端现有文件去重
fn conflict_file_name(dir_rel: &str, original_rel: &str, taken: &dyn Fn(&str) -> bool) -> String {
    let file = original_rel.rsplit('/').next().unwrap_or(original_rel);
    let stem = file.strip_suffix(".md").unwrap_or(file).to_string();
    let stamp = now_stamp();
    for i in 0..100u32 {
        let suffix = if i == 0 {
            format!("（冲突 {}）", stamp)
        } else {
            format!("（冲突 {}-{}）", stamp, i + 1)
        };
        let name = format!("{}{}.md", stem, suffix);
        let rel = if dir_rel.is_empty() {
            name.clone()
        } else {
            format!("{}/{}", dir_rel, name)
        };
        if !taken(&rel) {
            return name;
        }
    }
    format!("{}（冲突 {}）.md", stem, now_ms())
}

pub async fn run_sync(
    config: &WebDavConfig,
    content_dir: &Path,
    meta_dir: &Path,
    workspace_key: &str,
) -> Result<SyncReport, String> {
    let layout = build_layout(config, workspace_key)?;
    layout.ensure_root().await?;

    let remote = layout.walk_remote().await?;
    if remote.is_empty() {
        // 根目录 404 时 walk 会得到空 map；做一次深度 0 的探测来区分「空目录」和「目录不存在」
        let (status, _) = layout.propfind("", "0").await?;
        if status == StatusCode::NOT_FOUND {
            return Err("远端目录不存在且无法创建，请检查地址与权限".to_string());
        }
    }

    let split = meta_dir != content_dir;
    let local = walk_local(content_dir, meta_dir, split);
    let mut manifest = load_manifest(meta_dir);

    let mut report = SyncReport::default();
    let mut errors: Vec<String> = Vec::new();

    // 合并后的索引值：等冲突笔记登记完再统一落盘 + 上传
    let mut meta_merged: HashMap<String, serde_json::Value> = HashMap::new();
    let mut meta_changed: HashMap<String, bool> = HashMap::new();
    let mut dirs_val_cache: Option<serde_json::Value> = None;

    // 先处理索引文件（冲突登记需要 directories 映射）
    for name in META_FILES {
        let rel = name;
        let l = local.get(rel);
        let r = remote.get(rel);
        let m = manifest.files.get(rel).copied();
        match (l, r) {
            (Some(l), Some(r)) => {
                let changed_local = m.map(|m| m.local_mtime != l.mtime || m.size != l.size).unwrap_or(true);
                let changed_remote = m.map(|m| m.remote_mtime != r.mtime || m.size != r.size).unwrap_or(true);
                if !changed_local && !changed_remote {
                    continue;
                }
                let local_bytes = std::fs::read(&l.path).unwrap_or_default();
                let remote_bytes = match layout.get_file(rel).await {
                    Ok(b) => b,
                    Err(e) => {
                        errors.push(format!("读取远端 {}: {}", rel, e));
                        continue;
                    }
                };
                match merge_meta_file(rel, &local_bytes, remote_bytes.as_deref())? {
                    Some(merged) => {
                        let val: serde_json::Value = serde_json::from_slice(&merged)
                            .map_err(|e| format!("解析合并后的 {} 失败: {}", rel, e))?;
                        meta_merged.insert(rel.to_string(), val.clone());
                        meta_changed.insert(rel.to_string(), true);
                        if rel == "directories.json" {
                            dirs_val_cache = Some(val);
                        }
                        report.merged_meta += 1;
                    }
                    None => {
                        // 有变化但合并不出差异（例如只有 mtime 变了）：按较新的一方走
                        if changed_local && l.mtime >= r.mtime {
                            // 稍后在文件阶段统一上传
                        }
                    }
                }
                // 索引没有合并差异时，让文件阶段按普通规则处理
            }
            (Some(_), None) => {
                // 新索引：文件阶段按普通上传处理
            }
            (None, Some(_)) => {
                // 远端新索引：文件阶段按普通下载处理
            }
            (None, None) => {}
        }
    }

    // 需要登记的冲突笔记（文件名 → 目录）
    let mut conflict_notes: Vec<(String, Option<String>)> = Vec::new();
    // 收集普通文件阶段要补上传的合并索引之外的索引
    let mut meta_to_upload: Vec<String> = Vec::new();

    let mut rels: Vec<&String> = local.keys().chain(remote.keys()).collect();
    rels.sort();
    rels.dedup();

    for rel in rels {
        if is_meta_rel(rel) {
            continue; // 索引文件单独处理
        }
        let l = local.get(rel);
        let r = remote.get(rel);
        let m = manifest.files.get(rel).copied();

        enum Action {
            Skip,
            Upload,
            Download,
            Conflict,
            NewerWins,
        }
        let action = match (l, r) {
            (Some(l), Some(r)) => {
                let changed_local = m.map(|m| m.local_mtime != l.mtime || m.size != l.size).unwrap_or(true);
                let changed_remote = m.map(|m| m.remote_mtime != r.mtime || m.size != r.size).unwrap_or(true);
                if !changed_local && !changed_remote {
                    Action::Skip
                } else if changed_local && changed_remote {
                    if rel.ends_with(".md") {
                        Action::Conflict
                    } else {
                        Action::NewerWins
                    }
                } else if changed_local {
                    Action::Upload
                } else {
                    Action::Download
                }
            }
            (Some(l), None) => {
                // 清单里还有记录 → 远端被删；本地没改过 → 不动（不同步删除）
                if let Some(m) = m {
                    if m.local_mtime == l.mtime {
                        Action::Skip
                    } else {
                        Action::Upload
                    }
                } else {
                    Action::Upload
                }
            }
            (None, Some(r)) => {
                if let Some(m) = m {
                    if m.remote_mtime == r.mtime {
                        Action::Skip // 本地删了，远端没变：不补回
                    } else {
                        Action::Download
                    }
                } else {
                    Action::Download
                }
            }
            (None, None) => {
                manifest.files.remove(rel);
                continue;
            }
        };

        match action {
            Action::Skip => {}
            Action::Upload => {
                let Some(l) = l else { continue };
                match std::fs::read(&l.path) {
                    Ok(bytes) => match layout.put_file(rel, bytes).await {
                        Ok(()) => {
                            report.uploaded += 1;
                            manifest.files.insert(
                                rel.clone(),
                                ManifestEntry {
                                    local_mtime: l.mtime,
                                    remote_mtime: now_ms(),
                                    size: l.size,
                                },
                            );
                        }
                        Err(e) => errors.push(format!("上传 {}: {}", rel, e)),
                    },
                    Err(e) => errors.push(format!("读取 {}: {}", rel, e)),
                }
            }
            Action::Download => {
                let Some(r) = r else { continue };
                match layout.get_file(rel).await {
                    Ok(Some(bytes)) => {
                        match write_local(content_dir, meta_dir, rel, &bytes) {
                            Ok(path) => {
                                report.downloaded += 1;
                                let l_mtime = std::fs::metadata(&path)
                                    .map(|meta| mtime_ms(&meta))
                                    .unwrap_or(now_ms());
                                manifest.files.insert(
                                    rel.clone(),
                                    ManifestEntry {
                                        local_mtime: l_mtime,
                                        remote_mtime: r.mtime,
                                        size: bytes.len() as u64,
                                    },
                                );
                            }
                            Err(e) => errors.push(format!("保存 {}: {}", rel, e)),
                        }
                    }
                    Ok(None) => {}
                    Err(e) => errors.push(format!("下载 {}: {}", rel, e)),
                }
            }
            Action::NewerWins => {
                let (Some(l), Some(r)) = (l, r) else { continue };
                if l.mtime >= r.mtime {
                    match std::fs::read(&l.path) {
                        Ok(bytes) => match layout.put_file(rel, bytes).await {
                            Ok(()) => {
                                report.uploaded += 1;
                                manifest.files.insert(
                                    rel.clone(),
                                    ManifestEntry {
                                        local_mtime: l.mtime,
                                        remote_mtime: now_ms(),
                                        size: l.size,
                                    },
                                );
                            }
                            Err(e) => errors.push(format!("上传 {}: {}", rel, e)),
                        },
                        Err(e) => errors.push(format!("读取 {}: {}", rel, e)),
                    }
                } else {
                    match layout.get_file(rel).await {
                        Ok(Some(bytes)) => match write_local(content_dir, meta_dir, rel, &bytes) {
                            Ok(path) => {
                                report.downloaded += 1;
                                let l_mtime = std::fs::metadata(&path)
                                    .map(|meta| mtime_ms(&meta))
                                    .unwrap_or(now_ms());
                                manifest.files.insert(
                                    rel.clone(),
                                    ManifestEntry {
                                        local_mtime: l_mtime,
                                        remote_mtime: r.mtime,
                                        size: bytes.len() as u64,
                                    },
                                );
                            }
                            Err(e) => errors.push(format!("保存 {}: {}", rel, e)),
                        },
                        Ok(None) => {}
                        Err(e) => errors.push(format!("下载 {}: {}", rel, e)),
                    }
                }
            }
            Action::Conflict => {
                let (Some(_), Some(r)) = (l, r) else { continue };
                let dir_rel = match rel.rfind('/') {
                    Some(idx) => rel[..idx].to_string(),
                    None => String::new(),
                };
                let dir_rel_opt = if dir_rel.is_empty() { None } else { Some(dir_rel.clone()) };
                let taken = |candidate: &str| {
                    local.contains_key(candidate) || remote.contains_key(candidate)
                };
                let conflict_name = conflict_file_name(&dir_rel, rel, &taken);
                let conflict_rel = if dir_rel.is_empty() {
                    conflict_name.clone()
                } else {
                    format!("{}/{}", dir_rel, conflict_name)
                };
                match layout.get_file(rel).await {
                    Ok(Some(bytes)) => {
                        match write_local(content_dir, meta_dir, &conflict_rel, &bytes) {
                            Ok(_) => {
                                report.conflicts += 1;
                                conflict_notes.push((conflict_name.clone(), dir_rel_opt.clone()));
                                // 冲突副本也上传，另一台设备才能看到
                                match layout.put_file(&conflict_rel, bytes).await {
                                    Ok(()) => {
                                        let l_mtime = std::fs::metadata(local_path_for_rel(
                                            content_dir, meta_dir, &conflict_rel,
                                        ))
                                        .map(|meta| mtime_ms(&meta))
                                        .unwrap_or(now_ms());
                                        manifest.files.insert(
                                            conflict_rel.clone(),
                                            ManifestEntry {
                                                local_mtime: l_mtime,
                                                remote_mtime: now_ms(),
                                                size: 0,
                                            },
                                        );
                                    }
                                    Err(e) => errors.push(format!("上传 {}: {}", conflict_rel, e)),
                                }
                                // 本地这份不动，把清单对齐到远端原文件的修改时间，之后不再反复提示
                                manifest.files.insert(
                                    rel.clone(),
                                    ManifestEntry {
                                        local_mtime: l.map(|li| li.mtime).unwrap_or(0),
                                        remote_mtime: r.mtime,
                                        size: r.size,
                                    },
                                );
                            }
                            Err(e) => errors.push(format!("保存冲突副本 {}: {}", conflict_rel, e)),
                        }
                    }
                    Ok(None) => {}
                    Err(e) => errors.push(format!("下载 {}: {}", rel, e)),
                }
            }
        }
    }

    // 处理索引文件的上传 / 下载（合并在前面已经做过）
    for name in META_FILES {
        let rel = name;
        let l = local.get(rel);
        let r = remote.get(rel);
        let m = manifest.files.get(rel).copied();

        // 已在合并阶段登记过的不重复处理
        if meta_changed.contains_key(rel) {
            continue;
        }
        match (l, r) {
            (Some(l), Some(r)) => {
                let changed_local = m.map(|m| m.local_mtime != l.mtime || m.size != l.size).unwrap_or(true);
                let changed_remote = m.map(|m| m.remote_mtime != r.mtime || m.size != r.size).unwrap_or(true);
                if changed_local && !changed_remote {
                    meta_to_upload.push(rel.to_string());
                } else if changed_remote && !changed_local {
                    match layout.get_file(rel).await {
                        Ok(Some(bytes)) => match write_local(content_dir, meta_dir, rel, &bytes) {
                            Ok(path) => {
                                report.downloaded += 1;
                                let l_mtime = std::fs::metadata(&path)
                                    .map(|meta| mtime_ms(&meta))
                                    .unwrap_or(now_ms());
                                manifest.files.insert(
                                    rel.to_string(),
                                    ManifestEntry {
                                        local_mtime: l_mtime,
                                        remote_mtime: r.mtime,
                                        size: bytes.len() as u64,
                                    },
                                );
                            }
                            Err(e) => errors.push(format!("保存 {}: {}", rel, e)),
                        },
                        Ok(None) => {}
                        Err(e) => errors.push(format!("下载 {}: {}", rel, e)),
                    }
                } else if changed_local && changed_remote {
                    // 都改过但合并不出差异：取较新一方
                    if l.mtime >= r.mtime {
                        meta_to_upload.push(rel.to_string());
                    } else {
                        match layout.get_file(rel).await {
                            Ok(Some(bytes)) => match write_local(content_dir, meta_dir, rel, &bytes) {
                                Ok(path) => {
                                    report.downloaded += 1;
                                    let l_mtime = std::fs::metadata(&path)
                                        .map(|meta| mtime_ms(&meta))
                                        .unwrap_or(now_ms());
                                    manifest.files.insert(
                                        rel.to_string(),
                                        ManifestEntry {
                                            local_mtime: l_mtime,
                                            remote_mtime: r.mtime,
                                            size: bytes.len() as u64,
                                        },
                                    );
                                }
                                Err(e) => errors.push(format!("保存 {}: {}", rel, e)),
                            },
                            Ok(None) => {}
                            Err(e) => errors.push(format!("下载 {}: {}", rel, e)),
                        }
                    }
                }
            }
            (Some(_), None) => meta_to_upload.push(rel.to_string()),
            (None, Some(r)) => {
                match layout.get_file(rel).await {
                    Ok(Some(bytes)) => match write_local(content_dir, meta_dir, rel, &bytes) {
                        Ok(path) => {
                            report.downloaded += 1;
                            let l_mtime = std::fs::metadata(&path)
                                .map(|meta| mtime_ms(&meta))
                                .unwrap_or(now_ms());
                            manifest.files.insert(
                                rel.to_string(),
                                ManifestEntry {
                                    local_mtime: l_mtime,
                                    remote_mtime: r.mtime,
                                    size: bytes.len() as u64,
                                },
                            );
                        }
                        Err(e) => errors.push(format!("保存 {}: {}", rel, e)),
                    },
                    Ok(None) => {}
                    Err(e) => errors.push(format!("下载 {}: {}", rel, e)),
                }
                let _ = l;
            }
            (None, None) => {}
        }
    }

    // 冲突笔记登记进 metadata
    if !conflict_notes.is_empty() {
        let metadata_val = meta_merged.entry("metadata.json".to_string()).or_insert_with(|| {
            // 本地没有 metadata.json 时兜底造一个
            serde_json::json!({ "version": METADATA_VERSION, "notes": [] })
        });
        for (file_name, dir_rel) in &conflict_notes {
            if let Err(e) = add_conflict_note(
                metadata_val,
                dirs_val_cache.as_ref(),
                file_name,
                dir_rel.as_deref(),
                now_ms(),
            ) {
                errors.push(e);
            }
        }
        meta_changed.insert("metadata.json".to_string(), true);
    }

    // 把合并 / 登记后的索引落盘并上传
    for (rel, val) in &meta_merged {
        if !meta_changed.get(rel).copied().unwrap_or(false) {
            continue;
        }
        let bytes = match serde_json::to_vec_pretty(val) {
            Ok(b) => b,
            Err(e) => {
                errors.push(format!("序列化 {}: {}", rel, e));
                continue;
            }
        };
        match write_local(content_dir, meta_dir, rel, &bytes) {
            Ok(path) => {
                let l_mtime = std::fs::metadata(&path)
                    .map(|meta| mtime_ms(&meta))
                    .unwrap_or(now_ms());
                match layout.put_file(rel, bytes).await {
                    Ok(()) => {
                        report.uploaded += 1;
                        manifest.files.insert(
                            rel.clone(),
                            ManifestEntry {
                                local_mtime: l_mtime,
                                remote_mtime: now_ms(),
                                size: 0,
                            },
                        );
                    }
                    Err(e) => errors.push(format!("上传 {}: {}", rel, e)),
                }
            }
            Err(e) => errors.push(format!("保存 {}: {}", rel, e)),
        }
    }
    // 普通上传的索引
    for rel in meta_to_upload {
        let Some(l) = local.get(rel.as_str()) else { continue };
        match std::fs::read(&l.path) {
            Ok(bytes) => match layout.put_file(&rel, bytes).await {
                Ok(()) => {
                    report.uploaded += 1;
                    manifest.files.insert(
                        rel,
                        ManifestEntry {
                            local_mtime: l.mtime,
                            remote_mtime: now_ms(),
                            size: l.size,
                        },
                    );
                }
                Err(e) => errors.push(format!("上传 {}: {}", rel, e)),
            },
            Err(e) => errors.push(format!("读取 {}: {}", rel, e)),
        }
    }

    // 重新列一遍远端，把清单里的远端修改时间校准成服务器真实值，
    // 避免「上传后估的 mtime」与服务器实际值差几秒导致下次误判为远端有变化
    if let Ok(remote_final) = layout.walk_remote().await {
        for (rel, entry) in manifest.files.iter_mut() {
            if let Some(item) = remote_final.get(rel) {
                entry.remote_mtime = item.mtime;
                entry.size = item.size;
            }
        }
    }
    // 本地修改时间同样按磁盘实际值校准
    for (rel, entry) in manifest.files.iter_mut() {
        let path = local_path_for_rel(content_dir, meta_dir, rel);
        if let Ok(meta) = std::fs::metadata(&path) {
            entry.local_mtime = mtime_ms(&meta);
            entry.size = meta.len();
        }
    }

    // 清掉两侧都不存在的记录
    let stale: Vec<String> = manifest
        .files
        .keys()
        .filter(|rel| !local.contains_key(*rel) && !remote.contains_key(*rel))
        .cloned()
        .collect();
    for rel in stale {
        manifest.files.remove(&rel);
    }

    if let Err(e) = save_manifest(meta_dir, &manifest) {
        errors.push(e);
    }

    report.errors = errors;
    Ok(report)
}

pub async fn test_connection(config: &WebDavConfig) -> Result<String, String> {
    let layout = build_layout(config, "")?;
    let (status, _) = layout.propfind("", "0").await?;
    if status.is_success() || status == StatusCode::MULTI_STATUS {
        return Ok("连接成功".to_string());
    }
    if status == StatusCode::NOT_FOUND {
        layout.ensure_root().await?;
        let (status, _) = layout.propfind("", "0").await?;
        if status.is_success() || status == StatusCode::MULTI_STATUS {
            return Ok("连接成功（远端目录已自动创建）".to_string());
        }
        return Err(format!(
            "远端目录不存在且无法创建（HTTP {}），请检查地址与权限",
            status.as_u16()
        ));
    }
    if status == StatusCode::UNAUTHORIZED {
        return Err("认证失败（401）：请检查账号，坚果云需使用官网生成的「应用密码」".to_string());
    }
    if status == StatusCode::FORBIDDEN {
        return Err("没有访问权限（403）：请确认账号对该目录有读写权限".to_string());
    }
    Err(format!("服务器返回 HTTP {}，请检查地址是否为 WebDAV 服务", status.as_u16()))
}

// ============================================================
// Tauri 命令
// ============================================================

#[tauri::command]
pub async fn webdav_test_connection(config: WebDavConfig) -> Result<String, String> {
    test_connection(&config).await
}

#[tauri::command]
pub async fn webdav_sync_now(args: SyncArgs) -> Result<SyncReport, String> {
    let content_dir = PathBuf::from(&args.content_path);
    let meta_dir = PathBuf::from(&args.meta_path);
    run_sync(&args.config, &content_dir, &meta_dir, &args.workspace_key).await
}

// ============================================================
// 测试
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn percent_roundtrip() {
        let raw = "/dav/MaikNote/工作 目录/笔记 1.md";
        let encoded = percent_encode_path(raw);
        assert!(!encoded.contains(' '));
        assert_eq!(percent_decode(&encoded), raw);
    }

    #[test]
    fn basic_auth_matches_expected() {
        // RFC 7617 示例
        assert_eq!(basic_auth_token("Aladdin", "open sesame"), "QWxhZGRpbjpvcGVuIHNlc2FtZQ==");
    }

    #[test]
    fn parses_multistatus() {
        let xml = r#"<?xml version="1.0"?>
        <d:multistatus xmlns:d="DAV:">
          <d:response>
            <d:href>/dav/MaikNote/</d:href>
            <d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype>
            <d:getlastmodified>Tue, 17 Nov 2026 08:00:00 GMT</d:getlastmodified></d:prop></d:propstat>
          </d:response>
          <d:response>
            <d:href>/dav/MaikNote/%E5%B7%A5%E4%BD%9C/%E7%AC%94%E8%AE%B0.md</d:href>
            <d:propstat><d:prop><d:resourcetype/><d:getlastmodified>Tue, 17 Nov 2026 09:30:00 GMT</d:getlastmodified>
            <d:getcontentlength>1234</d:getcontentlength></d:prop></d:propstat>
          </d:response>
        </d:multistatus>"#;
        let items = parse_multistatus(xml);
        assert_eq!(items.len(), 2);
        let rel0 = rel_from_href(&items[0].href, "/dav/MaikNote/").unwrap();
        assert_eq!(rel0, "");
        assert!(items[0].is_dir);
        let rel1 = rel_from_href(&items[1].href, "/dav/MaikNote/").unwrap();
        assert_eq!(rel1, "工作/笔记.md");
        assert!(!items[1].is_dir);
        assert_eq!(items[1].size, 1234);
        assert!(items[1].mtime > 0);
    }

    #[test]
    fn merges_notes_union_preferring_newer() {
        let mut local = vec![
            serde_json::json!({"id": "a", "title": "A", "updatedAt": 100}),
            serde_json::json!({"id": "b", "title": "B", "updatedAt": 100}),
        ];
        let remote = vec![
            serde_json::json!({"id": "b", "title": "B2", "updatedAt": 200}),
            serde_json::json!({"id": "c", "title": "C", "updatedAt": 50}),
        ];
        assert!(merge_id_arrays(&mut local, &remote, true));
        assert_eq!(local.len(), 3);
        let b = local.iter().find(|n| n["id"] == "b").unwrap();
        assert_eq!(b["title"], "B2");
        let c = local.iter().find(|n| n["id"] == "c").unwrap();
        assert_eq!(c["title"], "C");
    }

    #[test]
    fn merge_meta_file_metadata() {
        let local = br#"{"version":2,"notes":[{"id":"a","title":"A","updatedAt":1}]}"#;
        let remote = br#"{"version":2,"notes":[{"id":"a","title":"A","updatedAt":1},{"id":"b","title":"B","updatedAt":2}]}"#;
        let merged = merge_meta_file("metadata.json", local, Some(remote)).unwrap();
        assert!(merged.is_some());
        let val: serde_json::Value = serde_json::from_slice(&merged.unwrap()).unwrap();
        assert_eq!(val["notes"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn conflict_name_dedupes() {
        let taken = |rel: &str| rel == "笔记（冲突 20261117-120000）.md";
        let name = conflict_file_name("", "笔记.md", &taken);
        assert!(name.starts_with("笔记（冲突 "));
        assert!(name.ends_with(".md"));
    }

    #[test]
    fn stamp_formats_utc() {
        // 2026-11-17 12:00:00 UTC = 1794916800
        assert_eq!(stamp_from_unix(1_794_916_800), "20261117-120000");
    }

    #[test]
    fn unsafe_rel_rejected() {
        assert!(is_safe_rel("工作/笔记.md"));
        assert!(!is_safe_rel("../etc/passwd"));
        assert!(!is_safe_rel(".maiknote-sync.json"));
        assert!(!is_safe_rel("dir/.hidden.md"));
    }

    /// 端到端联测：先用 `node scripts/webdav-test-server.mjs <目录>` 起一个本地
    /// WebDAV 服务（test/secret），再 `cargo test webdav::tests::live_sync -- --ignored`
    #[test]
    #[ignore]
    fn live_sync_against_local_server() {
        tauri::async_runtime::block_on(async {
            // 用项目内目录，避免系统 %TEMP% 的权限限制
            let base = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("target/webdav-live-test");
            let _ = std::fs::remove_dir_all(&base);
            let content = base.join("content");
            let meta = content.clone(); // 默认空间：内容与索引同目录
            std::fs::create_dir_all(&content).unwrap();

            std::fs::write(content.join("hello.md"), "# hello\n本地内容\n").unwrap();
            std::fs::write(
                content.join("metadata.json"),
                br#"{"version":2,"notes":[{"id":"a","title":"hello","createdAt":1,"updatedAt":1,"isPinned":false,"isLocked":false,"fileName":"hello.md"}]}"#,
            )
            .unwrap();

            let config = WebDavConfig {
                url: "http://127.0.0.1:5230/dav/".into(),
                username: "test".into(),
                password: "secret".into(),
                remote_dir: "MaikNote".into(),
                allow_insecure: false,
            };

            // 1. 首次同步：本地 2 个文件全部上传
            let report = run_sync(&config, &content, &meta, "").await.unwrap();
            assert_eq!(report.uploaded, 2, "first sync uploads: {:?}", report);
            assert!(report.errors.is_empty());

            // 2. 无变化再同步：零传输
            let report = run_sync(&config, &content, &meta, "").await.unwrap();
            assert_eq!((report.uploaded, report.downloaded, report.conflicts), (0, 0, 0));

            // 3. 远端被第三方修改（模拟另一台设备）→ 本地应下载
            let client = build_client(&config).unwrap();
            let url = "http://127.0.0.1:5230/dav/MaikNote/remote-new.md";
            client.put(url).basic_auth("test", Some("secret")).body("远端新建".as_bytes().to_vec()).send().await.unwrap();
            let report = run_sync(&config, &content, &meta, "").await.unwrap();
            assert_eq!(report.downloaded, 1, "download remote new file: {:?}", report);
            assert!(content.join("remote-new.md").exists());

            // 4. 双方同时改 hello.md → 冲突副本落地并登记为笔记
            std::fs::write(content.join("hello.md"), "# hello\n本地又改了\n").unwrap();
            let url = "http://127.0.0.1:5230/dav/MaikNote/hello.md";
            client.put(url).basic_auth("test", Some("secret")).body("远端也改了".as_bytes().to_vec()).send().await.unwrap();
            let report = run_sync(&config, &content, &meta, "").await.unwrap();
            assert_eq!(report.conflicts, 1, "conflict expected: {:?}", report);
            let meta_json: serde_json::Value =
                serde_json::from_slice(&std::fs::read(content.join("metadata.json")).unwrap()).unwrap();
            let notes = meta_json["notes"].as_array().unwrap();
            assert!(notes.iter().any(|n| n["fileName"].as_str().unwrap_or("").contains("冲突")));

            // 5. 测试连接
            let msg = test_connection(&config).await.unwrap();
            assert!(msg.contains("连接成功"));
        });
    }
}
