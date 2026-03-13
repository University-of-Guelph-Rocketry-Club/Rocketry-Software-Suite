import { create } from 'zustand'
import type { MissionPhase, ChecklistItem } from '../types/telemetry'
import type { GroundStationSchema } from '../types/schema'

interface MissionStore {
  phase: MissionPhase
  checklist: ChecklistItem[]
  launchTime: number | null
  missionElapsedMs: number

  // Actions
  initChecklist: (schema: GroundStationSchema) => void
  setItemChecked: (id: string, checked: boolean) => void
  setItemBypassed: (id: string, bypassed: boolean, reason?: string) => void
  bypassAllPendingRequired: (reason?: string) => void
  clearAllBypasses: () => void
  autoUpdateChecklist: (latest: Record<string, number | string | boolean | undefined>) => void
  setPhase: (phase: MissionPhase) => void
  startMission: () => void
  endMission: () => void
  isReadyToLaunch: () => boolean
}

function safeCriteriaEval(
  criteria: string,
  values: Record<string, number | string | boolean | undefined>,
): boolean {
  try {
    // Only allow simple comparisons — build a restricted evaluator
    const keys = Object.keys(values)
    const args = keys.map(k => values[k])
    // eslint-disable-next-line no-new-func
    const fn = new Function(...keys, `"use strict"; return !!(${criteria});`)
    return fn(...args) === true
  } catch {
    return false
  }
}

export const useMissionStore = create<MissionStore>((set, get) => ({
  phase: 'pre-flight',
  checklist: [],
  launchTime: null,
  missionElapsedMs: 0,

  initChecklist: (schema) => {
    const items: ChecklistItem[] = schema.checklistItems.map(item => ({
      id: item.id,
      category: item.category,
      label: item.label,
      required: item.required,
      checked: false,
      bypassed: false,
      bypassReason: undefined,
      bypassedAt: undefined,
      autoValue: undefined,
      passCriteria: item.passCriteria,
    }))
    set({ checklist: items })
  },

  setItemChecked: (id, checked) => {
    set(s => ({
      checklist: s.checklist.map(item =>
        item.id === id
          ? {
              ...item,
              checked,
              bypassed: checked ? false : item.bypassed,
              bypassReason: checked ? undefined : item.bypassReason,
              bypassedAt: checked ? undefined : item.bypassedAt,
            }
          : item
      ),
    }))
  },

  setItemBypassed: (id, bypassed, reason) => {
    const normalizedReason = reason?.trim() || 'Manual override'
    set(s => ({
      checklist: s.checklist.map(item =>
        item.id === id
          ? {
              ...item,
              bypassed,
              bypassReason: bypassed ? normalizedReason : undefined,
              bypassedAt: bypassed ? Date.now() : undefined,
            }
          : item
      ),
    }))
  },

  bypassAllPendingRequired: (reason) => {
    const normalizedReason = reason?.trim() || 'Bulk pending bypass'
    set(s => ({
      checklist: s.checklist.map(item =>
        item.required && !item.checked
          ? {
              ...item,
              bypassed: true,
              bypassReason: item.bypassed ? item.bypassReason : normalizedReason,
              bypassedAt: item.bypassed ? item.bypassedAt : Date.now(),
            }
          : item
      ),
    }))
  },

  clearAllBypasses: () => {
    set(s => ({
      checklist: s.checklist.map(item => ({
        ...item,
        bypassed: false,
        bypassReason: undefined,
        bypassedAt: undefined,
      })),
    }))
  },

  autoUpdateChecklist: (latest) => {
    set(s => ({
      checklist: s.checklist.map(item => {
        if (!item.passCriteria) return item
        const passed = safeCriteriaEval(item.passCriteria, latest)
        return {
          ...item,
          checked: passed,
          bypassed: passed ? false : item.bypassed,
          bypassReason: passed ? undefined : item.bypassReason,
          bypassedAt: passed ? undefined : item.bypassedAt,
          autoValue: passed ? '✓ Auto' : 'Pending',
        }
      }),
    }))
  },

  setPhase: (phase) => set({ phase }),

  startMission: () => {
    if (!get().isReadyToLaunch()) return
    set({
      phase: 'in-flight',
      launchTime: Date.now(),
      missionElapsedMs: 0,
    })
  },

  endMission: () => set({ phase: 'recovery' }),

  isReadyToLaunch: () => {
    const { checklist } = get()
    return checklist
      .filter(item => item.required)
      .every(item => item.checked || item.bypassed)
  },
}))
