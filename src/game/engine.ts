// Simulation core for the miniature city builder. Pure logic, no DOM.

export const N = 56 // map is N × N tiles

import { ITEM } from './catalog'
import type { ItemId } from './catalog'

export type Service = 'power' | 'solar' | 'wind' | 'substation' | 'pump' | 'fire' | 'police' | 'health' | 'school'
export type Kind = 'none' | 'road' | 'highway' | 'res' | 'com' | 'ind' | 'park' | 'pylon' | Service
export type RoadType = 'street' | 'avenue' | 'gravel'
export type OverheadLineType = 'transmission' | 'distribution' | 'service' | 'swer'
export type Tool = 'pan' | 'inspect' | ItemId
export type BuildTool = ItemId
export type Problem =
  | 'fire'
  | 'ruin'
  | 'power'
  | 'water'
  | 'crime'
  | 'pollution'
  | 'health'
  | 'education'
  | 'traffic'
  | 'abandoned'

export interface Tile {
  water: boolean
  kind: Kind
  trees: number // 0–3 decorative trees on empty land
  lvl: number // building level, 0 = empty zone
  seed: number // stable per-tile random for visual variety
  grow: number // 0..1 construction animation
  access: boolean // zone/service touches a road connected to the highway
  connected: boolean // road reachable from the highway
  value: number // land value
  power: boolean
  waterOk: boolean
  fireCov: boolean
  policeCov: boolean
  healthCov: boolean
  pollution: number // 0..1
  crime: number // 0..1
  traffic: number // smoothed vehicles on a road tile
  burning: number // seconds on fire, 0 = not burning
  hosing: number // seconds of fire-fighting left once a truck arrives
  responder: boolean // a fire truck is on its way
  ruin: boolean // burnt out, needs bulldozing
  abandoned: boolean
  unhappy: number // accumulated seconds with unresolved problems
  problem: Problem | null
  dens: 'low' | 'high'
  road: RoadType
  lotId: number | null
  lotW: number
  lotH: number
  pipe: boolean
  pipeOn: boolean // pipe linked to a working pump
  undergroundCable: boolean
  overheadCable: boolean
  overheadType: OverheadLineType | null
  eduCov: boolean
}

export interface Review {
  name: string
  color: string
  stars: number
  text: string
  day: number
  time: number
  at?: [number, number]
}

export const ROAD_CAP: Record<RoadType, number> = { street: 1, avenue: 2.3, gravel: 0.55 }
const ROAD_SPEED: Record<RoadType, number> = { street: 1, avenue: 1.35, gravel: 0.6 }

export type VehicleKind = 'car' | 'bus' | 'police' | 'fire' | 'ped'

export interface Car {
  a: number // tile index travelling from
  b: number // tile index travelling to
  t: number // 0..1 progress between tile centres
  speed: number
  color: string
  kind: VehicleKind
  lane: number // lateral offset from the road centre
  path?: number[] // remaining route for dispatched vehicles
  target?: number // tile a fire truck is heading to
  arrived?: boolean
}

export interface HwCar {
  axis: 'x' | 'y'
  line: number // fixed coordinate of the highway
  pos: number // position along the highway, in tiles
  dir: 1 | -1
  lane: number
  speed: number
  color: string
  truck: boolean
}

export interface Boat {
  y: number
  dir: 1 | -1
  speed: number
  sail: boolean
}

export interface Puff {
  x: number
  y: number
  z: number
  life: number
  dark: boolean
  base: number
}

export interface CityEvent {
  tone: 'info' | 'warn' | 'good'
  msg: string
  at?: [number, number]
}

export const SERVICE_INFO: Record<
  Service,
  { name: string; cost: number; upkeep: number; radius: number; capacity?: number }
> = {
  power: { name: 'Power plant', cost: 9000, upkeep: 420, radius: 15, capacity: 2600 },
  pump: { name: 'Water pump', cost: 4500, upkeep: 220, radius: 14, capacity: 2600 },
  substation: { name: 'Electrical substation', cost: 6500, upkeep: 100, radius: 0 },
  fire: { name: 'Fire station', cost: 5000, upkeep: 260, radius: 10 },
  police: { name: 'Police station', cost: 5000, upkeep: 260, radius: 10 },
  health: { name: 'Clinic', cost: 6500, upkeep: 300, radius: 12 },
  solar: { name: 'Solar farm', cost: 6000, upkeep: 120, radius: 15, capacity: 900 },
  wind: { name: 'Wind turbine', cost: 3500, upkeep: 90, radius: 15, capacity: 450 },
  school: { name: 'School', cost: 6000, upkeep: 280, radius: 11 },
}
const POWER_KINDS: Kind[] = ['power', 'solar', 'wind']
export const isPowerKind = (k: Kind) => POWER_KINDS.includes(k)
export const SERVICES = Object.keys(SERVICE_INFO) as Service[]

export const COST = (t: BuildTool) => ITEM[t].cost
export const BRIDGE_COST = 350
const overheadLineType = (tool: BuildTool): OverheadLineType | null => {
  switch (tool) {
    case 'overhead_transmission':
      return 'transmission'
    case 'overhead_distribution':
      return 'distribution'
    case 'overhead_service':
      return 'service'
    case 'overhead_swer':
      return 'swer'
    default:
      return null
  }
}

export const HW_ROW = 13
export const HW_COL = 41

const CAP_RES = [0, 8, 22, 50, 110]
const CAP_COM = [0, 6, 16, 36, 70, 140]
const CAP_IND = [0, 12, 28, 50]
const MAX_LVL: Record<string, number> = { res: 4, com: 5, ind: 3 }

const CAR_COLORS = ['#e8e4dc', '#1d1f24', '#b8342b', '#2f5d8a', '#c9c9c9', '#d9a441', '#3c6e4a', '#8a8f99', '#5b2b4a']
const PED_COLORS = ['#d24d3c', '#3a6fb0', '#f0d36a', '#e9e4da', '#2c2c2c', '#6aa25a', '#c97aa6']

export const PROBLEM_LABEL: Record<Problem, string> = {
  fire: 'On fire',
  ruin: 'Burnt-out ruin',
  power: 'No electricity',
  water: 'No running water',
  crime: 'High crime',
  pollution: 'Heavy pollution',
  health: 'No healthcare nearby',
  education: 'No school nearby',
  traffic: 'Traffic jam outside',
  abandoned: 'Abandoned',
}

const MILESTONES: [number, string, number][] = [
  [150, 'Hamlet', 5000],
  [600, 'Village', 10000],
  [1500, 'Town', 20000],
  [4000, 'City', 40000],
  [9000, 'Metropolis', 80000],
]

export function mulberry32(seed: number) {
  let a = seed >>> 0
  const random = (() => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }) as (() => number) & { state: () => number }
  random.state = () => a
  return random
}

export const idx = (x: number, y: number) => y * N + x
export const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N
const isRoadish = (k: Kind) => k === 'road' || k === 'highway'
export const isService = (k: string): k is Service => (SERVICES as string[]).includes(k)

export interface Stats {
  money: number
  pop: number
  jobs: number
  demand: { r: number; c: number; i: number }
  income: number // per game day
  day: number
  time: number // hours 0..24
  happiness: number // 0..100
  power: { cap: number; use: number }
  water: { cap: number; use: number }
  problems: Partial<Record<Problem, number>>
  tax: number
  title: string
}

export interface CitySnapshot {
  version: 1
  randomState: number
  tiles: Tile[]
  cars: Car[]
  hwCars: HwCar[]
  boats: Boat[]
  puffs: Puff[]
  events: CityEvent[]
  reviews: Review[]
  riverX: number[]
  money: number
  time: number
  day: number
  pop: number
  jobsCom: number
  jobsInd: number
  tax: number
  happiness: number
  demand: { r: number; c: number; i: number }
  incomePerDay: number
  powerCap: number
  powerUse: number
  waterCap: number
  waterUse: number
  problemCounts: Partial<Record<Problem, number>>
  title: string
  reviewAcc: number
  tickAcc: number
  serviceAcc: number
  valueAcc: number
  lastHour: number
  milestone: number
  warned: Partial<Record<Problem, number>>
}

