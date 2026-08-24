/** Shared data contracts between the FastAPI backend and this dashboard. */

/** A single pack-level telemetry reading pushed over the WebSocket. */
export interface BatteryData {
  /** State of Charge, %. How full the pack is right now. */
  soc: number
  /** State of Health, %. Capacity remaining relative to a new pack. */
  soh: number
  /** Pack voltage, V. */
  voltage: number
  /** Pack current, A. Negative while discharging (BMS sign convention). */
  current: number
  /** Pack temperature, degrees Celsius. */
  temperature: number
  /** Instantaneous power, kW. */
  power: number
  /** Completed charge/discharge cycles over the pack's life. */
  cycle_count: number
  /** Estimated remaining driving range, km. */
  estimated_range: number
  /** Unix timestamp, seconds. */
  timestamp: number
}

/** One hourly point on the 24-hour history chart. */
export interface HistoryPoint {
  hour: string
  soc: number
  temperature: number
  energy: number
}

/** Health of an individual cell within the pack. */
export interface CellData {
  id: number
  voltage: number
  temperature: number
  status: CellStatus
}

export type CellStatus = 'normal' | 'warning'

/** Lifecycle of the live telemetry connection, surfaced in the UI. */
export type ConnectionStatus = 'connecting' | 'live' | 'reconnecting'

/**
 * Summary stats for one real Li-ion cell in the bundled NASA PCoE
 * degradation dataset. Unlike everything above, this is not simulated.
 */
export interface BatterySummary {
  battery_id: string
  initial_capacity_ah: number
  final_capacity_ah: number
  capacity_fade_percent: number
  cycle_count: number
  ambient_temperature_c: number
  source: string
}

/** One lab-measured discharge cycle's capacity and derived SOH for a real cell. */
export interface DegradationCycle {
  cycle_index: number
  capacity_ah: number
  soh_percent: number
}
