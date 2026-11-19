import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

describe('AI editor window capabilities', () => {
  for (const [file, label] of [['default', 'main'], ['edge', 'edge']]) {
    it(`${label} allows native HTTP including streaming and cancellation`, () => {
      const capability = JSON.parse(readFileSync(`src-tauri/capabilities/${file}.json`, 'utf8'))
      expect(capability.windows).toContain(label)
      // The default set includes fetch, send, stream read, and cancellation.
      expect(capability.permissions).toContain('http:default')
      const scope = capability.permissions.find((p: any) => p.identifier === 'http:allow-fetch')
      expect(scope.allow).toEqual(expect.arrayContaining([{ url: 'https://*' }, { url: 'http://*' }]))
    })
  }
})
