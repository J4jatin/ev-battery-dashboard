import { describe, expect, it } from 'vitest'

import { toWebSocketUrl } from './api'

describe('toWebSocketUrl', () => {
  it('upgrades a plain http origin to ws', () => {
    expect(toWebSocketUrl('http://localhost:8000')).toBe('ws://localhost:8000/ws/battery')
  })

  it('upgrades a secure https origin to wss', () => {
    expect(toWebSocketUrl('https://api.example.com')).toBe('wss://api.example.com/ws/battery')
  })

  it('does not leave a double slash when the origin has a trailing slash', () => {
    expect(toWebSocketUrl('https://api.example.com/')).toBe('wss://api.example.com/ws/battery')
  })

  it('keeps a port and a path prefix intact', () => {
    expect(toWebSocketUrl('http://127.0.0.1:8000')).toBe('ws://127.0.0.1:8000/ws/battery')
  })
})
