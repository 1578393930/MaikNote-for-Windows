import { fetch } from '@tauri-apps/plugin-http'

interface AiRequestConfig {
  url: string
  key: string
  model: string
}

// 使用桌面原生 HTTP 通道，避免中转服务的浏览器跨域预检限制。
export async function requestAiChat(
  config: AiRequestConfig,
  messages: Array<{ role: string; content: string }>,
  signal: AbortSignal,
): Promise<Response> {
  const response = await fetch(config.url.trim(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.key.trim()}`,
    },
    body: JSON.stringify({
      model: config.model.trim(),
      messages,
      temperature: 0.7,
      stream: true,
    }),
    signal,
  })

  if (!response.ok) {
    throw new Error(`API错误: ${response.status}`)
  }
  return response
}
