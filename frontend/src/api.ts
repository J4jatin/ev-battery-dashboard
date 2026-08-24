/**
 * Backend configuration and typed REST helpers.
 *
 * The backend origin is supplied once via the VITE_API_URL environment
 * variable. The WebSocket URL is derived from it rather than written out a
 * second time, so http/https and ws/wss can never drift apart.
 */
import type { BatterySummary, CellData, DegradationCycle, HistoryPoint } from './types'

const DEFAULT_API_URL = 'http://localhost:8000'

/** Strip any trailing slashes so path joining stays predictable. */
const stripTrailingSlash = (url: string): string => url.replace(/\/+$/, '')

export const API_URL = stripTrailingSlash(
  import.meta.env.VITE_API_URL ?? DEFAULT_API_URL,
)

/**
 * Convert an HTTP origin into the battery stream's WebSocket URL.
 * `http` becomes `ws` and `https` becomes `wss`.
 */
export function toWebSocketUrl(httpUrl: string): string {
  return `${stripTrailingSlash(httpUrl).replace(/^http/, 'ws')}/ws/battery`
}

export const WS_URL = toWebSocketUrl(API_URL)

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { signal })
  if (!response.ok) {
    throw new Error(`Request to ${path} failed with ${response.status}`)
  }
  return (await response.json()) as T
}

export const fetchHistory = (signal?: AbortSignal): Promise<HistoryPoint[]> =>
  getJson<HistoryPoint[]>('/api/battery/history', signal)

export const fetchCells = (signal?: AbortSignal): Promise<CellData[]> =>
  getJson<CellData[]>('/api/battery/cells', signal)

export const fetchDegradationSummary = (signal?: AbortSignal): Promise<BatterySummary[]> =>
  getJson<BatterySummary[]>('/api/battery/degradation', signal)

export const fetchDegradationCycles = (
  batteryId: string,
  signal?: AbortSignal,
): Promise<DegradationCycle[]> =>
  getJson<DegradationCycle[]>(`/api/battery/degradation/${batteryId}`, signal)