export class City {
  tiles: Tile[] = []
  cars: Car[] = []
  hwCars: HwCar[] = []
  boats: Boat[] = []
  puffs: Puff[] = []
  events: CityEvent[] = []
  reviews: Review[] = []
  private reviewAcc = 0
  riverX: number[] = []
  money = 70000
  time = 15.5 // start mid-afternoon so golden hour arrives soon
  day = 1
  pop = 0
  jobsCom = 0
  jobsInd = 0
  tax = 10 // percent
  happiness = 100
  demand = { r: 0.8, c: 0.2, i: 0.4 }
  incomePerDay = 0
  powerCap = 0
  powerUse = 0
  waterCap = 0
  waterUse = 0
  problemCounts: Partial<Record<Problem, number>> = {}
  title = 'Empty land'
  rand = mulberry32(1)
  private tickAcc = 0
  private serviceAcc = 0
  private valueAcc = 0
  private lastHour = 15
  private milestone = 0
  private warned: Partial<Record<Problem, number>> = {}

  constructor(seed = 20261103) {
    this.rand = mulberry32(seed)
    this.generate()
    this.recomputeNetwork()
    this.recomputeValue()
    this.serviceTick(0)
  }

  snapshot(): CitySnapshot {
    return {
      version: 1,
      randomState: this.rand.state(),
      tiles: this.tiles,
      cars: this.cars,
      hwCars: this.hwCars,
      boats: this.boats,
      puffs: this.puffs,
      events: this.events,
      reviews: this.reviews,
      riverX: this.riverX,
      money: this.money,
      time: this.time,
      day: this.day,
      pop: this.pop,
      jobsCom: this.jobsCom,
      jobsInd: this.jobsInd,
      tax: this.tax,
      happiness: this.happiness,
      demand: this.demand,
      incomePerDay: this.incomePerDay,
      powerCap: this.powerCap,
      powerUse: this.powerUse,
      waterCap: this.waterCap,
      waterUse: this.waterUse,
      problemCounts: this.problemCounts,
      title: this.title,
      reviewAcc: this.reviewAcc,
      tickAcc: this.tickAcc,
      serviceAcc: this.serviceAcc,
      valueAcc: this.valueAcc,
      lastHour: this.lastHour,
      milestone: this.milestone,
      warned: this.warned,
    }
  }

  static fromSnapshot(snapshot: CitySnapshot) {
    const city = new City(snapshot.randomState)
    city.tiles = snapshot.tiles
    city.cars = snapshot.cars
    city.hwCars = snapshot.hwCars
    city.boats = snapshot.boats
    city.puffs = snapshot.puffs
    city.events = snapshot.events
    city.reviews = snapshot.reviews
    city.riverX = snapshot.riverX
    city.money = snapshot.money
    city.time = snapshot.time
    city.day = snapshot.day
    city.pop = snapshot.pop
    city.jobsCom = snapshot.jobsCom
    city.jobsInd = snapshot.jobsInd
    city.tax = snapshot.tax
    city.happiness = snapshot.happiness
    city.demand = snapshot.demand
    city.incomePerDay = snapshot.incomePerDay
    city.powerCap = snapshot.powerCap
    city.powerUse = snapshot.powerUse
    city.waterCap = snapshot.waterCap
    city.waterUse = snapshot.waterUse
    city.problemCounts = snapshot.problemCounts
    city.title = snapshot.title
    city.reviewAcc = snapshot.reviewAcc
    city.tickAcc = snapshot.tickAcc
    city.serviceAcc = snapshot.serviceAcc
    city.valueAcc = snapshot.valueAcc
    city.lastHour = snapshot.lastHour
    city.milestone = snapshot.milestone
    city.warned = snapshot.warned
    city.rand = mulberry32(snapshot.randomState)
    for (const tile of city.tiles) {
      tile.lotId ??= null
      tile.lotW ??= 0
      tile.lotH ??= 0
      tile.undergroundCable ??= false
      tile.overheadCable ??= false
      tile.overheadType ??= tile.overheadCable ? 'distribution' : null
    }
    return city
  }

  private newTile(trees: number): Tile {
    return {
      water: false,
      kind: 'none',
      trees,
      lvl: 0,
      seed: this.rand(),
      grow: 1,
      access: false,
      connected: false,
      value: 0.3,
      power: false,
      waterOk: false,
      fireCov: false,
      policeCov: false,
      healthCov: false,
      pollution: 0,
      crime: 0,
      traffic: 0,
      burning: 0,
      hosing: 0,
      responder: false,
      ruin: false,
      abandoned: false,
      unhappy: 0,
      problem: null,
      dens: 'low',
      road: 'street',
      lotId: null,
      lotW: 0,
      lotH: 0,
      pipe: false,
      pipeOn: false,
      undergroundCable: false,
      overheadCable: false,
      overheadType: null,
      eduCov: false,
    }
  }

