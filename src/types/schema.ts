/** Defines how a field/sensor should be rendered */
export interface SensorField {
  key: string              // dot-notation path into TelemetryPacket
  label: string
  unit?: string
  min?: number
  max?: number
  chart: boolean           // show in telemetry charts panel
  chartColor?: string
  mapOverlay?: boolean     // use as GPS coordinate field
  critical?: boolean       // highlight red when limit exceeded
  criticalMin?: number
  criticalMax?: number
  format?: 'decimal' | 'integer' | 'boolean' | 'string'
  decimalPlaces?: number
}

/** A stream source definition */
export interface StreamSource {
  id: string
  name: string
  wsUrl: string
  color: string
  reconnectMs?: number     // auto-reconnect interval, default 3000
  enabled: boolean
}

/** Top-level ground station configuration schema */
export interface GroundStationSchema {
  version: string
  missionName: string
  sources: StreamSource[]
  sensors: SensorField[]
  checklistItems: Array<{
    id: string
    category: string
    label: string
    required: boolean
    autoField?: string   // telemetry field to auto-check
    passCriteria?: string
  }>
}
