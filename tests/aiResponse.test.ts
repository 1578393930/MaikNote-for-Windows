import { describe, it, expect } from 'vitest'
import { consumeAiResponse } from '@/utils/aiResponse'

describe('AI response parsing', () => {
  it('retains split UTF-8 characters and SSE lines', async () => {
    const data = new TextEncoder().encode('data: {"choices":[{"delta":{"content":"中文"}}]}\r\n\r\ndata: [DONE]')
    const stream = new ReadableStream({ start(controller) {
      for (const byte of data) controller.enqueue(new Uint8Array([byte]))
      controller.close()
    } })
    let result = ''
    await consumeAiResponse(new Response(stream), piece => { result += piece }, new AbortController().signal)
    expect(result).toBe('中文')
  })

  it('accepts JSON even when a relay omits content-type', async () => {
    let result = ''
    await consumeAiResponse(new Response('{"choices":[{"message":{"content":"answer"}}]}'), piece => { result += piece }, new AbortController().signal)
    expect(result).toBe('answer')
  })

  it('cancels a blocked stream and emits no late result', async () => {
    const controller = new AbortController()
    const response = new Response(new ReadableStream({ start() {} }))
    const task = consumeAiResponse(response, () => { throw new Error('unexpected result') }, controller.signal)
    controller.abort()
    await expect(task).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('reports relay errors in successful HTTP responses', async () => {
    await expect(consumeAiResponse(new Response('{"error":{"message":"quota exhausted"}}'), () => {}, new AbortController().signal)).rejects.toThrow('quota exhausted')
  })
})