  private generate() {
    const r = this.rand
    const ph = Array.from({ length: 6 }, () => r() * Math.PI * 2)
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const f =
          Math.sin(x * 0.21 + ph[0]) * Math.cos(y * 0.17 + ph[1]) +
          Math.sin((x + y) * 0.09 + ph[2]) * 0.8 +
          Math.cos((x - y) * 0.31 + ph[3]) * 0.35
        const trees = f > 0.9 ? 3 : f > 0.55 ? 2 : f > 0.25 && r() < 0.45 ? 1 : 0
        this.tiles.push(this.newTile(trees))
      }
    }
    // A meandering river from the north edge to the south edge.
    let rx = 18 + r() * 6
    let drift = 0
    for (let y = 0; y < N; y++) {
      drift += (r() - 0.5) * 0.5
      drift = Math.max(-0.7, Math.min(0.7, drift))
      rx += drift
      rx = Math.max(8, Math.min(30, rx))
      const w = 2 + (Math.sin(y * 0.3) > 0.4 ? 1 : 0)
      for (let k = 0; k < w; k++) {
        const x = Math.round(rx) + k
        if (inside(x, y)) {
          const t = this.tiles[idx(x, y)]
          t.water = true
          t.trees = 0
        }
      }
      this.riverX.push(Math.round(rx) + w / 2)
    }
    // Two highways crossing at a junction.
    for (let x = 0; x < N; x++) this.setHighway(x, HW_ROW)
    for (let y = 0; y < N; y++) this.setHighway(HW_COL, y)
  }

  private setHighway(x: number, y: number) {
    const t = this.tiles[idx(x, y)]
    t.kind = 'highway'
    t.trees = 0
  }

  tile(x: number, y: number) {
    return inside(x, y) ? this.tiles[idx(x, y)] : undefined
  }

  private lotArea(t: Tile) {
    return t.lotW > 0 && t.lotH > 0 ? t.lotW * t.lotH : 1
  }

  private touchesRoad(x: number, y: number, w: number, h: number) {
    for (let dx = 0; dx < w; dx++) {
      const north = this.tile(x + dx, y - 1)
      const south = this.tile(x + dx, y + h)
      if (north?.kind === 'road' && north.connected || south?.kind === 'road' && south.connected) return true
    }
    for (let dy = 0; dy < h; dy++) {
      const west = this.tile(x - 1, y + dy)
      const east = this.tile(x + w, y + dy)
      if (west?.kind === 'road' && west.connected || east?.kind === 'road' && east.connected) return true
    }
    return false
  }

  private findZoneLot(start: number, kind: Kind, dens: Tile['dens']) {
    const sx = start % N
    const sy = (start / N) | 0
    const fits = (x: number, y: number, w: number, h: number) => {
      if (x < 0 || y < 0 || x + w > N || y + h > N || !this.touchesRoad(x, y, w, h)) return false
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          const tile = this.tiles[idx(x + dx, y + dy)]
          if (tile.kind !== kind || tile.dens !== dens || tile.lvl !== 0 || tile.ruin || tile.lotId != null || !tile.access)
            return false
        }
      }
      return true
    }
    if (kind === 'res') {
      const mansion = this.rand() < 0.0001
      const dimensions: [number, number] = mansion
        ? this.rand() < 0.5 ? [2, 2] : [2, 3]
        : this.rand() < 0.5 ? [1, 1] : this.rand() < 0.5 ? [1, 2] : [2, 1]
      const [w, h] = dimensions
      for (let attempt = 0; attempt < 24; attempt++) {
        const x = sx - Math.floor(this.rand() * w)
        const y = sy - Math.floor(this.rand() * h)
        if (fits(x, y, w, h)) return { x, y, w, h }
      }
      if (mansion) {
        for (const [smallW, smallH] of [[1, 2], [2, 1], [1, 1]] as const) {
          for (let attempt = 0; attempt < 8; attempt++) {
            const x = sx - Math.floor(this.rand() * smallW)
            const y = sy - Math.floor(this.rand() * smallH)
            if (fits(x, y, smallW, smallH)) return { x, y, w: smallW, h: smallH }
          }
        }
      } else if (w !== 1 || h !== 1) {
        if (fits(sx, sy, 1, 1)) return { x: sx, y: sy, w: 1, h: 1 }
      }
      return null
    }
    if (kind === 'com' && dens === 'low') {
      const bigShop = this.rand() < 0.05
      const dimensions: [number, number] = bigShop
        ? this.rand() < 0.5 ? [2, 2] : [2, 3]
        : this.rand() < 0.55 ? [1, 1] : this.rand() < 0.5 ? [1, 2] : [2, 1]
      const [w, h] = dimensions
      for (let attempt = 0; attempt < 24; attempt++) {
        const x = sx - Math.floor(this.rand() * w)
        const y = sy - Math.floor(this.rand() * h)
        if (fits(x, y, w, h)) return { x, y, w, h }
      }
      const fallbacks = bigShop ? [[1, 1], [1, 2], [2, 1]] as const : [[1, 1]] as const
      for (const [smallW, smallH] of fallbacks) {
        for (let attempt = 0; attempt < 8; attempt++) {
          const x = sx - Math.floor(this.rand() * smallW)
          const y = sy - Math.floor(this.rand() * smallH)
          if (fits(x, y, smallW, smallH)) return { x, y, w: smallW, h: smallH }
        }
      }
      return null
    }
    for (let attempt = 0; attempt < 24; attempt++) {
      const w = 2 + Math.floor(this.rand() * 5)
      const h = 2 + Math.floor(this.rand() * 5)
      const x = sx - Math.floor(this.rand() * w)
      const y = sy - Math.floor(this.rand() * h)
      if (fits(x, y, w, h)) return { x, y, w, h }
    }
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const x = sx - dx
      const y = sy - dy
      if (fits(x, y, 2, 2)) return { x, y, w: 2, h: 2 }
    }
    return null
  }

  /** Tiles within six cells of a standard road, excluding roads, highways, and blocked lots. */
  zoningTiles(connectedOnly = false) {
    const distance = new Uint8Array(this.tiles.length).fill(255)
    const reachable = new Uint8Array(this.tiles.length)
    const queue: number[] = []
    for (let i = 0; i < this.tiles.length; i++) {
      const t = this.tiles[i]
      if (t.kind === 'road' && (!connectedOnly || t.connected)) {
        distance[i] = 0
        queue.push(i)
      }
    }
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head]
      const nextDistance = distance[i] + 1
      if (nextDistance > 6) continue
      const x = i % N
      const y = (i / N) | 0
      for (const [dx, dy] of DIRS) {
        const nx = x + dx
        const ny = y + dy
        const next = this.tile(nx, ny)
        if (!next || next.water || (next.kind !== 'none' && !isZone(next.kind))) continue
        const ni = idx(nx, ny)
        if (distance[ni] <= nextDistance) continue
        distance[ni] = nextDistance
        reachable[ni] = 1
        queue.push(ni)
      }
    }
    return reachable
  }

  /** All zoning tiles in the same contiguous paintable area as the start. */
  zoneFill(start: [number, number]) {
    const [sx, sy] = start
    if (!inside(sx, sy)) return []
    const reachable = this.zoningTiles()
    const startIndex = idx(sx, sy)
    if (!reachable[startIndex]) return []
    const visited = new Uint8Array(this.tiles.length)
    const queue = [startIndex]
    visited[startIndex] = 1
    const cells: [number, number][] = []
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head]
      const x = i % N
      const y = (i / N) | 0
      cells.push([x, y])
      for (const [dx, dy] of DIRS) {
        const nx = x + dx
        const ny = y + dy
        if (!inside(nx, ny)) continue
        const ni = idx(nx, ny)
        if (!reachable[ni] || visited[ni]) continue
        visited[ni] = 1
        queue.push(ni)
      }
    }
    return cells
  }

  private emit(tone: CityEvent['tone'], msg: string, at?: [number, number]) {
    this.events.push({ tone, msg, at })
    if (this.events.length > 40) this.events.shift()
  }

  setTax(v: number) {
    this.tax = Math.max(0, Math.min(25, Math.round(v)))
    this.recomputeTotals()
  }

  // ---------- Player actions ----------

  /** Why a single tile can't take this tool, or null when it can. */
  private reject(tool: BuildTool, x: number, y: number, zoneReach?: Uint8Array): string | null {
    const t = this.tile(x, y)
    if (!t) return 'Off the map'
    const overheadType = overheadLineType(tool)
    if (
      t.lotId != null &&
      tool !== 'bulldoze' &&
      tool !== 'pipe' &&
      tool !== 'cable' &&
      overheadType === null
    )
      return 'A building occupies this lot'
    const item = ITEM[tool]
    if (tool === 'cable') {
      if (t.undergroundCable) return 'Already has an underground cable'
      return null
    }
    if (overheadType) {
      if (t.overheadCable) return 'Already has an overhead line'
      return null
    }
    if (tool === 'pipe') {
      if (t.water) return 'Pipes can’t cross the river'
      if (t.pipe) return 'Already piped'
      return null
    }
    if (item.kind === 'road') {
      if (t.kind === 'highway') return 'That’s the highway'
      if (t.kind === 'road') return t.road === item.road ? 'Already this road type' : null
      if (t.kind !== 'none' && !isZone(t.kind)) return 'Something is built here'
      if (isZone(t.kind) && (t.lvl > 0 || t.ruin)) return 'A building is in the way'
      return null
    }
    if (tool === 'bulldoze') {
      if (t.kind === 'highway') return 'The highway can’t be removed'
      if (t.kind === 'none' && t.trees === 0 && !t.pipe && !t.undergroundCable && !t.overheadCable)
        return 'Nothing to clear'
      return null
    }
    if (item.kind && isZone(item.kind) && !zoneReach?.[idx(x, y)]) return 'Outside road zoning area'
    if (t.water) return 'Can’t build on water'
    if (item.kind && (item.kind === 'park' || isService(item.kind))) {
      if (t.kind !== 'none') return 'Clear the land first'
      if (tool === 'pump' && !DIRS.some(([dx, dy]) => this.tile(x + dx, y + dy)?.water))
        return 'Pumps must sit on the riverbank'
      return null
    }
    if (t.kind === item.kind && t.dens === item.dens) return 'Already zoned'
    if (t.kind !== 'none' && !isZone(t.kind)) return 'Something is built here'
    return null
  }

  /** Cost of applying a tool to a set of tiles (only tiles that would change). */
  plan(tool: BuildTool, cells: [number, number][]) {
    let cost = 0
    let reason: string | null = null
    const valid: [number, number][] = []
    const item = ITEM[tool]
    const zoneReach = item.kind && isZone(item.kind) ? this.zoningTiles() : undefined
    const expanded: [number, number][] = []
    const seen = new Set<number>()
    for (const [x, y] of cells) {
      const tile = this.tile(x, y)
      if (tool === 'bulldoze' && tile?.lotId != null) {
        const lotId = tile.lotId
        for (let i = 0; i < this.tiles.length; i++) {
          if (this.tiles[i].lotId === lotId && !seen.has(i)) {
            seen.add(i)
            expanded.push([i % N, (i / N) | 0])
          }
        }
      } else if (!inside(x, y) || !seen.has(idx(x, y))) {
        if (inside(x, y)) seen.add(idx(x, y))
        expanded.push([x, y])
      }
    }
    for (const [x, y] of expanded) {
      const why = this.reject(tool, x, y, zoneReach)
      if (why) {
        reason ??= why
        continue
      }
      const t = this.tiles[idx(x, y)]
      const base = COST(tool)
      if (ITEM[tool].kind === 'road') cost += t.water ? Math.round(base * 3.5) : base
      else if (tool === 'bulldoze') cost += base + (t.lvl > 0 ? t.lvl * 40 : 0) + (isService(t.kind) ? 500 : 0)
      else cost += base
      valid.push([x, y])
    }
    return { cost, valid, reason }
  }

  apply(tool: BuildTool, cells: [number, number][]) {
    const { cost, valid, reason } = this.plan(tool, cells)
    if (valid.length === 0) return { ok: false, cost: 0, count: 0, reason }
    if (cost > this.money) return { ok: false, cost, count: valid.length, reason: `Not enough money — $${cost.toLocaleString()} needed` }
    this.money -= cost
    const item = ITEM[tool]
    for (const [x, y] of valid) {
      const t = this.tiles[idx(x, y)]
      if (tool === 'pipe') {
        t.pipe = true
        continue
      }
      if (tool === 'cable') {
        t.undergroundCable = true
        continue
      }
      const overheadType = overheadLineType(tool)
      if (overheadType) {
        t.overheadCable = true
        t.overheadType = overheadType
        continue
      }
      t.lvl = 0
      t.ruin = false
      t.abandoned = false
      t.burning = 0
      t.hosing = 0
      t.responder = false
      t.unhappy = 0
      if (tool === 'bulldoze') {
        t.kind = 'none'
        t.trees = 0
        t.lotId = null
        t.lotW = 0
        t.lotH = 0
        t.pipe = false
        t.pipeOn = false
        t.undergroundCable = false
        t.overheadCable = false
        t.overheadType = null
      } else if (item.kind === 'road') {
        t.kind = 'road'
        t.road = item.road ?? 'street'
        t.trees = 0
      } else if (item.kind) {
        t.kind = item.kind
        t.dens = item.dens ?? 'low'
        t.trees = item.kind === 'park' ? 1 + Math.floor(t.seed * 3) : 0
        t.grow = isService(item.kind) ? 0 : 1
      }
    }
    if (item.kind === 'road' || tool === 'bulldoze') {
      const ok = (i: number) => this.tiles[i].kind === 'road'
      this.cars = this.cars.filter((c) => ok(c.a) && ok(c.b))
    }
    this.recomputeNetwork()
    this.recomputeValue()
    this.serviceTick(0)
    this.recomputeTotals()
    if (item.kind && isService(item.kind)) {
      const [x, y] = valid[0]
      const t = this.tiles[idx(x, y)]
      if (!t.access) this.emit('warn', `${item.name} needs a road connected to the highway to work.`, [x, y])
      else if (tool === 'pump') this.emit('info', 'Now lay water pipes from the pump to your buildings.', [x, y])
    }
    return { ok: true, cost, count: valid.length, reason: null }
  }

  // ---------- Derived maps ----------

  recomputeNetwork() {
    for (const t of this.tiles) t.connected = false
    const q: number[] = []
    for (let i = 0; i < this.tiles.length; i++) {
      if (this.tiles[i].kind === 'highway') {
        this.tiles[i].connected = true
        q.push(i)
      }
    }
    while (q.length) {
      const i = q.pop()!
      const x = i % N
      const y = (i / N) | 0
      for (const [dx, dy] of DIRS) {
        const t = this.tile(x + dx, y + dy)
        if (t && !t.connected && isRoadish(t.kind)) {
          t.connected = true
          q.push(idx(x + dx, y + dy))
        }
      }
    }
    const zoneAccess = this.zoningTiles(true)
    for (let i = 0; i < this.tiles.length; i++) {
      const t = this.tiles[i]
      if (t.lotId !== i || t.lvl === 0 || t.ruin || this.touchesRoad(i % N, (i / N) | 0, t.lotW, t.lotH))
        continue
      for (const tile of this.tiles) {
        if (tile.lotId === i) {
          tile.lotId = null
          tile.lotW = 0
          tile.lotH = 0
          tile.lvl = 0
        }
      }
    }
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const t = this.tiles[idx(x, y)]
        t.access = isZone(t.kind)
          ? zoneAccess[idx(x, y)] === 1
          : isService(t.kind) &&
            DIRS.some(([dx, dy]) => {
              const n = this.tile(x + dx, y + dy)
              return !!n && n.kind === 'road' && n.connected
            })
        if (isZone(t.kind) && !t.access && t.lvl > 0) t.lvl = 0 // cut off: buildings empty out
      }
    }
  }

  recomputeValue() {
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const t = this.tiles[idx(x, y)]
        if (!isZone(t.kind)) continue
        let v = 0.3
        let parks = 0
        let dense = 0
        let water = false
        let blight = 0
        for (let dy = -4; dy <= 4; dy++) {
          for (let dx = -4; dx <= 4; dx++) {
            const n = this.tile(x + dx, y + dy)
            if (!n) continue
            const d = Math.abs(dx) + Math.abs(dy)
            if (n.kind === 'park' && d <= 4) parks++
            if ((n.kind === 'com' || n.kind === 'res') && n.lvl > 0 && !n.abandoned) dense += n.lvl * this.lotArea(n)
            if ((n.abandoned || n.ruin) && d <= 2) blight++
            if (n.water && d <= 2) water = true
            if (n.trees > 0 && n.kind === 'none' && d <= 2) v += 0.008
          }
        }
        v += Math.min(0.45, parks * 0.12)
        v += water ? 0.18 : 0
        v += Math.min(0.55, dense * 0.006)
        if (t.healthCov) v += 0.08
        if (t.policeCov) v += 0.06
        if (t.eduCov) v += 0.1
        if (t.kind !== 'ind') v -= t.pollution * 0.7
        v -= t.crime * 0.3 + blight * 0.08
        t.value = Math.max(0, v)
      }
    }
  }

  private capOf(t: Tile) {
    if (t.lvl === 0 || t.abandoned || t.ruin || t.burning > 0) return 0
    const g = t.grow
    if (t.kind === 'res') return CAP_RES[t.lvl] * g * this.lotArea(t)
    if (t.kind === 'com') return CAP_COM[t.lvl] * g * this.lotArea(t)
    if (t.kind === 'ind') return CAP_IND[t.lvl] * g * this.lotArea(t)
    return 0
  }

  recomputeTotals() {
    let pop = 0
    let com = 0
    let ind = 0
    for (const t of this.tiles) {
      const c = this.capOf(t)
      if (!c) continue
      if (t.kind === 'res') pop += c
      else if (t.kind === 'com') com += c
      else ind += c
    }
    this.pop = Math.round(pop)
    this.jobsCom = Math.round(com)
    this.jobsInd = Math.round(ind)
    const jobs = com + ind
    const clamp = (v: number) => Math.max(-1, Math.min(1, v))
    const taxDrag = (this.tax - 10) * 0.045
    const mood = (this.happiness - 70) / 200
    this.demand = {
      r: clamp(0.35 + (jobs * 1.15 - pop) / (pop + 60) - taxDrag + mood),
      c: clamp((pop * 0.32 - com) / (com + 40) + 0.05 - taxDrag),
      i: clamp((pop * 0.42 - ind) / (ind + 40) + 0.15 - taxDrag),
    }
  }

  /** Utilities, coverage, pollution, crime, problems and abandonment. */
  private serviceTick(dt: number) {
    const T = this.tiles
    for (const t of T) {
      t.fireCov = t.policeCov = t.healthCov = t.eduCov = false
      t.power = t.waterOk = t.pipeOn = false
      t.pollution = 0
    }
    const plants: [number, number, number][] = []
    const pumps: [number, number][] = []
    for (let i = 0; i < T.length; i++) {
      const t = T[i]
      if (!isService(t.kind) || !t.access || t.grow < 1) continue
      const x = i % N
      const y = (i / N) | 0
      if (isPowerKind(t.kind)) plants.push([x, y, SERVICE_INFO[t.kind].capacity ?? 0])
      else if (t.kind === 'pump') pumps.push([x, y])
      else if (t.kind !== 'substation') {
        const R = SERVICE_INFO[t.kind].radius
        for (let dy = -R; dy <= R; dy++)
          for (let dx = -R; dx <= R; dx++) {
            if (dx * dx + dy * dy > R * R) continue
            const n = this.tile(x + dx, y + dy)
            if (!n) continue
            if (t.kind === 'fire') n.fireCov = true
            else if (t.kind === 'police') n.policeCov = true
            else if (t.kind === 'school') n.eduCov = true
            else n.healthCov = true
          }
      }
    }

    // Power follows the full connected network; pylons span gaps of up to 8 tiles.
    const wireDistance = new Uint16Array(T.length).fill(0xffff)
    const wireQueue: number[] = []
    const isWireNode = (tile: Tile | undefined) =>
      !!tile &&
      (tile.kind === 'pylon' ||
        (tile.kind === 'substation' && tile.access && tile.grow >= 1) ||
        tile.undergroundCable ||
        tile.overheadCable ||
        (tile.kind === 'road' && tile.connected))
    const addWire = (i: number, distance: number) => {
      if (wireDistance[i] <= distance) return
      wireDistance[i] = distance
      wireQueue.push(i)
    }
    for (const [x, y] of plants) {
      for (const [dx, dy] of DIRS) {
        if (isWireNode(this.tile(x + dx, y + dy))) addWire(idx(x + dx, y + dy), 0)
      }
    }
    for (let head = 0; head < wireQueue.length; head++) {
      const i = wireQueue[head]
      const distance = wireDistance[i] + 1
      const x = i % N
      const y = (i / N) | 0
      const isPylon = T[i].kind === 'pylon'
      if (isPylon) {
        for (let dy = -8; dy <= 8; dy++) {
          for (let dx = -8; dx <= 8; dx++) {
            if (dx * dx + dy * dy > 64) continue
            const next = this.tile(x + dx, y + dy)
            if (isWireNode(next)) addWire(idx(x + dx, y + dy), distance)
          }
        }
      } else {
        for (const [dx, dy] of DIRS) {
          if (isWireNode(this.tile(x + dx, y + dy))) addWire(idx(x + dx, y + dy), distance)
        }
        for (let dy = -8; dy <= 8; dy++) {
          for (let dx = -8; dx <= 8; dx++) {
            if (dx * dx + dy * dy > 64) continue
            const next = this.tile(x + dx, y + dy)
            if (next?.kind === 'pylon') addWire(idx(x + dx, y + dy), distance)
          }
        }
      }
    }
    const powerReach = new Float32Array(T.length).fill(Infinity)
    for (let i = 0; i < T.length; i++) {
      const distance = wireDistance[i]
      if (distance === 0xffff) continue
      const x = i % N
      const y = (i / N) | 0
      T[i].power = true
      for (let dy = -6; dy <= 6; dy++) {
        for (let dx = -6; dx <= 6; dx++) {
          if (Math.abs(dx) + Math.abs(dy) > 6) continue
          const tile = this.tile(x + dx, y + dy)
          if (!tile) continue
          const j = idx(x + dx, y + dy)
          powerReach[j] = Math.min(powerReach[j], distance)
        }
      }
    }

    // Water mains: flood-fill pipes outward from working pumps.
    const reachW = new Float32Array(T.length).fill(Infinity)
    {
      const q: number[] = []
      for (const [x, y] of pumps) {
        const i = idx(x, y)
        T[i].pipeOn = true
        q.push(i)
      }
      for (let h = 0; h < q.length; h++) {
        const i = q[h]
        const x = i % N
        const y = (i / N) | 0
        for (const [dx, dy] of DIRS) {
          const n = this.tile(x + dx, y + dy)
          if (n && n.pipe && !n.pipeOn) {
            n.pipeOn = true
            q.push(idx(x + dx, y + dy))
          }
        }
      }
      for (const i of q) {
        if (T[i].kind === 'pump') continue
        const x = i % N
        const y = (i / N) | 0
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            if (!inside(x + dx, y + dy)) continue
            const j = idx(x + dx, y + dy)
            reachW[j] = Math.min(reachW[j], Math.abs(dx) + Math.abs(dy))
          }
      }
    }

    // Utilities: nearest buildings are served first until capacity runs out.
    const supply = (cap: number, reach: (i: number) => number, set: (t: Tile) => void, self: (k: Kind) => boolean) => {
      const want: [number, number, number][] = []
      let demand = 0
      for (let i = 0; i < T.length; i++) {
        const t = T[i]
        if (t.kind === 'substation') continue
        if (!(isZone(t.kind) && t.lvl > 0 && !t.ruin) && !(isService(t.kind) && !self(t.kind))) continue
        const load = isService(t.kind)
          ? 20
          : Math.max(6, (t.kind === 'res' ? CAP_RES : t.kind === 'com' ? CAP_COM : CAP_IND)[t.lvl]) * this.lotArea(t)
        demand += load
        const d = reach(i)
        if (d < Infinity) want.push([d, i, load])
      }
      want.sort((a, b) => a[0] - b[0])
      let used = 0
      for (const [, i, load] of want) {
        if (used + load > cap) continue
        used += load
        set(T[i])
      }
      return { cap, demand }
    }
    const p = supply(
      plants.reduce((a, b) => a + b[2], 0),
      (i) => powerReach[i],
      (t) => (t.power = true),
      isPowerKind,
    )
    const w = supply(
      pumps.length * (SERVICE_INFO.pump.capacity ?? 0),
      (i) => reachW[i],
      (t) => (t.waterOk = true),
      (k) => k === 'pump',
    )
    this.powerCap = p.cap
    this.powerUse = p.demand
    this.waterCap = w.cap
    this.waterUse = w.demand

    // Pollution from industry, power plants and jammed roads; parks clean the air.
    const spread = (x: number, y: number, R: number, amt: number) => {
      for (let dy = -R; dy <= R; dy++)
        for (let dx = -R; dx <= R; dx++) {
          const n = this.tile(x + dx, y + dy)
          if (!n) continue
          const d = Math.sqrt(dx * dx + dy * dy)
          if (d > R) continue
          n.pollution += amt * (1 - d / (R + 1))
        }
    }
    for (let i = 0; i < T.length; i++) {
      const t = T[i]
      const x = i % N
      const y = (i / N) | 0
      if (t.kind === 'ind' && t.lvl > 0 && !t.abandoned && !t.ruin)
        spread(x, y, t.dens === 'high' ? 5 : 3, (t.dens === 'high' ? 0.16 : 0.05) * t.lvl * this.lotArea(t))
      else if (t.kind === 'power') spread(x, y, 7, 0.55)
      else if (t.kind === 'road' && t.traffic > 2.5 * ROAD_CAP[t.road]) spread(x, y, 2, 0.04 * t.traffic)
      else if (t.kind === 'road' && t.road === 'avenue') spread(x, y, 1, -0.03)
      else if (t.kind === 'park') spread(x, y, 3, -0.22)
      else if (t.kind === 'highway') spread(x, y, 1, 0.05)
    }
    for (const t of T) t.pollution = Math.max(0, Math.min(1, t.pollution))

    // Crime, problems, abandonment.
    const counts: Partial<Record<Problem, number>> = {}
    let built = 0
    let content = 0
    for (let i = 0; i < T.length; i++) {
      const t = T[i]
      t.problem = null
      if (!isZone(t.kind) || (t.lvl === 0 && !t.ruin)) continue
      built++
      const x = i % N
      const y = (i / N) | 0
      let blight = 0
      for (const [dx, dy] of DIRS) {
        const n = this.tile(x + dx, y + dy)
        if (n && (n.abandoned || n.ruin)) blight++
      }
      const target = Math.max(
        0,
        Math.min(1, 0.12 + t.lvl * 0.11 + blight * 0.15 + (t.kind === 'com' ? 0.08 : 0) - (t.policeCov ? 0.55 : 0) + (this.tax > 15 ? 0.1 : 0)),
      )
      t.crime += (target - t.crime) * Math.min(1, dt * 0.05)

      let jam = false
      if (t.kind !== 'res')
        jam = DIRS.some(([dx, dy]) => {
          const n = this.tile(x + dx, y + dy)
          return !!n && n.kind === 'road' && n.traffic > 3.2 * ROAD_CAP[n.road]
        })
      let pr: Problem | null = null
      let severe = false
      if (t.burning > 0) pr = 'fire'
      else if (t.ruin) pr = 'ruin'
      else if (!t.power) [pr, severe] = ['power', true]
      else if (!t.waterOk) [pr, severe] = ['water', true]
      else if (t.crime > 0.6) [pr, severe] = ['crime', true]
      else if (t.kind === 'res' && t.pollution > 0.55) [pr, severe] = ['pollution', true]
      else if (t.kind === 'res' && t.lvl >= 2 && !t.healthCov) pr = 'health'
      else if (t.kind === 'res' && t.lvl >= 2 && !t.eduCov) pr = 'education'
      else if (jam) pr = 'traffic'
      if (t.abandoned && pr !== 'fire' && pr !== 'ruin') {
        counts.abandoned = (counts.abandoned ?? 0) + 1
      }
      if (pr) counts[pr] = (counts[pr] ?? 0) + 1
      else if (!t.abandoned) content++
      t.problem = t.abandoned && pr !== 'fire' && pr !== 'ruin' ? (pr ?? 'abandoned') : pr

      if (t.ruin || t.burning > 0) continue
      // Small settlements tolerate missing utilities; towns demand them.
      const grace = this.pop < 220 && (pr === 'power' || pr === 'water')
      if (pr && !grace) t.unhappy = Math.min(120, t.unhappy + dt * (severe ? 1 : 0.35))
      else t.unhappy = Math.max(0, t.unhappy - dt * 2.5)
      if (!t.abandoned && t.unhappy > 70) {
        t.abandoned = true
        if (this.rand() < 0.4) this.emit('warn', `${article(t.kind)} ${zoneName(t.kind)} building was abandoned: ${PROBLEM_LABEL[pr ?? 'abandoned'].toLowerCase()}.`, [x, y])
      } else if (t.abandoned && t.unhappy <= 0) {
        t.abandoned = false
        t.grow = 0.5
      }
    }
    this.problemCounts = counts
    this.happiness = built ? Math.round((content / built) * 100) : 100

    // Warn about big new problems, but not too often.
    if (dt > 0) {
      const notify: [Problem, string][] = [
        ['power', 'Buildings are without electricity. Build a power plant near them.'],
        ['water', 'Taps have run dry. Put a water pump on the riverbank.'],
        ['crime', 'Crime is rising. A police station would help.'],
        ['pollution', 'Residents are choking on pollution. Keep homes away from industry, or plant parks.'],
        ['traffic', 'Traffic is jammed. Add more road connections to spread the cars out.'],
        ['health', 'Residents have no clinic nearby.'],
      ]
      for (const [k, msg] of notify) {
        const n = counts[k] ?? 0
        const prev = this.warned[k] ?? 0
        if (n >= 4 && n > prev * 1.6) {
          this.warned[k] = n
          const at = this.firstProblem(k)
          this.emit('warn', msg, at)
        } else if (n === 0) this.warned[k] = 0
      }
    }
  }

  private writeReview() {
    const homes: number[] = []
    for (let i = 0; i < this.tiles.length; i++) {
      const t = this.tiles[i]
      if (isZone(t.kind) && t.lvl > 0 && !t.ruin) homes.push(i)
    }
    if (!homes.length) return
    const i = homes[Math.floor(this.rand() * homes.length)]
    const t = this.tiles[i]
    const x = i % N
    const y = (i / N) | 0
    const r = this.rand
    const any = <T,>(a: T[]) => a[Math.floor(r() * a.length)]
    const bad: Record<Problem, string[]> = {
      fire: ['MY BUILDING IS ON FIRE and the trucks are nowhere 🔥', 'Smoke everywhere. Where is the fire department?'],
      ruin: ['The burnt-out shell next door is an eyesore.', 'Still no one has cleared the ruins on my block.'],
      power: ['Power’s been out all week. Candles again. 🕯️', 'No electricity = no Wi-Fi = no life.'],
      water: ['Tap is DRY. Lay some pipes please 🚱', 'Showering at the gym because we have no water.'],
      crime: ['Got my bike stolen again. We need police here.', 'Wouldn’t walk around here after dark.'],
      pollution: ['Can’t open my windows, the factory smoke is awful.', 'My kid’s asthma is worse since the plant opened.'],
      health: ['Nearest clinic is miles away. Not great with a toddler.', 'Need a doctor nearby!'],
      education: ['Kids have no school nearby, we might move.', 'Please build a school in our area 🏫'],
      traffic: ['45 minutes to go 3 blocks. Build an avenue! 🚗🚗🚗', 'Gridlock outside the shop every evening.'],
      abandoned: ['Half the street has left. Feels like a ghost town.', 'Moved out. Too many problems.'],
    }
    let stars: number
    let text: string
    if (t.problem) {
      stars = t.problem === 'traffic' || t.problem === 'health' || t.problem === 'education' ? 2 + Math.round(r()) : 1
      text = any(bad[t.problem])
    } else {
      const good: string[] = []
      if (t.value > 0.8) good.push('Gorgeous neighbourhood, property prices are booming 📈')
      if (t.pollution < 0.05) good.push('Air is so fresh here. Love the trees 🌳')
      if (t.policeCov) good.push('Feel safe walking home at night. 👮')
      if (t.eduCov) good.push('Great school around the corner for the kids!')
      if (t.healthCov) good.push('Clinic is a short walk away. Very handy.')
      if (this.tax <= 8) good.push('Taxes are low, can’t complain 💸')
      if (this.tax >= 16) good.push('Nice place, but these taxes are brutal.')
      if (t.kind === 'com') good.push('Business is good, plenty of customers today ☕')
      if (t.kind === 'ind') good.push('Steady work at the plant. Good shifts.')
      good.push('Moved in last month, loving it so far!', 'Quiet street, friendly neighbours.')
      text = any(good)
      stars = text.includes('brutal') ? 3 : 4 + Math.round(r())
    }
    const first = ['Maya', 'Leo', 'Priya', 'Tom', 'Aiko', 'Sam', 'Noah', 'Zoe', 'Omar', 'Lena', 'Jon', 'Ivy', 'Raj', 'Elif', 'Ben']
    const colors = ['#e76f51', '#2a9d8f', '#e9c46a', '#8ab17d', '#5e60ce', '#f4a261', '#ef476f']
    this.reviews.push({
      name: `${any(first)} ${String.fromCharCode(65 + Math.floor(r() * 26))}.`,
      color: any(colors),
      stars,
      text,
      day: this.day,
      time: this.time,
      at: [x, y],
    })
    if (this.reviews.length > 30) this.reviews.shift()
  }

  firstProblem(k: Problem): [number, number] | undefined {
    for (let i = 0; i < this.tiles.length; i++) if (this.tiles[i].problem === k) return [i % N, (i / N) | 0]
    return undefined
  }

  // ---------- Simulation ----------

  /** Advance the city. `dt` is real seconds already multiplied by game speed. */
  step(dt: number) {
    this.time += dt * (24 / 240) // one game day every four minutes at 1×
    if (this.time >= 24) {
      this.time -= 24
      this.day++
    }
    const hour = Math.floor(this.time)
    if (hour !== this.lastHour) {
      this.lastHour = hour
      this.payHour()
    }

    this.tickAcc += dt
    while (this.tickAcc > 0.4) {
      this.tickAcc -= 0.4
      this.growTick()
    }
    this.serviceAcc += dt
    if (this.serviceAcc > 1.2) {
      this.serviceTick(this.serviceAcc)
      this.serviceAcc = 0
    }
    this.reviewAcc += dt
    if (this.reviewAcc > 9) {
      this.reviewAcc = 0
      this.writeReview()
    }
    this.valueAcc += dt
    if (this.valueAcc > 3) {
      this.valueAcc = 0
      this.recomputeValue()
    }

    for (const t of this.tiles) {
      if (t.grow < 1) t.grow = Math.min(1, t.grow + dt * 0.6)
    }

    this.stepFires(dt)
    this.stepCars(dt)
    this.stepHighway(dt)
    this.stepBoats(dt)
    this.stepSmoke(dt)
  }

  private payHour() {
    let roads = 0
    let pipes = 0
    for (const t of this.tiles) if (t.pipe) pipes++
    let parks = 0
    let services = 0
    for (const t of this.tiles) {
      if (t.kind === 'road') roads += t.road === 'avenue' ? 2 : t.road === 'gravel' ? 0.35 : 1
      else if (t.kind === 'park') parks++
      else if (isService(t.kind)) services += SERVICE_INFO[t.kind].upkeep
    }
    // Rates are per game day; taxes are collected hourly.
    const rate = this.tax / 10
    const income = (this.pop * 2.4 + this.jobsCom * 1.8 + this.jobsInd * 1.4) * rate
    const upkeep = roads * 3 + parks * 14 + services + pipes * 0.5
    this.money += (income - upkeep) / 24
    this.incomePerDay = Math.round(income - upkeep)
    if (this.money < 0 && hourIsNoon(this.time)) this.emit('warn', 'The city is in debt. Raise taxes or cut services.')
  }

  private growTick() {
    this.recomputeTotals()
    const d = this.demand
    const want: Record<string, number> = { res: d.r, com: d.c, ind: d.i }
    for (let n = 0; n < 160; n++) {
      const i = Math.floor(this.rand() * this.tiles.length)
      const t = this.tiles[i]
      if (!isZone(t.kind) || !t.access || t.ruin || t.burning > 0 || (t.lotId != null && t.lotId !== i)) continue
      if (t.lvl > 0 && !t.abandoned && t.grow >= 1) {
        const risk = 0.00016 * (t.kind === 'ind' ? 2.2 : 1) * (t.fireCov ? 0.3 : 1) * (1 + t.lvl * 0.3)
        if (this.rand() < risk) {
          this.ignite(i)
          continue
        }
      }
      if (t.abandoned) continue
      const dem = want[t.kind]
      const target = this.targetLevel(t)
      if (t.lvl === 0) {
        if (dem > -0.1 && this.rand() < 0.25 + dem * 0.5) {
          const lot = this.findZoneLot(i, t.kind, t.dens)
          if (!lot) continue
          const anchor = idx(lot.x, lot.y)
          for (let dy = 0; dy < lot.h; dy++) {
            for (let dx = 0; dx < lot.w; dx++) {
              const cell = this.tiles[idx(lot.x + dx, lot.y + dy)]
              cell.lotId = anchor
              cell.lotW = 0
              cell.lotH = 0
              cell.lvl = 0
            }
          }
          const building = this.tiles[anchor]
          building.lotW = lot.w
          building.lotH = lot.h
          building.lvl = 1
          building.grow = 0
          building.seed = this.rand()
          building.unhappy = 0
        }
      } else if (t.lvl < target && t.grow >= 1) {
        if (dem > 0.05 && this.rand() < 0.04 + dem * 0.12) {
          t.lvl++
          t.grow = 0.25
          t.seed = this.rand()
        }
      } else if (t.lvl > target + 1 && this.rand() < 0.05) {
        t.lvl--
      }
    }
    this.checkMilestones()
  }

  private checkMilestones() {
    const m = MILESTONES[this.milestone]
    if (m && this.pop >= m[0]) {
      this.milestone++
      this.title = m[1]
      this.money += m[2]
      this.emit('good', `${m[1]} reached: ${m[0].toLocaleString()} residents. A $${m[2].toLocaleString()} grant arrived.`)
    }
  }

  private targetLevel(t: Tile) {
    if (!t.power || !t.waterOk) return 1
    const v = t.value
    const max = MAX_LVL[t.kind] ?? 1
    let lvl: number
    if (t.kind === 'ind') return t.dens === 'high' ? 3 : 2
    if (t.kind === 'res') lvl = v < 0.45 ? 1 : v < 0.7 ? 2 : v < 0.95 ? 3 : 4
    else lvl = v < 0.4 ? 1 : v < 0.6 ? 2 : v < 0.8 ? 3 : v < 1.0 ? 4 : 5
    if (t.dens === 'low') return Math.min(2, lvl)
    return Math.min(max, Math.max(3, lvl))
  }

  // ---------- Fire ----------

  private ignite(i: number) {
    const t = this.tiles[i]
    if (t.burning > 0 || t.ruin || t.lvl === 0) return
    t.burning = 0.01
    const at: [number, number] = [i % N, (i / N) | 0]
    this.emit('warn', `Fire in ${article(t.kind).toLowerCase()} ${zoneName(t.kind)} building!${t.fireCov ? ' Crews are on the way.' : ' No fire station covers it.'}`, at)
    this.dispatch(i)
  }

  private dispatch(i: number) {
    const t = this.tiles[i]
    if (!t.fireCov || t.responder) return
    const x = i % N
    const y = (i / N) | 0
    const goals = new Set<number>()
    for (const [dx, dy] of DIRS) {
      const n = this.tile(x + dx, y + dy)
      if (n?.kind === 'road') goals.add(idx(x + dx, y + dy))
    }
    if (!goals.size) return
    let best: number[] | null = null
    for (let s = 0; s < this.tiles.length; s++) {
      const st = this.tiles[s]
      if (st.kind !== 'fire' || !st.access) continue
      const sx = s % N
      const sy = (s / N) | 0
      if ((sx - x) ** 2 + (sy - y) ** 2 > SERVICE_INFO.fire.radius ** 2) continue
      for (const [dx, dy] of DIRS) {
        const n = this.tile(sx + dx, sy + dy)
        if (n?.kind !== 'road') continue
        const p = this.route(idx(sx + dx, sy + dy), goals)
        if (p && (!best || p.length < best.length)) best = p
      }
    }
    if (!best) return
    t.responder = true
    const start = best[0]
    this.cars.push({
      a: start,
      b: best[1] ?? start,
      t: 0,
      speed: 2.6,
      color: '#c8261e',
      kind: 'fire',
      lane: 0.17,
      path: best.slice(2),
      target: i,
    })
  }

  /** Breadth-first route over the road network. */
  route(from: number, goals: Set<number>): number[] | null {
    const prev = new Int32Array(this.tiles.length).fill(-2)
    prev[from] = -1
    const q = [from]
    for (let h = 0; h < q.length; h++) {
      const i = q[h]
      if (goals.has(i)) {
        const out: number[] = []
        for (let k = i; k !== -1; k = prev[k]) out.push(k)
        return out.reverse()
      }
      const x = i % N
      const y = (i / N) | 0
      for (const [dx, dy] of DIRS) {
        const n = this.tile(x + dx, y + dy)
        const j = idx(x + dx, y + dy)
        if (n?.kind === 'road' && prev[j] === -2) {
          prev[j] = i
          q.push(j)
        }
      }
    }
    return null
  }

  private stepFires(dt: number) {
    for (let i = 0; i < this.tiles.length; i++) {
      const t = this.tiles[i]
      if (t.burning <= 0) continue
      t.burning += dt
      const x = i % N
      const y = (i / N) | 0
      if (this.rand() < dt * 6) this.puffs.push({ x: x + 0.3 + this.rand() * 0.4, y: y + 0.3 + this.rand() * 0.4, z: 0, life: 0, dark: true, base: 12 + t.lvl * 8 })
      if (t.hosing > 0) {
        t.hosing -= dt
        if (t.hosing <= 0) {
          t.burning = 0
          t.hosing = 0
          t.responder = false
          t.lvl = Math.max(1, t.lvl - 1)
          t.grow = 0.4
          this.cars = this.cars.filter((c) => c.target !== i)
          this.emit('good', 'Firefighters put out the blaze.', [x, y])
        }
        continue
      }
      if (!t.responder && t.fireCov && this.rand() < dt) this.dispatch(i)
      if (t.burning > 14 && this.rand() < dt * 0.06) {
        const [dx, dy] = DIRS[Math.floor(this.rand() * 4)]
        const j = idx(x + dx, y + dy)
        if (inside(x + dx, y + dy) && isZone(this.tiles[j].kind)) this.ignite(j)
      }
      if (t.burning > 42) {
        t.burning = 0
        t.ruin = true
        t.lvl = 0
        t.responder = false
        this.cars = this.cars.filter((c) => c.target !== i)
        this.emit('warn', 'A building burned to the ground. Bulldoze the ruin to rebuild.', [x, y])
      }
    }
  }

  // ---------- Vehicles ----------

  private stepCars(dt: number) {
    const T = this.tiles
    const counts: Record<VehicleKind, number> = { car: 0, bus: 0, police: 0, fire: 0, ped: 0 }
    const load = new Float32Array(T.length)
    for (const c of this.cars) {
      counts[c.kind]++
      if (c.kind !== 'ped') load[c.t < 0.5 ? c.a : c.b] += c.kind === 'bus' ? 2 : 1
    }
    for (let i = 0; i < T.length; i++) {
      const t = T[i]
      if (t.kind === 'road') t.traffic += (load[i] - t.traffic) * Math.min(1, dt * 1.5)
      else t.traffic = 0
    }

    const activity = this.pop + this.jobsCom + this.jobsInd
    const targets: Record<VehicleKind, number> = {
      car: Math.min(420, Math.floor(activity / 7)),
      bus: Math.min(10, Math.floor(this.pop / 450)),
      police: 0,
      fire: 0,
      ped: Math.min(260, Math.floor(this.pop / 9)),
    }
    let stations: number[] = []
    for (let i = 0; i < T.length; i++) if (T[i].kind === 'police' && T[i].access) stations.push(i)
    targets.police = stations.length * 2

    const spawn = (kind: VehicleKind) => {
      const from: number[] = []
      if (kind === 'police') {
        for (const s of stations) from.push(...this.roadsAround(s))
      } else {
        for (let i = 0; i < T.length; i++) if (T[i].kind === 'road' && T[i].connected) from.push(i)
      }
      if (!from.length) return
      const a = from[Math.floor(this.rand() * from.length)]
      const b = this.nextTile(a, -1)
      const ped = kind === 'ped'
      this.cars.push({
        a,
        b: b >= 0 ? b : a,
        t: this.rand(),
        speed: ped ? 0.25 + this.rand() * 0.15 : kind === 'bus' ? 0.9 : 1.1 + this.rand() * 0.7,
        color:
          kind === 'police'
            ? '#f2f2f2'
            : kind === 'bus'
              ? '#e3a72f'
              : ped
                ? PED_COLORS[Math.floor(this.rand() * PED_COLORS.length)]
                : CAR_COLORS[Math.floor(this.rand() * CAR_COLORS.length)],
        kind,
        lane: ped ? (this.rand() < 0.5 ? 0.41 : -0.41) : 0.17,
      })
    }
    for (const k of ['car', 'bus', 'police', 'ped'] as VehicleKind[]) {
      if (counts[k] < targets[k] && this.rand() < 0.5) spawn(k)
      else if (counts[k] > targets[k] + 3) {
        const j = this.cars.findIndex((c) => c.kind === k)
        if (j >= 0) this.cars.splice(j, 1)
      }
    }
    stations = []

    for (const c of this.cars) {
      if (c.arrived) continue
      const rt = T[c.b].road
      const jam = c.kind === 'ped' || c.kind === 'fire' ? 0 : Math.max(0, T[c.b].traffic - 2.5 * ROAD_CAP[rt])
      c.t += (dt * c.speed * (c.kind === 'ped' ? 1 : ROAD_SPEED[rt])) / (1 + jam * 0.5)
      while (c.t >= 1) {
        c.t -= 1
        if (c.path) {
          const nb = c.path.shift()
          if (nb === undefined) {
            c.t = 0.9
            c.arrived = true
            if (c.target !== undefined) {
              const tt = T[c.target]
              if (tt.burning > 0) tt.hosing = 5
            }
            break
          }
          c.a = c.b
          c.b = nb
        } else {
          const nb = this.nextTile(c.b, c.a)
          c.a = c.b
          c.b = nb >= 0 ? nb : c.a
        }
      }
    }
    // Trucks whose fire is already out (or whose road vanished) go home.
    this.cars = this.cars.filter((c) => c.kind !== 'fire' || (c.target !== undefined && T[c.target].burning > 0))
  }

  private roadsAround(i: number) {
    const x = i % N
    const y = (i / N) | 0
    const out: number[] = []
    for (const [dx, dy] of DIRS) if (this.tile(x + dx, y + dy)?.kind === 'road') out.push(idx(x + dx, y + dy))
    return out
  }

  private nextTile(from: number, prev: number) {
    const x = from % N
    const y = (from / N) | 0
    const opts: number[] = []
    for (const [dx, dy] of DIRS) {
      const t = this.tile(x + dx, y + dy)
      if (t && t.kind === 'road') {
        const j = idx(x + dx, y + dy)
        if (j !== prev) opts.push(j)
      }
    }
    if (opts.length === 0) return prev
    return opts[Math.floor(this.rand() * opts.length)]
  }

  private stepHighway(dt: number) {
    const rate = 1.2 + Math.min(5, (this.pop + this.jobsCom) / 400)
    if (this.rand() < rate * dt) {
      const axis = this.rand() < 0.5 ? 'x' : 'y'
      const dir = this.rand() < 0.5 ? 1 : -1
      const truck = this.rand() < 0.18
      this.hwCars.push({
        axis,
        line: axis === 'x' ? HW_ROW : HW_COL,
        pos: dir === 1 ? -1 : N + 1,
        dir,
        lane: this.rand() < 0.5 ? 0 : 1,
        speed: truck ? 2.4 + this.rand() * 0.6 : 3.2 + this.rand() * 1.6,
        color: truck ? '#d8d4cc' : CAR_COLORS[Math.floor(this.rand() * CAR_COLORS.length)],
        truck,
      })
    }
    for (const c of this.hwCars) c.pos += c.dir * c.speed * dt
    this.hwCars = this.hwCars.filter((c) => c.pos > -2 && c.pos < N + 2)
  }

  private stepBoats(dt: number) {
    if (this.boats.length < 4 && this.rand() < dt * 0.05) {
      const dir = this.rand() < 0.5 ? 1 : -1
      this.boats.push({ y: dir === 1 ? -1 : N + 1, dir, speed: 0.5 + this.rand() * 0.5, sail: this.rand() < 0.4 })
    }
    for (const b of this.boats) b.y += b.dir * b.speed * dt
    this.boats = this.boats.filter((b) => b.y > -2 && b.y < N + 2)
  }

  private stepSmoke(dt: number) {
    for (let i = 0; i < this.tiles.length; i++) {
      const t = this.tiles[i]
      if (t.grow < 1 || t.abandoned) continue
      if (t.kind === 'ind' && t.lvl >= 2 && this.rand() < dt * 1.2) {
        this.puffs.push({ x: (i % N) + 0.33, y: ((i / N) | 0) + 0.33, z: 0, life: 0, dark: false, base: 46 })
      } else if (t.kind === 'power' && t.access && this.rand() < dt * 3) {
        this.puffs.push({ x: (i % N) + 0.62, y: ((i / N) | 0) + 0.38, z: 0, life: 0, dark: false, base: 54 })
      }
    }
    for (const p of this.puffs) {
      p.life += dt * (p.dark ? 0.4 : 0.25)
      p.z += dt * 14
      p.x += dt * 0.15
    }
    this.puffs = this.puffs.filter((p) => p.life < 1)
  }

  stats(): Stats {
    return {
      money: Math.floor(this.money),
      pop: this.pop,
      jobs: this.jobsCom + this.jobsInd,
      demand: this.demand,
      income: this.incomePerDay,
      day: this.day,
      time: this.time,
      happiness: this.happiness,
      power: { cap: this.powerCap, use: Math.round(this.powerUse) },
      water: { cap: this.waterCap, use: Math.round(this.waterUse) },
      problems: this.problemCounts,
      tax: this.tax,
      title: this.title,
    }
  }
}

