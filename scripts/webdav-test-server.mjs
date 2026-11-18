#!/usr/bin/env node
/**
 * 迷你 WebDAV 测试服务器（仅用于本地联测 webdav.rs）。
 *
 * 用法：node scripts/webdav-test-server.mjs <数据根目录> [端口]
 * 账号：test / secret（Basic 认证）
 *
 * 支持：PROPFIND(depth 0/1)、GET、PUT、MKCOL、DELETE、OPTIONS
 * 鉴权失败返回 401。目录以 PROPFIND 的 multistatus XML 返回。
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(process.argv[2] || './.webdav-test-root')
const PORT = Number(process.argv[3] || 5230)
const USER = 'test'
const PASS = 'secret'

fs.mkdirSync(ROOT, { recursive: true })

function authOk(req) {
  const header = req.headers.authorization || ''
  if (!header.startsWith('Basic ')) return false
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8')
  const idx = decoded.indexOf(':')
  return decoded.slice(0, idx) === USER && decoded.slice(idx + 1) === PASS
}

function safeJoin(urlPath) {
  const rel = decodeURIComponent(urlPath).split('/').filter(Boolean)
  if (rel.some(seg => seg === '..' || seg.startsWith('.'))) return null
  return path.join(ROOT, ...rel)
}

function rfc1123(ms) {
  return new Date(ms).toUTCString()
}

function propXml(fullPath, hrefPath, depth1) {
  const stat = fs.statSync(fullPath)
  const isDir = stat.isDirectory()
  const href = encodeURI((hrefPath.endsWith('/') || !isDir ? hrefPath : hrefPath + '/').replace(/\/{2,}/g, '/'))
  const parts = []
  parts.push(`  <d:response>`)
  parts.push(`    <d:href>${href}</d:href>`)
  parts.push(`    <d:propstat>`)
  parts.push(`      <d:prop>`)
  if (isDir) parts.push(`        <d:resourcetype><d:collection/></d:resourcetype>`)
  else parts.push(`        <d:resourcetype/>`)
  parts.push(`        <d:getlastmodified>${rfc1123(stat.mtimeMs)}</d:getlastmodified>`)
  if (!isDir) parts.push(`        <d:getcontentlength>${stat.size}</d:getcontentlength>`)
  parts.push(`      </d:prop>`)
  parts.push(`      <d:status>HTTP/1.1 200 OK</d:status>`)
  parts.push(`    </d:propstat>`)
  parts.push(`  </d:response>`)
  let xml = parts.join('\n')
  if (isDir && depth1) {
    for (const name of fs.readdirSync(fullPath)) {
      if (name.startsWith('.')) continue
      xml += '\n' + propXml(path.join(fullPath, name), hrefPath + '/' + name, false)
    }
  }
  return xml
}

const server = http.createServer((req, res) => {
  if (!authOk(req)) {
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="test"' })
    res.end('auth required')
    return
  }
  const target = safeJoin(req.url)
  if (!target) {
    res.writeHead(403)
    res.end('bad path')
    return
  }
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(200, { DAV: '1', Allow: 'OPTIONS, GET, PUT, PROPFIND, MKCOL, DELETE' })
      res.end()
    } else if (req.method === 'PROPFIND') {
      if (!fs.existsSync(target)) {
        res.writeHead(404)
        res.end()
        return
      }
      const depth = (req.headers.depth || '1').trim()
      const urlPath = req.url.endsWith('/') ? req.url : req.url + '/'
      let body = `<?xml version="1.0"?>\n<d:multistatus xmlns:d="DAV:">\n`
      body += propXml(target, urlPath, depth !== '0')
      body += `\n</d:multistatus>`
      res.writeHead(207, { 'Content-Type': 'application/xml' })
      res.end(body)
    } else if (req.method === 'GET') {
      if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
        res.writeHead(404)
        res.end()
        return
      }
      const stat = fs.statSync(target)
      res.writeHead(200, { 'Content-Length': stat.size, 'Last-Modified': rfc1123(stat.mtimeMs) })
      fs.createReadStream(target).pipe(res)
    } else if (req.method === 'PUT') {
      fs.mkdirSync(path.dirname(target), { recursive: true })
      const chunks = []
      req.on('data', c => chunks.push(c))
      req.on('end', () => {
        fs.writeFileSync(target, Buffer.concat(chunks))
        res.writeHead(201)
        res.end()
      })
    } else if (req.method === 'MKCOL') {
      if (fs.existsSync(target)) {
        res.writeHead(405)
        res.end()
        return
      }
      fs.mkdirSync(target, { recursive: true })
      res.writeHead(201)
      res.end()
    } else if (req.method === 'DELETE') {
      if (!fs.existsSync(target)) {
        res.writeHead(404)
        res.end()
        return
      }
      fs.rmSync(target, { recursive: true })
      res.writeHead(204)
      res.end()
    } else {
      res.writeHead(405)
      res.end()
    }
  } catch (err) {
    res.writeHead(500)
    res.end(String(err))
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`mini webdav on http://127.0.0.1:${PORT}/ root=${ROOT}`)
})
