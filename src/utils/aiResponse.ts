/** Read ordinary chat completions and SSE, retaining partial UTF-8 characters and lines. */
export async function consumeAiResponse(response: Response, onPiece: (piece: string) => void, signal: AbortSignal) {
  const consume = (data: string) => {
    signal.throwIfAborted()
    if (!data.trim() || data.trim() === '[DONE]') return
    const parsed = JSON.parse(data)
    if (parsed.error) throw new Error(parsed.error.message || String(parsed.error))
    const choice = parsed.choices?.[0]
    const piece = choice?.delta?.content ?? choice?.message?.content ?? choice?.text
    if (typeof piece === 'string' && piece) onPiece(piece)
  }
  if (response.headers.get('content-type')?.includes('application/json')) {
    consume(await response.text())
    return
  }
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Empty AI response body')
  const cancel = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener('abort', cancel, { once: true })
  const decoder = new TextDecoder()
  let buffer = ''
  let format: 'json' | 'sse' | undefined
  try {
    signal.throwIfAborted()
    while (true) {
      const { done, value } = await reader.read()
      signal.throwIfAborted()
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
      if (!format && buffer.trim()) format = buffer.trimStart().startsWith('{') ? 'json' : 'sse'
      if (format === 'sse') {
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) if (line.startsWith('data:')) consume(line.slice(5).trim())
      }
      if (done) break
    }
    if (format === 'json') consume(buffer)
    else if (buffer.startsWith('data:')) consume(buffer.slice(5).trim())
  } finally {
    signal.removeEventListener('abort', cancel)
    reader.releaseLock()
  }
}
