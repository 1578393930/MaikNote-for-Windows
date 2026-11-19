// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetch } from '@tauri-apps/plugin-http'
import { requestAiChat } from '@/utils/aiRequest'

vi.mock('@tauri-apps/plugin-http', () => ({ fetch: vi.fn() }))

const config = { url: 'https://relay.example/v1/chat/completions', key: 'test-key', model: 'test-model' }
const messages = [{ role: 'user', content: '测试' }]

afterEach(() => vi.restoreAllMocks())

describe('AI 原生 HTTP 请求', () => {
  it('浏览器 fetch 不可用时仍使用原生通道，保留流式响应和取消信号', async () => {
    const browserFetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    const controller = new AbortController()
    const response = new Response('data: {"choices":[{"delta":{"content":"你好"}}]}\n\ndata: [DONE]\n\n')
    vi.mocked(fetch).mockResolvedValue(response)

    const result = await requestAiChat(config, messages, controller.signal)

    expect(browserFetch).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledWith(config.url, expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-key' },
      signal: controller.signal,
    }))
    const init = vi.mocked(fetch).mock.calls.at(-1)![1]!
    expect(JSON.parse(init.body as string)).toMatchObject({ model: config.model, messages, stream: true })
    expect(result).toBe(response)
    expect(await result.text()).toContain('你好')
  })

  it('将服务端鉴权错误保留为 HTTP 状态码', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('', { status: 401 }))
    await expect(requestAiChat(config, messages, new AbortController().signal)).rejects.toThrow('API错误: 401')
  })
})
