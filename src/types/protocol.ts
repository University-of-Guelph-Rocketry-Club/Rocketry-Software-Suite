// Protocol schema types — must stay in sync with src-tauri/src/protocol.rs

export type FieldType =
  | 'uint8' | 'uint16' | 'uint32'
  | 'int8'  | 'int16'  | 'int32'
  | 'float32' | 'float64' | 'bool'

export type ProtocolType = 'binary' | 'csv' | 'json' | 'cobs'
export type Endian = 'little' | 'big'
export type ChecksumType = 'none' | 'xor' | 'crc8' | 'crc16'

export interface ProtocolField {
  name: string
  type: FieldType
  offset: number
  /** Multiply raw value by this (e.g. 0.001 to convert mV → V) */
  scale?: number
  /** Add after scaling */
  bias?: number
}

export interface ProtocolSchema {
  name: string
  description?: string
  type: ProtocolType
  /** Default: 'little' */
  endian?: Endian
  /** Required for binary/cobs */
  frameSize?: number
  /** Sync byte sequence that precedes every frame, e.g. [0xAA, 0x55] */
  syncBytes?: number[]
  checksumType?: ChecksumType
  /** Byte offset of the checksum within the frame */
  checksumOffset?: number
  fields: ProtocolField[]
  /** CSV delimiter (default ',') */
  delimiter?: string
  hasHeader?: boolean
  /** Ordered field names for CSV columns */
  csvFields?: string[]
  /** Maps to telemetry source ID in the store (default 'hardware') */
  sourceId?: string
}

export interface SerialPortInfo {
  name: string
  type: string
}
