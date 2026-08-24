/**
 * Subscribes to the battery telemetry WebSocket and keeps the connection alive.
 *
 * The browser's WebSocket does not reconnect on its own: once the socket
 * closes it stays closed. This hook detects the close and retries with
 * exponential backoff (1s, 2s, 4s, ... capped at 30s) so a brief network drop
 * heals itself, while a genuine backend outage is not hammered with one
 * request per second from every open dashboard.
 */
import { useEffect, useRef, useState } from 'react'

import type { BatteryData, ConnectionStatus } from '../types'

export const INITIAL_RECONNECT_DELAY_MS = 1_000
export const MAX_RECONNECT_DELAY_MS = 30_000

export interface BatteryStream {
  /** Latest reading, or null until the first frame arrives. */
  data: BatteryData | null
  status: ConnectionStatus
  /** Consecutive failed attempts; 0 whenever the socket is open. */
  reconnectAttempt: number
}

/** Exponential backoff with a ceiling. Attempt is 1-based. */
export function backoffDelay(attempt: number): number {
  const delay = INITIAL_RECONNECT_DELAY_MS * 2 ** (attempt - 1)
  return Math.min(delay, MAX_RECONNECT_DELAY_MS)
}

export function useBatteryStream(url: string): BatteryStream {
  const [data, setData] = useState<BatteryData | null>(null)
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [reconnectAttempt, setReconnectAttempt] = useState(0)

  // Refs, not state: none of these should trigger a re-render, and the
  // callbacks below need the current value rather than a captured one.
  const socketRef = useRef<WebSocket | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const attemptRef = useRef(0)
  const unmountedRef = useRef(false)

  useEffect(() => {
    unmountedRef.current = false
    attemptRef.current = 0

    const scheduleReconnect = () => {
      attemptRef.current += 1
      setReconnectAttempt(attemptRef.current)
      setStatus('reconnecting')
      timerRef.current = setTimeout(connect, backoffDelay(attemptRef.current))
    }

    function connect() {
      // StrictMode in development mounts, unmounts and remounts. The cleanup
      // below sets this flag, so a socket opened by a discarded effect run
      // never schedules work for the live one.
      if (unmountedRef.current) return

      const socket = new WebSocket(url)
      socketRef.current = socket

      socket.onopen = () => {
        attemptRef.current = 0
        setReconnectAttempt(0)
        setStatus('live')
      }

      socket.onmessage = (event: MessageEvent<string>) => {
        try {
          setData(JSON.parse(event.data) as BatteryData)
        } catch {
          // A malformed frame must not tear down a healthy connection.
          console.warn('Discarded malformed battery frame')
        }
      }

      // onerror is always followed by onclose, so recovery is handled in one
      // place rather than risking two overlapping reconnect timers.
      socket.onclose = () => {
        if (unmountedRef.current) return
        scheduleReconnect()
      }
    }

    connect()

    return () => {
      unmountedRef.current = true
      if (timerRef.current) clearTimeout(timerRef.current)
      socketRef.current?.close()
      socketRef.current = null
    }
  }, [url])

  return { data, status, reconnectAttempt }
}
