import { unzipSync, strFromU8 } from 'fflate'
import type { RocketDesignSummary } from '../store/rocketDesignStore'

function firstText(parent: Element | Document, selectors: string[]): string | null {
  for (const selector of selectors) {
    const el = parent.querySelector(selector)
    const value = el?.textContent?.trim()
    if (value) return value
  }
  return null
}

function firstNumber(parent: Element | Document, selectors: string[]): number | null {
  const value = firstText(parent, selectors)
  if (value === null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function parseRocketXml(xmlText: string, fileName: string, fileType: 'ork' | 'rkt'): RocketDesignSummary {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml')
  const parserError = doc.querySelector('parsererror')
  if (parserError) {
    throw new Error('OpenRocket file could not be parsed as XML')
  }

  const rocketEl = doc.querySelector('rocket')
  if (!rocketEl) {
    throw new Error('No <rocket> element found in imported design')
  }

  const rocketName = firstText(rocketEl, [':scope > name', 'name']) ?? fileName.replace(/\.(ork|rkt)$/i, '')
  const stageCount = rocketEl.querySelectorAll('stage').length || 1
  const bodyTubes = Array.from(doc.querySelectorAll('bodytube'))
  const finSets = Array.from(doc.querySelectorAll('trapezoidfinset, ellipticfinset, freeformfinset, finset'))
  const transitions = Array.from(doc.querySelectorAll('transition'))
  const noseCones = Array.from(doc.querySelectorAll('nosecone'))

  const lengthValues = [
    ...bodyTubes.map((el) => firstNumber(el, [':scope > length', 'length'])),
    ...transitions.map((el) => firstNumber(el, [':scope > length', 'length'])),
    ...noseCones.map((el) => firstNumber(el, [':scope > length', 'length'])),
  ].filter((value): value is number => value !== null)

  const radiusValues = [
    ...bodyTubes.flatMap((el) => [
      firstNumber(el, [':scope > outerradius', 'outerradius']),
      firstNumber(el, [':scope > radius', 'radius']),
    ]),
    ...transitions.flatMap((el) => [
      firstNumber(el, [':scope > foreoutradius', 'foreoutradius']),
      firstNumber(el, [':scope > aftoutradius', 'aftoutradius']),
      firstNumber(el, [':scope > radius', 'radius']),
    ]),
    ...noseCones.flatMap((el) => [
      firstNumber(el, [':scope > aftradius', 'aftradius']),
      firstNumber(el, [':scope > radius', 'radius']),
    ]),
  ].filter((value): value is number => value !== null)

  const finCount = finSets.reduce((sum, finSet) => {
    const count = firstNumber(finSet, [':scope > fincount', 'fincount'])
    return sum + (count ?? 0)
  }, 0)

  const massCandidates = Array.from(doc.querySelectorAll('masscomponent, parachute, streamer, bodytube, nosecone, transition'))
    .flatMap((el) => [
      firstNumber(el, [':scope > overridecgmass', 'overridecgmass']),
      firstNumber(el, [':scope > componentmass', 'componentmass']),
      firstNumber(el, [':scope > mass', 'mass']),
    ])
    .filter((value): value is number => value !== null)

  const totalLengthMm = lengthValues.length > 0
    ? Math.round(lengthValues.reduce((sum, value) => sum + value, 0) * 1000)
    : null
  const maxDiameterMm = radiusValues.length > 0
    ? Math.round(Math.max(...radiusValues) * 2 * 1000)
    : null
  const dryMassG = massCandidates.length > 0
    ? Math.round(massCandidates.reduce((sum, value) => sum + value, 0) * 1000)
    : null

  return {
    fileName,
    fileType,
    rocketName,
    stageCount,
    bodyTubeCount: bodyTubes.length,
    finSetCount: finSets.length,
    finCount,
    totalLengthMm,
    maxDiameterMm,
    dryMassG,
    sourceVersion: doc.documentElement.getAttribute('version') ?? undefined,
    importedAt: Date.now(),
  }
}

export async function parseOpenRocketFile(file: File): Promise<RocketDesignSummary> {
  const lowerName = file.name.toLowerCase()
  const fileType: 'ork' | 'rkt' = lowerName.endsWith('.ork') ? 'ork' : 'rkt'

  if (fileType === 'rkt') {
    return parseRocketXml(await file.text(), file.name, 'rkt')
  }

  const archive = unzipSync(new Uint8Array(await file.arrayBuffer()))
  const entry = Object.entries(archive).find(([, bytes]) => {
    const name = bytes ? true : false
    return name
  })

  if (!entry) {
    throw new Error('OpenRocket archive is empty')
  }

  const xmlEntry = Object.entries(archive).find(([name, bytes]) => {
    if (!bytes || bytes.length === 0) return false
    const lower = name.toLowerCase()
    if (lower.endsWith('.xml') || lower.endsWith('.rkt')) return true
    const text = strFromU8(bytes)
    return text.includes('<openrocket') || text.includes('<rocket')
  })

  if (!xmlEntry) {
    throw new Error('No OpenRocket XML payload found in .ork archive')
  }

  return parseRocketXml(strFromU8(xmlEntry[1]), file.name, 'ork')
}