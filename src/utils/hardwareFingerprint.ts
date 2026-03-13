import type { TelemetryPacket } from '../types/telemetry'

export type HardwareConfidence = 'low' | 'medium' | 'high'

export interface HardwareFingerprint {
  id: string
  label: string
  confidence: HardwareConfidence
  reason: string
  usbVendorId?: number
  usbProductId?: number
}

interface UsbProfile {
  vendorId: number
  productId: number
  id: string
  label: string
  confidence: HardwareConfidence
  reason: string
}

const USB_PROFILES: UsbProfile[] = [
  {
    vendorId: 0x10c4,
    productId: 0xea60,
    id: 'cp210x',
    label: 'SiLabs CP210x USB-UART',
    confidence: 'medium',
    reason: 'Matched known CP210x USB VID/PID',
  },
  {
    vendorId: 0x1a86,
    productId: 0x7523,
    id: 'ch340',
    label: 'WCH CH340 USB-UART',
    confidence: 'medium',
    reason: 'Matched known CH340 USB VID/PID',
  },
  {
    vendorId: 0x0403,
    productId: 0x6001,
    id: 'ft232',
    label: 'FTDI FT232 USB-UART',
    confidence: 'medium',
    reason: 'Matched known FT232 USB VID/PID',
  },
]

const ROCKET_SIGNATURE_KEYS: Array<keyof TelemetryPacket> = [
  'altitude',
  'velocityZ',
  'state',
  'batteryVoltage',
  'pitch',
  'latitude',
  'longitude',
]

function scoreRocketTelemetrySignature(packet: TelemetryPacket): number {
  let score = 0
  for (const k of ROCKET_SIGNATURE_KEYS) {
    if (packet[k] !== undefined) score += 1
  }
  return score
}

export function identifyByUsb(
  usbVendorId?: number,
  usbProductId?: number,
): HardwareFingerprint | null {
  if (usbVendorId === undefined || usbProductId === undefined) return null
  const match = USB_PROFILES.find(
    p => p.vendorId === usbVendorId && p.productId === usbProductId,
  )
  if (!match) return null
  return {
    id: match.id,
    label: match.label,
    confidence: match.confidence,
    reason: match.reason,
    usbVendorId,
    usbProductId,
  }
}

export function refineWithTelemetry(
  packet: TelemetryPacket,
  current: HardwareFingerprint | null,
): HardwareFingerprint {
  const signatureScore = scoreRocketTelemetrySignature(packet)

  if (signatureScore >= 4) {
    if (current) {
      return {
        ...current,
        confidence: 'high',
        reason: `${current.reason}; telemetry signature strongly matches rocket stream`,
      }
    }

    return {
      id: 'rocket-telemetry-generic',
      label: 'Rocket Telemetry Device',
      confidence: 'medium',
      reason: 'Telemetry fields match expected flight-computer signature',
    }
  }

  return current ?? {
    id: 'unknown-device',
    label: 'Unknown Serial Device',
    confidence: 'low',
    reason: 'No known USB profile or telemetry signature yet',
  }
}