function hourIsNoon(t: number) {
  return Math.floor(t) === 12
}

function article(k: Kind) {
  return k === 'ind' ? 'An' : 'A'
}

function zoneName(k: Kind) {
  return k === 'res' ? 'residential' : k === 'com' ? 'commercial' : 'industrial'
}

export const DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

export function isZone(k: Kind): k is 'res' | 'com' | 'ind' {
  return k === 'res' || k === 'com' || k === 'ind'
}

/** Cells covered by a drag gesture for a given tool. */
export function dragCells(tool: Tool, a: [number, number], b: [number, number]): [number, number][] {
  const k = tool === 'pan' || tool === 'inspect' ? undefined : ITEM[tool].kind
  if (k && (isService(k) || k === 'park')) return inside(b[0], b[1]) ? [b] : []
  const out: [number, number][] = []
  if (k === 'road' || tool === 'pipe' || tool === 'cable' || tool.startsWith('overhead_')) {
    // L-shaped path: along the longer axis first.
    const [ax, ay] = a
    const [bx, by] = b
    const horizFirst = Math.abs(bx - ax) >= Math.abs(by - ay)
    const sx = Math.sign(bx - ax)
    const sy = Math.sign(by - ay)
    const appendLine = (fixedAxis: 'x' | 'y', fixed: number, from: number, to: number) => {
      if (fixed < 0 || fixed >= N) return
      const low = Math.max(0, Math.min(from, to))
      const high = Math.min(N - 1, Math.max(from, to))
      if (low > high) return
      const step = to < from ? -1 : 1
      for (let value = step > 0 ? low : high; step > 0 ? value <= high : value >= low; value += step) {
        out.push(fixedAxis === 'x' ? [fixed, value] : [value, fixed])
      }
    }
    if (horizFirst) {
      appendLine('y', ay, ax, bx)
      if (by !== ay) appendLine('x', bx, ay + sy, by)
    } else {
      appendLine('x', ax, ay, by)
      if (bx !== ax) appendLine('y', by, ax + sx, bx)
    }
    return out
  }
  const x0 = Math.max(0, Math.min(a[0], b[0]))
  const x1 = Math.min(N - 1, Math.max(a[0], b[0]))
  const y0 = Math.max(0, Math.min(a[1], b[1]))
  const y1 = Math.min(N - 1, Math.max(a[1], b[1]))
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push([x, y])
  return out
}

/** Tile-by-tile brush path between two points. */
export function brushCells(a: [number, number], b: [number, number]): [number, number][] {
  let [x, y] = a
  const [bx, by] = b
  const dx = Math.abs(bx - x)
  const dy = Math.abs(by - y)
  const sx = x < bx ? 1 : -1
  const sy = y < by ? 1 : -1
  let error = dx - dy
  const cells: [number, number][] = []
  while (true) {
    if (inside(x, y)) cells.push([x, y])
    if (x === bx && y === by) break
    const twiceError = error * 2
    if (twiceError > -dy) {
      error -= dy
      x += sx
    }
    if (twiceError < dx) {
      error += dx
      y += sy
    }
  }
  return cells
}