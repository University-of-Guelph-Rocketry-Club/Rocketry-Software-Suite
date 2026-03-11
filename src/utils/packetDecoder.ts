/**
 * Browser-side packet decoder — mirrors the Rust implementation in protocol.rs.
 * Used by the Protocol Tester component; no Tauri required.
 */
import type { ProtocolSchema } from '../types/protocol'

export interface DecodedPacket {
  fields: Record<string, number | boolean | string>
  warnings: string[]
}

// ── Public entry point ───────────────────────────────────────────────────────

export function decodeFrame(
  rawBytes: Uint8Array,
  protocol: ProtocolSchema,
): DecodedPacket | null {
  switch (protocol.type) {
    case 'binary':
    case 'cobs':
      return decodeBinary(rawBytes, protocol)
    case 'csv':
      return decodeCsv(new TextDecoder().decode(rawBytes), protocol)
    case 'json':
      return decodeJson(new TextDecoder().decode(rawBytes))
    default:
      return null
  }
}

/**
 * Parse a hex string like "AA 55 01 00 …" or "aa5501…" into bytes.
 * Returns null if the string is not valid hex.
 */
export function hexToBytes(hex: string): Uint8Array | null {
  // Strip whitespace and optional 0x prefixes
  const cleaned = hex.replace(/\s+/g, '').replace(/0x/gi, '')
  if (cleaned.length % 2 !== 0) return null
  if (!/^[0-9a-fA-F]*$/.test(cleaned)) return null
  const bytes = new Uint8Array(cleaned.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

// ── Binary ───────────────────────────────────────────────────────────────────

function decodeBinary(data: Uint8Array, protocol: ProtocolSchema): DecodedPacket {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const le = protocol.endian !== 'big'
  const fields: Record<string, number | boolean | string> = {}
  const warnings: string[] = []

  if (protocol.frameSize && data.length < protocol.frameSize) {
    warnings.push(
      `Frame too short: got ${data.length} bytes, expected ${protocol.frameSize}`,
    )
  }

  // Verify checksum before decoding
  if (protocol.checksumType && protocol.checksumType !== 'none') {
    const ok = verifyChecksum(data, protocol)
    if (!ok) warnings.push('Checksum mismatch — frame may be corrupted')
  }

  for (const field of protocol.fields) {
    if (field.name.startsWith('_')) continue
    const off = field.offset
    try {
      let value: number
      switch (field.type) {
        case 'uint8':   value = view.getUint8(off); break
        case 'uint16':  value = view.getUint16(off, le); break
        case 'uint32':  value = view.getUint32(off, le); break
        case 'int8':    value = view.getInt8(off); break
        case 'int16':   value = view.getInt16(off, le); break
        case 'int32':   value = view.getInt32(off, le); break
        case 'float32': value = view.getFloat32(off, le); break
        case 'float64': value = view.getFloat64(off, le); break
        case 'bool':
          fields[field.name] = view.getUint8(off) !== 0
          continue
        default:
          continue
      }
      if (field.scale !== undefined) value *= field.scale
      if (field.bias  !== undefined) value += field.bias
      fields[field.name] = value
    } catch {
      warnings.push(`Field "${field.name}" at offset ${off} is out of range`)
    }
  }

  return { fields, warnings }
}

// ── Checksum helpers ─────────────────────────────────────────────────────────

function verifyChecksum(data: Uint8Array, protocol: ProtocolSchema): boolean {
  const size = protocol.frameSize ?? data.length
  switch (protocol.checksumType) {
    case 'xor': {
      const off = protocol.checksumOffset ?? size - 1
      const expected = data[off]
      const computed = data.slice(0, off).reduce((a, b) => a ^ b, 0) & 0xFF
      return expected === computed
    }
    case 'crc8': {
      const off = protocol.checksumOffset ?? size - 1
      return data[off] === crc8(data.slice(0, off))
    }
    case 'crc16': {
      const off = protocol.checksumOffset ?? size - 2
      const expected = data[off] | (data[off + 1] << 8) // LE
      return (crc16Ccitt(data.slice(0, off)) & 0xFFFF) === expected
    }
    default:
      return true
  }
}

function crc8(data: Uint8Array): number {
  let crc = 0
  for (const byte of data) {
    crc ^= byte
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xFF : (crc << 1) & 0xFF
    }
  }
  return crc
}

function crc16Ccitt(data: Uint8Array): number {
  let crc = 0xFFFF
  for (const byte of data) {
    crc ^= byte << 8
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF
    }
  }
  return crc
}

// ── CSV ──────────────────────────────────────────────────────────────────────

function decodeCsv(line: string, protocol: ProtocolSchema): DecodedPacket | null {
  const delim = protocol.delimiter ?? ','
  const parts = line.trim().split(delim)
  const names = protocol.csvFields
  if (!names) return null

  const fields: Record<string, number | boolean | string> = {}
  const warnings: string[] = []

  for (let i = 0; i < names.length; i++) {
    const name = names[i]
    if (name.startsWith('_')) continue
    const raw = (parts[i] ?? '').trim()
    const num = parseFloat(raw)
    if (!isNaN(num)) {
      fields[name] = num
    } else if (raw === 'true' || raw === '1') {
      fields[name] = true
    } else if (raw === 'false' || raw === '0') {
      fields[name] = false
    } else {
      fields[name] = raw
    }
  }

  if (parts.length < names.length) {
    warnings.push(`Only ${parts.length} CSV columns, expected ${names.length}`)
  }

  return { fields, warnings }
}

// ── JSON ─────────────────────────────────────────────────────────────────────

function decodeJson(line: string): DecodedPacket | null {
  try {
    const obj = JSON.parse(line.trim())
    if (typeof obj !== 'object' || obj === null) return null
    return { fields: obj as Record<string, number | boolean | string>, warnings: [] }
  } catch {
    return null
  }
}
