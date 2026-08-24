import { useEffect, useState } from 'react'

import { fetchDegradationCycles, fetchDegradationSummary } from '../api'
import type { BatterySummary, DegradationCycle } from '../types'

interface DegradationHistoryState {
  batteries: BatterySummary[]
  selectedBatteryId: string | null
  cycles: DegradationCycle[]
  isLoading: boolean
  selectBattery: (batteryId: string) => void
}

/**
 * Loads the bundled real-battery dataset: the list of available cells, then
 * the full cycle history for whichever one is selected. Separate from
 * `useBatteryStream` on purpose — this is historical reference data fetched
 * once per selection, not a live feed.
 */
export function useDegradationHistory(): DegradationHistoryState {
  const [batteries, setBatteries] = useState<BatterySummary[]>([])
  const [selectedBatteryId, setSelectedBatteryId] = useState<string | null>(null)
  const [cycles, setCycles] = useState<DegradationCycle[]>([])
  const [hasLoadedSummary, setHasLoadedSummary] = useState(false)
  // The battery whose cycles are currently reflected in `cycles`. Comparing
  // this to `selectedBatteryId` derives loading state instead of a separate
  // isLoading flag set synchronously inside the effect, which would trigger
  // an avoidable extra render on every selection change.
  const [loadedBatteryId, setLoadedBatteryId] = useState<string | null>(null)

  // Fetch the battery list once on mount, then default the selection to the
  // first entry.
  useEffect(() => {
    const controller = new AbortController()

    fetchDegradationSummary(controller.signal)
      .then((result) => {
        setBatteries(result)
        setSelectedBatteryId((current) => current ?? result[0]?.battery_id ?? null)
        setHasLoadedSummary(true)
      })
      .catch(() => undefined)

    return () => controller.abort()
  }, [])

  // Fetch the cycle history whenever the selected battery changes. Guarded
  // with an `ignore` flag (not just AbortController) so a fast selection
  // change can never let a stale response overwrite a newer one.
  useEffect(() => {
    if (!selectedBatteryId) {
      return
    }

    let ignore = false
    const controller = new AbortController()

    fetchDegradationCycles(selectedBatteryId, controller.signal)
      .then((result) => {
        if (!ignore) {
          setCycles(result)
          setLoadedBatteryId(selectedBatteryId)
        }
      })
      .catch(() => undefined)

    return () => {
      ignore = true
      controller.abort()
    }
  }, [selectedBatteryId])

  return {
    batteries,
    selectedBatteryId,
    cycles,
    isLoading: !hasLoadedSummary || (selectedBatteryId !== null && loadedBatteryId !== selectedBatteryId),
    selectBattery: setSelectedBatteryId,
  }
}
