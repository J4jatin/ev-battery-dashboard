import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MockWebSocket } from '../test/mockWebSocket'
import type { BatteryData } from '../types'
import {
  INITIAL_RECONNECT_DELAY_MS,
  MAX_RECONNECT_DELAY_MS,
  backoffDelay,
  useBatteryStream,
} from './useBatteryStream'

const URL = 'ws://localhost:8000/ws/battery'

const reading: BatteryData = {
  soc: 73,
  soh: 91,
  voltage: 396,
  current: -12.5,
  temperature: 28,
  power: 4.95,
  cycle_count: 247,
  estimated_range: 233.6,
  timestamp: 1_700_000_000,
}

beforeEach(() => {
  MockWebSocket.reset()
  vi.stubGlobal('WebSocket', MockWebSocket)
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('backoffDelay', () => {
  it('doubles on each attempt', () => {
    expect(backoffDelay(1)).toBe(INITIAL_RECONNECT_DELAY_MS)
    expect(backoffDelay(2)).toBe(2_000)
    expect(backoffDelay(3)).toBe(4_000)
    expect(backoffDelay(4)).toBe(8_000)
  })

  it('never exceeds the ceiling, so an outage is not hammered', () => {
    expect(backoffDelay(20)).toBe(MAX_RECONNECT_DELAY_MS)
    expect(backoffDelay(100)).toBe(MAX_RECONNECT_DELAY_MS)
  })
})

describe('useBatteryStream', () => {
  it('opens a socket against the supplied url', () => {
    renderHook(() => useBatteryStream(URL))

    expect(MockWebSocket.instances).toHaveLength(1)
    expect(MockWebSocket.last.url).toBe(URL)
  })

  it('starts out connecting and has no data yet', () => {
    const { result } = renderHook(() => useBatteryStream(URL))

    expect(result.current.status).toBe('connecting')
    expect(result.current.data).toBeNull()
  })

  it('reports live once the socket opens', () => {
    const { result } = renderHook(() => useBatteryStream(URL))

    act(() => MockWebSocket.last.serverOpen())

    expect(result.current.status).toBe('live')
  })

  it('exposes the parsed reading from an incoming frame', () => {
    const { result } = renderHook(() => useBatteryStream(URL))

    act(() => {
      MockWebSocket.last.serverOpen()
      MockWebSocket.last.serverSend(reading)
    })

    expect(result.current.data).toEqual(reading)
  })

  it('discards a malformed frame without dropping the connection', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { result } = renderHook(() => useBatteryStream(URL))

    act(() => {
      MockWebSocket.last.serverOpen()
      MockWebSocket.last.serverSend(reading)
      MockWebSocket.last.serverSendRaw('{not json')
    })

    expect(result.current.status).toBe('live')
    expect(result.current.data).toEqual(reading)
    expect(warn).toHaveBeenCalled()
  })

  it('flags reconnecting as soon as the connection drops', () => {
    const { result } = renderHook(() => useBatteryStream(URL))

    act(() => MockWebSocket.last.serverOpen())
    act(() => MockWebSocket.last.serverClose())

    expect(result.current.status).toBe('reconnecting')
    expect(result.current.reconnectAttempt).toBe(1)
  })

  it('opens a fresh socket after the first backoff elapses', () => {
    renderHook(() => useBatteryStream(URL))

    act(() => MockWebSocket.last.serverOpen())
    act(() => MockWebSocket.last.serverClose())
    expect(MockWebSocket.instances).toHaveLength(1)

    act(() => {
      vi.advanceTimersByTime(INITIAL_RECONNECT_DELAY_MS)
    })

    expect(MockWebSocket.instances).toHaveLength(2)
  })

  it('does not retry before the backoff has elapsed', () => {
    renderHook(() => useBatteryStream(URL))

    act(() => MockWebSocket.last.serverClose())
    act(() => {
      vi.advanceTimersByTime(INITIAL_RECONNECT_DELAY_MS - 1)
    })

    expect(MockWebSocket.instances).toHaveLength(1)
  })

  it('backs off further on each successive failure', () => {
    const { result } = renderHook(() => useBatteryStream(URL))

    act(() => MockWebSocket.last.serverClose())
    act(() => {
      vi.advanceTimersByTime(1_000)
    })
    expect(result.current.reconnectAttempt).toBe(1)

    act(() => MockWebSocket.last.serverClose())
    expect(result.current.reconnectAttempt).toBe(2)

    // The second wait is 2s, so 1s must not be enough.
    act(() => {
      vi.advanceTimersByTime(1_000)
    })
    expect(MockWebSocket.instances).toHaveLength(2)

    act(() => {
      vi.advanceTimersByTime(1_000)
    })
    expect(MockWebSocket.instances).toHaveLength(3)
  })

  it('resets the attempt counter once the connection is restored', () => {
    const { result } = renderHook(() => useBatteryStream(URL))

    act(() => MockWebSocket.last.serverClose())
    act(() => {
      vi.advanceTimersByTime(1_000)
    })
    expect(result.current.reconnectAttempt).toBe(1)

    act(() => MockWebSocket.last.serverOpen())

    expect(result.current.status).toBe('live')
    expect(result.current.reconnectAttempt).toBe(0)
  })

  it('closes the socket on unmount', () => {
    const { unmount } = renderHook(() => useBatteryStream(URL))
    const socket = MockWebSocket.last

    unmount()

    expect(socket.closedByClient).toBe(true)
  })

  it('does not reconnect after unmount', () => {
    const { unmount } = renderHook(() => useBatteryStream(URL))
    const socket = MockWebSocket.last

    unmount()
    act(() => socket.serverClose())
    act(() => {
      vi.advanceTimersByTime(MAX_RECONNECT_DELAY_MS)
    })

    expect(MockWebSocket.instances).toHaveLength(1)
  })

  it('cancels a pending retry timer on unmount', () => {
    const { unmount } = renderHook(() => useBatteryStream(URL))

    act(() => MockWebSocket.last.serverClose())
    unmount()
    act(() => {
      vi.advanceTimersByTime(MAX_RECONNECT_DELAY_MS)
    })

    expect(MockWebSocket.instances).toHaveLength(1)
  })
})
