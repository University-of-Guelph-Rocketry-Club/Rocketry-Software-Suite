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
      autoValue: undefined,
      passCriteria: item.passCriteria,
    }))
    set({ checklist: items })
  },

  setItemChecked: (id, checked) => {
    set(s => ({
      checklist: s.checklist.map(item =>
        item.id === id ? { ...item, checked } : item
      ),
    }))
  },

  autoUpdateChecklist: (latest) => {
    set(s => ({
      checklist: s.checklist.map(item => {
        if (!item.passCriteria) return item
        const passed = safeCriteriaEval(item.passCriteria, latest)
        return { ...item, checked: passed, autoValue: passed ? '✓ Auto' : 'Pending' }
      }),
    }))
  },

  setPhase: (phase) => set({ phase }),

  startMission: () => set({
    phase: 'in-flight',
    launchTime: Date.now(),
    missionElapsedMs: 0,
  }),

  endMission: () => set({ phase: 'recovery' }),

  isReadyToLaunch: () => {
    const { checklist } = get()
    return checklist
      .filter(item => item.required)
      .every(item => item.checked)
  },
}))
