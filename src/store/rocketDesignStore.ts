import { create } from 'zustand'

export interface RocketDesignSummary {
  fileName: string
  fileType: 'ork' | 'rkt'
  rocketName: string
  stageCount: number
  bodyTubeCount: number
  finSetCount: number
  finCount: number
  totalLengthMm: number | null
  maxDiameterMm: number | null
  dryMassG: number | null
  sourceVersion?: string
  importedAt: number
}

interface RocketDesignStore {
  design: RocketDesignSummary | null
  importError: string | null
  setDesign: (design: RocketDesignSummary | null) => void
  setImportError: (message: string | null) => void
  clearDesign: () => void
}

export const useRocketDesignStore = create<RocketDesignStore>((set) => ({
  design: null,
  importError: null,
  setDesign: (design) => set({ design, importError: null }),
  setImportError: (message) => set({ importError: message }),
  clearDesign: () => set({ design: null, importError: null }),
}))