// Canvas renderer for the miniature city. Isometric 2:1 projection.
import { City, DIRS, HW_COL, HW_ROW, N, idx, isService, isZone } from './engine'
import type { Car, Problem, Tile, Tool } from './engine'
import { ITEM } from './catalog'
import type { ItemId } from './catalog'

export const TW = 64
export const TH = 32
const HW = TW / 2
const HH = TH / 2

export interface Camera {
  x: number
  y: number
  z: number
}

export type View = 'none' | 'power' | 'water' | 'pollution' | 'crime' | 'traffic' | 'value' | 'services'

export interface Overlay {
  hover: [number, number] | null
  cells: [number, number][]
  valid: Set<number>
  tool: Tool
  view: View
  selected: [number, number] | null
}

type RGB = [number, number, number]

const hex = (h: string): RGB => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
]
const rgb = (c: RGB, f = 1, a = 1) =>
  `rgba(${Math.min(255, c[0] * f) | 0},${Math.min(255, c[1] * f) | 0},${Math.min(255, c[2] * f) | 0},${a})`
const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]
const pick = <T,>(arr: T[], s: number) => arr[Math.floor(s * arr.length) % arr.length]

const GRASS: RGB[] = ['#6f8f4a', '#76964f', '#6a8a47', '#7d9a55'].map(hex)
const WATER = hex('#2f6c86')
const ASPHALT = hex('#3d3f44')
const HW_ASPHALT = hex('#33353a')
const SIDEWALK = hex('#a7a398')
const ZONE: Record<string, RGB> = { res: hex('#7fd17a'), com: hex('#5aa9e6'), ind: hex('#e6c14a') }
const HOUSE_WALL = ['#efe6d4', '#e7d8bf', '#d9cdb6', '#f2eee6', '#cfd6d8'].map(hex)
const ROOF = ['#9b4a33', '#5b5f66', '#7a3f2c', '#3f4449', '#8e6a4a'].map(hex)
const BRICK = ['#a45a43', '#b9876a', '#8d5a46', '#c9b49a'].map(hex)
const GLASS = ['#3b6f8f', '#2c5873', '#4a7d96', '#2f4e63', '#55808f'].map(hex)
const CONCRETE = ['#d6d2c8', '#c4c0b6', '#e2ddd2'].map(hex)
const IND = ['#9aa0a6', '#b5aa94', '#8c949c'].map(hex)
const SOOT = hex('#3a3430')
const TREE = ['#3f6b2f', '#4b7a33', '#35602b', '#567f3a'].map(hex)

const ZONE_TOOL_COLOR: Record<string, string> = {
  roads: '#f4e9d8',
  zones: '#7fd17a',
  power: '#f5d061',
  water: '#6ab8f0',
  services: '#f08aa8',
  tools: '#ff6b5a',
}

export interface Light {
  sx: number // sun horizontal direction: +1 east (screen right), −1 west
  elev: number // 0..1
  day: number // 0 night .. 1 day
  golden: number // 0..1
  tint: RGB
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

export function lightAt(time: number): Light {
  const phase = (time - 6) / 13.5
  const elev = phase > 0 && phase < 1 ? Math.sin(phase * Math.PI) : 0
  const sx = Math.cos(Math.max(0, Math.min(1, phase)) * Math.PI)
  const day = time < 12 ? smooth(4.8, 7, time) : 1 - smooth(18.6, 20.6, time)
  const g = (c: number, w: number) => Math.exp(-((time - c) ** 2) / (2 * w * w))
  const golden = Math.max(g(18.4, 0.9), g(6.8, 0.7) * 0.8)
  let tint = mix(hex('#39426e'), [255, 255, 255], day)
  tint = mix(tint, hex('#ffc48a'), golden * 0.75)
  return { sx, elev, day, golden, tint }
}

const P = (x: number, y: number): [number, number] => [(x - y) * HW, (x + y) * HH]

function path(ctx: CanvasRenderingContext2D, pts: [number, number][]) {
  ctx.beginPath()
  ctx.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
  ctx.closePath()
}

/** Grid polygon at a given pixel height. */
function gp(ctx: CanvasRenderingContext2D, pts: number[], z = 0) {
  ctx.beginPath()
  for (let i = 0; i < pts.length; i += 2) {
    const [sx, sy] = P(pts[i], pts[i + 1])
    if (i === 0) ctx.moveTo(sx, sy - z)
    else ctx.lineTo(sx, sy - z)
  }
  ctx.closePath()
}

function hull(points: [number, number][]) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (o: number[], a: number[], b: number[]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: [number, number][] = []
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop()
    lower.push(q)
  }
  const upper: [number, number][] = []
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop()
    upper.push(q)
  }
  upper.pop()
  lower.pop()
  return lower.concat(upper)
}

interface Glow {
  pts: [number, number][]
  color: string
}

interface Ctx {
  ctx: CanvasRenderingContext2D
  L: Light
  fl: number // left face brightness
  fr: number // right face brightness
  shadow: [number, number] // shadow offset per pixel of height
  glows: Glow[]
  dots: [number, number, number, string][]
  beacons: [number, number, number, string][] // always-visible emissive dots
  icons: [number, number, Problem][]
  detail: boolean
  t: number
  noLights: boolean // abandoned or burnt buildings have dark windows
  grime: number // 0..1 desaturation towards soot grey
}

// ---------- Primitives ----------

function box(
  c: Ctx,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  z0: number,
  h: number,
  col: RGB,
  opts: { top?: RGB; windows?: 'band' | 'grid' | 'house'; seed?: number; glass?: boolean } = {},
) {
  const { ctx, fl, fr } = c
  const z1 = z0 + h
  if (c.grime > 0) {
    col = mix(col, SOOT, c.grime)
    if (opts.top) opts = { ...opts, top: mix(opts.top, SOOT, c.grime) }
  }
  // left (+y) face, then right (+x) face, then top
  const A = P(x0, y1)
  const B = P(x1, y1)
  const C = P(x1, y0)
  path(ctx, [
    [A[0], A[1] - z0],
    [B[0], B[1] - z0],
    [B[0], B[1] - z1],
    [A[0], A[1] - z1],
  ])
  ctx.fillStyle = rgb(col, fl)
  ctx.fill()
  path(ctx, [
    [B[0], B[1] - z0],
    [C[0], C[1] - z0],
    [C[0], C[1] - z1],
    [B[0], B[1] - z1],
  ])
  ctx.fillStyle = rgb(col, fr)
  ctx.fill()
  gp(ctx, [x0, y0, x1, y0, x1, y1, x0, y1], z1)
  ctx.fillStyle = rgb(opts.top ?? col, 1.04)
  ctx.fill()
  // crisp edge highlight
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.lineWidth = 0.6
  ctx.beginPath()
  ctx.moveTo(A[0], A[1] - z1)
  ctx.lineTo(B[0], B[1] - z1)
  ctx.lineTo(C[0], C[1] - z1)
  ctx.stroke()

  if (opts.windows && c.detail) {
    windows(c, A, B, z0, h, opts, 'l')
    windows(c, B, C, z0, h, opts, 'r')
  }
}

function windows(
  c: Ctx,
  A: [number, number],
  B: [number, number],
  z0: number,
  h: number,
  opts: { windows?: 'band' | 'grid' | 'house'; seed?: number; glass?: boolean },
  side: 'l' | 'r',
) {
  const { ctx, L } = c
  const seed = opts.seed ?? 0.5
  const q = (u0: number, u1: number, v0: number, v1: number): [number, number][] => {
    const ax = A[0] + (B[0] - A[0]) * u0
    const ay = A[1] + (B[1] - A[1]) * u0
    const bx = A[0] + (B[0] - A[0]) * u1
    const by = A[1] + (B[1] - A[1]) * u1
    return [
      [ax, ay - v0],
      [bx, by - v0],
      [bx, by - v1],
      [ax, ay - v1],
    ]
  }
  const lit = side === 'l' ? c.fl : c.fr
  const dayCol = opts.glass
    ? `rgba(${(190 * lit) | 0},${(220 * lit) | 0},${(235 * lit) | 0},${0.35 + L.golden * 0.25})`
    : `rgba(40,48,58,${0.55})`
  const nightOn = L.day < 0.7 && !c.noLights
  const warm = ['rgba(255,214,150,0.95)', 'rgba(255,236,190,0.9)', 'rgba(255,190,120,0.9)']
  if (opts.windows === 'house') {
    for (const u of [0.28, 0.62]) {
      const pts = q(u, u + 0.16, z0 + h * 0.3, z0 + h * 0.7)
      path(ctx, pts)
      ctx.fillStyle = dayCol
      ctx.fill()
      if (nightOn && hash(seed, u, side === 'l' ? 1 : 2) > 0.35) c.glows.push({ pts, color: warm[0] })
    }
    return
  }
  const floor = opts.windows === 'band' ? 6 : 7
  const rows = Math.floor((h - 4) / floor)
  for (let r = 0; r < rows; r++) {
    const v0 = z0 + 3 + r * floor
    const v1 = v0 + (opts.windows === 'band' ? 3.2 : 3.6)
    if (opts.windows === 'band') {
      const pts = q(0.06, 0.94, v0, v1)
      path(ctx, pts)
      ctx.fillStyle = dayCol
      ctx.fill()
      if (nightOn) {
        for (let s = 0; s < 3; s++) {
          if (hash(seed, r, s + (side === 'l' ? 0 : 7)) > 0.42)
            c.glows.push({ pts: q(0.08 + s * 0.29, 0.33 + s * 0.29, v0, v1), color: pick(warm, hash(seed, s, r)) })
        }
      }
    } else {
      for (let s = 0; s < 3; s++) {
        const pts = q(0.12 + s * 0.28, 0.3 + s * 0.28, v0, v1)
        path(ctx, pts)
        ctx.fillStyle = dayCol
        ctx.fill()
        if (nightOn && hash(seed, r, s + (side === 'l' ? 0 : 7)) > 0.45)
          c.glows.push({ pts, color: pick(warm, hash(seed, r + 3, s)) })
      }
    }
  }
}

function hash(a: number, b: number, c: number) {
  const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453
  return s - Math.floor(s)
}

function shadowOf(c: Ctx, x0: number, y0: number, x1: number, y1: number, h: number) {
  if (c.L.day < 0.05 || h <= 0) return
  const [dx, dy] = c.shadow
  const base = [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)]
  const pts = base.concat(base.map(([x, y]) => [x + dx * h, y + dy * h] as [number, number]))
  path(c.ctx, hull(pts))
  c.ctx.fill()
}

function tree(c: Ctx, gx: number, gy: number, s: number, scale = 1) {
  const { ctx } = c
  const [x, y] = P(gx, gy)
  const r = (4.5 + s * 2.5) * scale
  const hgt = (7 + s * 5) * scale
  ctx.fillStyle = '#4a3a2a'
  ctx.fillRect(x - 0.8, y - hgt * 0.6, 1.6, hgt * 0.6)
  const col = pick(TREE, s)
  ctx.beginPath()
  ctx.arc(x, y - hgt, r, 0, Math.PI * 2)
  ctx.fillStyle = rgb(col, 0.9)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(x + (c.L.sx > 0 ? r * 0.3 : -r * 0.3), y - hgt - r * 0.3, r * 0.6, 0, Math.PI * 2)
  ctx.fillStyle = rgb(col, 1.25, 0.8)
  ctx.fill()
}

function treeShadow(c: Ctx, gx: number, gy: number, s: number, scale = 1) {
  if (c.L.day < 0.05) return
  const [x, y] = P(gx, gy)
  const r = (4.5 + s * 2.5) * scale
  const hgt = (7 + s * 5) * scale
  c.ctx.beginPath()
  c.ctx.ellipse(x + c.shadow[0] * hgt, y + c.shadow[1] * hgt, r * 1.1, r * 0.55, 0, 0, Math.PI * 2)
  c.ctx.fill()
}

const TREE_SPOTS: [number, number][] = [
  [0.3, 0.35],
  [0.7, 0.4],
  [0.45, 0.75],
]

// ---------- Buildings ----------

interface Shape {
  x0: number
  y0: number
  x1: number
  y1: number
  h: number
}

/** Footprints used both for shadows and drawing. */
function shapes(t: Tile, x: number, y: number): Shape[] {
  const s = t.seed
  const g = t.grow < 1 ? 0.15 + 0.85 * (1 - (1 - t.grow) ** 2) : 1
  const b = (i: number, h: number): Shape => ({ x0: x + i, y0: y + i, x1: x + 1 - i, y1: y + 1 - i, h: h * g })
  if (t.kind === 'res') {
    if (t.lvl === 1) return [b(0.22, 11 + s * 3)]
    if (t.lvl === 2) return [b(0.14, 20 + s * 6)]
    if (t.lvl === 3) return [b(0.12, 38 + s * 12)]
    return [b(0.2, 80 + s * 34)]
  }
  if (t.kind === 'com') {
    if (t.lvl === 1) return [b(0.16, 13 + s * 4)]
    if (t.lvl === 2) return [b(0.14, 28 + s * 8)]
    if (t.lvl === 3) return [b(0.15, 52 + s * 16)]
    if (t.lvl === 4) return [b(0.18, 90 + s * 30)]
    return [b(0.08, 16), b(0.2, 150 + s * 70)]
  }
  if (t.kind === 'ind') {
    if (t.lvl === 1) return [b(0.1, 11 + s * 3)]
    if (t.lvl === 2) return [b(0.1, 17 + s * 4)]
    return [b(0.06, 22)]
  }
  const r = (x0: number, y0: number, x1: number, y1: number, h: number): Shape => ({
    x0: x + x0,
    y0: y + y0,
    x1: x + x1,
    y1: y + y1,
    h: h * g,
  })
  if (t.kind === 'solar') return [r(0.1, 0.1, 0.9, 0.9, 3)]
  if (t.kind === 'wind') return [r(0.42, 0.42, 0.58, 0.58, 70)]
  if (t.kind === 'school') return [r(0.08, 0.08, 0.6, 0.92, 20)]
  if (t.kind === 'power') return [r(0.06, 0.1, 0.5, 0.9, 18), r(0.5, 0.15, 0.92, 0.6, 36)]
  if (t.kind === 'pump') return [r(0.12, 0.15, 0.58, 0.62, 10)]
  if (t.kind === 'fire') return [r(0.1, 0.12, 0.9, 0.88, 16), r(0.12, 0.12, 0.32, 0.32, 32)]
  if (t.kind === 'police') return [r(0.12, 0.12, 0.88, 0.88, 19)]
  if (t.kind === 'health') return [r(0.08, 0.1, 0.92, 0.9, 24)]
  return []
}

function rubble(c: Ctx, t: Tile, x: number, y: number) {
  const { ctx } = c
  gp(ctx, [x + 0.1, y + 0.1, x + 0.9, y + 0.1, x + 0.9, y + 0.9, x + 0.1, y + 0.9])
  ctx.fillStyle = '#3b332c'
  ctx.fill()
  for (let k = 0; k < 6; k++) {
    const u = 0.15 + hash(t.seed, k, 3) * 0.55
    const v = 0.15 + hash(t.seed, k, 4) * 0.55
    const hh = 2 + hash(t.seed, k, 5) * 5
    box(c, x + u, y + v, x + u + 0.14, y + v + 0.12, 0, hh, pick([hex('#5a524a'), hex('#6e655c'), hex('#2e2925')], hash(t.seed, k, 6)))
  }
  // charred beams
  ctx.strokeStyle = '#1e1a17'
  ctx.lineWidth = 1.4
  for (let k = 0; k < 3; k++) {
    const a = P(x + 0.2 + k * 0.2, y + 0.3)
    const b = P(x + 0.35 + k * 0.18, y + 0.7)
    ctx.beginPath()
    ctx.moveTo(a[0], a[1] - 2)
    ctx.lineTo(b[0], b[1] - 9 - k * 3)
    ctx.stroke()
  }
}

function flames(c: Ctx, x: number, y: number, top: number, seed: number) {
  const { ctx } = c
  const [cx, cy] = P(x + 0.5, y + 0.5)
  for (let k = 0; k < 7; k++) {
    const fx = cx + (hash(seed, k, 9) - 0.5) * 26
    const flick = Math.sin(c.t * (9 + k) + k * 2) * 0.5 + 0.5
    const fh = 8 + flick * 10
    const by = cy - top * (0.55 + hash(seed, k, 8) * 0.45)
    ctx.beginPath()
    ctx.moveTo(fx - 4, by)
    ctx.quadraticCurveTo(fx - 3, by - fh * 0.6, fx, by - fh)
    ctx.quadraticCurveTo(fx + 3, by - fh * 0.6, fx + 4, by)
    ctx.closePath()
    ctx.fillStyle = k % 2 ? 'rgba(255,170,40,0.95)' : 'rgba(255,90,20,0.9)'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(fx, by - 2, 2, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,240,160,0.95)'
    ctx.fill()
  }
  c.beacons.push([cx, cy - top * 0.8, 22 + Math.sin(c.t * 7) * 4, 'rgba(255,120,30,0.22)'])
}

function service(c: Ctx, t: Tile, x: number, y: number) {
  const sh = shapes(t, x, y)
  const busy = t.grow < 1
  const { ctx } = c
  if (t.kind === 'power') {
    const [hall, tower] = sh
    box(c, hall.x0, hall.y0, hall.x1, hall.y1, 0, hall.h, hex('#9da3a8'), { windows: 'band', seed: t.seed, top: hex('#7b8187') })
    if (!busy) {
      // striped smokestack
      for (let k = 0; k < 5; k++)
        box(c, x + 0.16, y + 0.2, x + 0.26, y + 0.3, hall.h + k * 8, 8, k % 2 ? hex('#e8e4dc') : hex('#c0392b'))
      // cooling tower: stacked tapering rings
      const [tx, ty] = P((tower.x0 + tower.x1) / 2, (tower.y0 + tower.y1) / 2)
      const rings = 10
      for (let k = 0; k < rings; k++) {
        const v = k / (rings - 1)
        const rx = 15 * (1 - 0.45 * Math.sin(v * Math.PI * 0.85)) + v * 2
        const zz = v * tower.h
        ctx.beginPath()
        ctx.ellipse(tx, ty - zz, rx, rx / 2, 0, 0, Math.PI)
        ctx.lineTo(tx - rx, ty - zz - tower.h / rings - 0.5)
        ctx.ellipse(tx, ty - zz - tower.h / rings - 0.5, rx, rx / 2, 0, Math.PI, 0, true)
        ctx.closePath()
        ctx.fillStyle = rgb(hex('#d7d3cb'), 0.7 + 0.25 * (1 - v) * (c.fl > c.fr ? 1 : 0.8))
        ctx.fill()
      }
      ctx.beginPath()
      ctx.ellipse(tx, ty - tower.h, 11, 5.5, 0, 0, Math.PI * 2)
      ctx.fillStyle = '#4a4744'
      ctx.fill()
      c.beacons.push([P(x + 0.21, y + 0.25)[0], P(x + 0.21, y + 0.25)[1] - hall.h - 42, 1.6, Math.sin(c.t * 3) > 0 ? 'rgba(255,50,40,1)' : 'rgba(255,50,40,0.2)'])
    }
  } else if (t.kind === 'pump') {
    const [m] = sh
    box(c, m.x0, m.y0, m.x1, m.y1, 0, m.h, hex('#cfd6da'), { windows: 'house', seed: t.seed, top: hex('#4f7ea0') })
    if (!busy) {
      tank(c, x + 0.74, y + 0.36, 0.11, 14, 0)
      tank(c, x + 0.7, y + 0.76, 0.09, 9, 0)
      ctx.strokeStyle = '#5c7f99'
      ctx.lineWidth = 2
      const a = P(m.x1, (m.y0 + m.y1) / 2)
      const b = P(x + 1, y + 0.5)
      ctx.beginPath()
      ctx.moveTo(a[0], a[1] - 3)
      ctx.lineTo(b[0], b[1] - 3)
      ctx.stroke()
    }
  } else if (t.kind === 'fire') {
    const [m, tw] = sh
    box(c, m.x0, m.y0, m.x1, m.y1, 0, m.h, hex('#b23a2c'), { top: hex('#6f6a64') })
    if (!busy) {
      // garage doors on the street-facing side
      const A = P(m.x0, m.y1)
      const B = P(m.x1, m.y1)
      for (let k = 0; k < 3; k++) {
        const u0 = 0.1 + k * 0.29
        const u1 = u0 + 0.22
        path(ctx, [
          [A[0] + (B[0] - A[0]) * u0, A[1] + (B[1] - A[1]) * u0],
          [A[0] + (B[0] - A[0]) * u1, A[1] + (B[1] - A[1]) * u1],
          [A[0] + (B[0] - A[0]) * u1, A[1] + (B[1] - A[1]) * u1 - 10],
          [A[0] + (B[0] - A[0]) * u0, A[1] + (B[1] - A[1]) * u0 - 10],
        ])
        ctx.fillStyle = 'rgba(235,230,220,0.9)'
        ctx.fill()
      }
      box(c, tw.x0, tw.y0, tw.x1, tw.y1, 0, tw.h, hex('#9c3226'), { windows: 'grid', seed: t.seed })
    }
  } else if (t.kind === 'police') {
    const [m] = sh
    box(c, m.x0, m.y0, m.x1, m.y1, 0, m.h, hex('#e9ecef'), { windows: 'grid', seed: t.seed, top: hex('#7c858f') })
    if (!busy) {
      box(c, m.x0, m.y0, m.x1, m.y1, m.h - 6, 3, hex('#1f4f8f'))
      const [ax, ay] = P(x + 0.3, y + 0.3)
      ctx.strokeStyle = '#c9ced4'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(ax, ay - m.h)
      ctx.lineTo(ax, ay - m.h - 22)
      ctx.stroke()
      c.beacons.push([ax, ay - m.h - 22, 1.5, Math.sin(c.t * 4) > 0 ? 'rgba(80,140,255,1)' : 'rgba(80,140,255,0.2)'])
    }
  } else if (t.kind === 'health') {
    const [m] = sh
    box(c, m.x0, m.y0, m.x1, m.y1, 0, m.h, hex('#f1f0ec'), { windows: 'band', seed: t.seed, glass: true, top: hex('#d9d7d0') })
    if (!busy) {
      const cxg = (m.x0 + m.x1) / 2
      const cyg = (m.y0 + m.y1) / 2
      ctx.fillStyle = '#d23a32'
      gp(ctx, [cxg - 0.06, cyg - 0.22, cxg + 0.06, cyg - 0.22, cxg + 0.06, cyg + 0.22, cxg - 0.06, cyg + 0.22], m.h)
      ctx.fill()
      gp(ctx, [cxg - 0.22, cyg - 0.06, cxg + 0.22, cyg - 0.06, cxg + 0.22, cyg + 0.06, cxg - 0.22, cyg + 0.06], m.h)
      ctx.fill()
    }
  }
  if (t.kind === 'solar') {
    for (let k = 0; k < 4; k++) {
      const y0 = y + 0.12 + k * 0.2
      box(c, x + 0.12, y0, x + 0.88, y0 + 0.13, 2, 2.5, hex('#1f3a5c'), { top: hex(c.L.golden > 0.3 ? '#c98f5a' : '#3d6a99') })
    }
  } else if (t.kind === 'wind') {
    const [bx, by] = P(x + 0.5, y + 0.5)
    const H = 70 * Math.min(1, t.grow * 1.2)
    ctx.fillStyle = '#e9e9e6'
    ctx.beginPath()
    ctx.moveTo(bx - 2.5, by)
    ctx.lineTo(bx + 2.5, by)
    ctx.lineTo(bx + 1, by - H)
    ctx.lineTo(bx - 1, by - H)
    ctx.closePath()
    ctx.fill()
    if (!busy) {
      const a0 = c.t * 2.2 + t.seed * 6
      ctx.strokeStyle = '#f4f4f1'
      ctx.lineWidth = 1.6
      for (let k = 0; k < 3; k++) {
        const a = a0 + (k * Math.PI * 2) / 3
        ctx.beginPath()
        ctx.moveTo(bx, by - H)
        ctx.lineTo(bx + Math.cos(a) * 22, by - H + Math.sin(a) * 22)
        ctx.stroke()
      }
      ctx.fillStyle = '#d8d8d4'
      ctx.fillRect(bx - 3, by - H - 2, 6, 4)
      c.beacons.push([bx, by - H - 3, 1.2, Math.sin(c.t * 2) > 0.6 ? 'rgba(255,50,40,1)' : 'rgba(255,50,40,0.1)'])
    }
    return
  } else if (t.kind === 'school') {
    const [m] = sh
    box(c, m.x0, m.y0, m.x1, m.y1, 0, m.h, hex('#c98a5a'), { windows: 'grid', seed: t.seed, top: hex('#6e6a64') })
    if (!busy) {
      gp(ctx, [x + 0.64, y + 0.1, x + 0.94, y + 0.1, x + 0.94, y + 0.9, x + 0.64, y + 0.9])
      ctx.fillStyle = '#a5523d'
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'
      ctx.lineWidth = 0.8
      ctx.stroke()
      const [fx, fy] = P(m.x0 + 0.05, m.y1 + 0.02)
      ctx.strokeStyle = '#ddd'
      ctx.beginPath()
      ctx.moveTo(fx, fy)
      ctx.lineTo(fx, fy - 30)
      ctx.stroke()
      ctx.fillStyle = Math.sin(c.t * 4) > 0 ? '#3567c9' : '#2f5fb8'
      ctx.fillRect(fx, fy - 30, 7, 4)
      // school bus
      car(c, x + 0.78, y + 0.5, 0, 1, '#e3b02f', 0.4, true)
    }
  }
  if (busy) crane(c, sh[0])
}

function crane(c: Ctx, m: Shape) {
  const [ax, ay] = P(m.x1, m.y0)
  const top = ay - m.h - 26
  c.ctx.strokeStyle = '#e3a72f'
  c.ctx.lineWidth = 1.2
  c.ctx.beginPath()
  c.ctx.moveTo(ax, ay)
  c.ctx.lineTo(ax, top)
  c.ctx.lineTo(ax - 22, top + 4)
  c.ctx.moveTo(ax, top)
  c.ctx.lineTo(ax + 8, top + 2)
  c.ctx.stroke()
}

function building(c: Ctx, t: Tile, x: number, y: number) {
  const s = t.seed
  const sh = shapes(t, x, y)
  const building = t.grow < 1
  if (t.kind === 'res') {
    const [m] = sh
    if (t.lvl === 1) {
      const wall = pick(HOUSE_WALL, s)
      box(c, m.x0, m.y0, m.x1, m.y1, 0, m.h, wall, { windows: 'house', seed: s })
      roof(c, m, pick(ROOF, s * 7.3), s > 0.5)
      if (!building && s > 0.3) tree(c, x + 0.15, y + 0.85, s, 0.8)
    } else if (t.lvl === 2) {
      box(c, m.x0, m.y0, m.x1, m.y1, 0, m.h, pick(BRICK, s), { windows: 'grid', seed: s, top: hex('#6b6660') })
    } else if (t.lvl === 3) {
      box(c, m.x0, m.y0, m.x1, m.y1, 0, m.h, pick(CONCRETE, s), { windows: 'grid', seed: s, top: hex('#8f8a82') })
      if (!building) box(c, m.x0 + 0.15, m.y0 + 0.15, m.x0 + 0.35, m.y0 + 0.35, m.h, 4, hex('#bdb8ae'))
    } else {
      box(c, m.x0, m.y0, m.x1, m.y1, 0, m.h, pick(CONCRETE, s * 3.1), {
        windows: 'band',
        seed: s,
        top: hex('#9c978e'),
      })
      if (!building) box(c, m.x0 + 0.1, m.y0 + 0.1, m.x1 - 0.25, m.y1 - 0.25, m.h, 5, hex('#c8c3b9'))
    }
  } else if (t.kind === 'com') {
    const m = sh[sh.length - 1]
    if (t.lvl === 1) {
      box(c, m.x0, m.y0, m.x1, m.y1, 0, m.h, pick(CONCRETE, s), { windows: 'band', seed: s, glass: true })
      // awning
      const col = pick(['#c0392b', '#2e86ab', '#e1a730', '#3c8d5a'].map(hex), s * 5)
      box(c, m.x0, m.y1 - 0.02, m.x1, m.y1 + 0.06, 5, 1.5, col)
    } else if (t.lvl <= 4) {
      const col = t.lvl === 2 ? pick(CONCRETE, s) : pick(GLASS, s)
      box(c, m.x0, m.y0, m.x1, m.y1, 0, m.h, col, { windows: 'band', seed: s, glass: true, top: hex('#5d6670') })
      if (!building && t.lvl >= 3)
        box(c, m.x0 + 0.12, m.y0 + 0.12, m.x1 - 0.12, m.y1 - 0.12, m.h, 6, hex('#7d868f'))
    } else {
      const [pod, tw] = sh
      box(c, pod.x0, pod.y0, pod.x1, pod.y1, 0, pod.h, pick(CONCRETE, s), { windows: 'band', seed: s, glass: true })
      const col = pick(GLASS, s * 2.7)
      box(c, tw.x0, tw.y0, tw.x1, tw.y1, pod.h, tw.h - pod.h, col, { windows: 'band', seed: s, glass: true })
      if (!building) {
        const top = tw.h
        box(c, tw.x0 + 0.08, tw.y0 + 0.08, tw.x1 - 0.08, tw.y1 - 0.08, top, 10, mix(col, [255, 255, 255], 0.25))
        const [ax, ay] = P(x + 0.5, y + 0.5)
        c.ctx.strokeStyle = '#d0d4d8'
        c.ctx.lineWidth = 1
        c.ctx.beginPath()
        c.ctx.moveTo(ax, ay - top - 10)
        c.ctx.lineTo(ax, ay - top - 34 - s * 14)
        c.ctx.stroke()
        c.dots.push([ax, ay - top - 34 - s * 14, 2.2, 'rgba(255,60,50,1)'])
      }
    }
  } else if (t.kind === 'ind') {
    const [m] = sh
    const col = pick(IND, s)
    box(c, m.x0, m.y0, m.x1, m.y1, 0, m.h, col, { top: mix(col, [255, 255, 255], 0.15) })
    if (c.detail) {
      // roof ribs
      c.ctx.strokeStyle = 'rgba(0,0,0,0.12)'
      c.ctx.lineWidth = 0.8
      for (let k = 1; k < 5; k++) {
        const u = m.x0 + ((m.x1 - m.x0) * k) / 5
        const [a1, b1] = P(u, m.y0)
        const [a2, b2] = P(u, m.y1)
        c.ctx.beginPath()
        c.ctx.moveTo(a1, b1 - m.h)
        c.ctx.lineTo(a2, b2 - m.h)
        c.ctx.stroke()
      }
    }
    if (t.lvl >= 2 && !building) {
      box(c, x + 0.25, y + 0.25, x + 0.4, y + 0.4, m.h, 26, hex('#8a6f5c'))
      box(c, x + 0.25, y + 0.25, x + 0.4, y + 0.4, m.h + 22, 4, hex('#d8d2c8'))
    }
    if (t.lvl >= 3 && !building) {
      tank(c, x + 0.72, y + 0.68, 0.14, m.h + 12, m.h)
    }
  }
  if (building) {
    // construction crane
    const m = sh[sh.length - 1]
    const [ax, ay] = P(m.x1, m.y0)
    const top = ay - m.h - 26
    c.ctx.strokeStyle = '#e3a72f'
    c.ctx.lineWidth = 1.2
    c.ctx.beginPath()
    c.ctx.moveTo(ax, ay)
    c.ctx.lineTo(ax, top)
    c.ctx.lineTo(ax - 22, top + 4)
    c.ctx.moveTo(ax, top)
    c.ctx.lineTo(ax + 8, top + 2)
    c.ctx.stroke()
  }
}

function roof(c: Ctx, m: Shape, col: RGB, alongX: boolean) {
  const { ctx } = c
  const r = 7
  const h = m.h
  if (alongX) {
    const ym = (m.y0 + m.y1) / 2
    // back slope (lifted)
    const pts = (a: number[], zs: number[]) => {
      ctx.beginPath()
      for (let i = 0; i < a.length; i += 2) {
        const [sx, sy] = P(a[i], a[i + 1])
        if (i === 0) ctx.moveTo(sx, sy - zs[i / 2])
        else ctx.lineTo(sx, sy - zs[i / 2])
      }
      ctx.closePath()
    }
    pts([m.x0, m.y0, m.x1, m.y0, m.x1, ym, m.x0, ym], [h, h, h + r, h + r])
    ctx.fillStyle = rgb(col, 1.05)
    ctx.fill()
    pts([m.x0, m.y1, m.x1, m.y1, m.x1, ym, m.x0, ym], [h, h, h + r, h + r])
    ctx.fillStyle = rgb(col, c.fl * 1.05)
    ctx.fill()
    pts([m.x1, m.y0, m.x1, m.y1, m.x1, ym], [h, h, h + r])
    ctx.fillStyle = rgb(pick(HOUSE_WALL, 0.2), c.fr)
    ctx.fill()
  } else {
    const xm = (m.x0 + m.x1) / 2
    const pts = (a: number[], zs: number[]) => {
      ctx.beginPath()
      for (let i = 0; i < a.length; i += 2) {
        const [sx, sy] = P(a[i], a[i + 1])
        if (i === 0) ctx.moveTo(sx, sy - zs[i / 2])
        else ctx.lineTo(sx, sy - zs[i / 2])
      }
      ctx.closePath()
    }
    pts([m.x0, m.y0, m.x0, m.y1, xm, m.y1, xm, m.y0], [h, h, h + r, h + r])
    ctx.fillStyle = rgb(col, 1.05)
    ctx.fill()
    pts([m.x0, m.y1, xm, m.y1, m.x0 + (m.x1 - m.x0), m.y1], [h, h + r, h])
    ctx.fillStyle = rgb(pick(HOUSE_WALL, 0.2), c.fl)
    ctx.fill()
    pts([m.x1, m.y0, m.x1, m.y1, xm, m.y1, xm, m.y0], [h, h, h + r, h + r])
    ctx.fillStyle = rgb(col, c.fr * 1.05)
    ctx.fill()
  }
}

function tank(c: Ctx, gx: number, gy: number, r: number, h: number, z0: number) {
  const { ctx } = c
  const [x, y] = P(gx, gy)
  const rx = r * TW * 0.7
  const ry = rx / 2
  ctx.fillStyle = rgb(hex('#cfd3d6'), c.fl)
  ctx.fillRect(x - rx, y - z0 - h, rx * 2, h)
  ctx.beginPath()
  ctx.ellipse(x, y - z0, rx, ry, 0, 0, Math.PI)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(x, y - z0 - h, rx, ry, 0, 0, Math.PI * 2)
  ctx.fillStyle = '#e6e8ea'
  ctx.fill()
}

// ---------- Ground ----------

function ground(c: Ctx, city: City, t: Tile, x: number, y: number) {
  const { ctx } = c
  const diamond = () => gp(ctx, [x, y, x + 1, y, x + 1, y + 1, x, y + 1])
  if (t.water) {
    diamond()
    const w = Math.sin(c.t * 1.3 + x * 0.7 + y * 0.4) * 0.04
    ctx.fillStyle = rgb(WATER, 1 + w)
    ctx.fill()
    // shoreline
    for (const [dx, dy] of DIRS) {
      const n = city.tile(x + dx, y + dy)
      if (n && !n.water) edgeStrip(ctx, x, y, dx, dy, 0.12, 'rgba(196,184,150,0.55)')
    }
  } else {
    diamond()
    let col = pick(GRASS, t.seed)
    if (t.kind === 'park') col = mix(col, hex('#8fbf5a'), 0.45)
    if (isService(t.kind)) col = hex('#b4afa4')
    if (t.ruin) col = hex('#5b5248')
    if (isZone(t.kind) && t.lvl > 0) {
      col = t.kind === 'res' ? mix(col, hex('#86a35c'), 0.3) : t.kind === 'com' ? hex('#b8b3a8') : hex('#8f8b82')
    }
    ctx.fillStyle = rgb(col)
    ctx.fill()
  }

  if (t.kind === 'road') road(c, city, t, x, y)
  else if (t.kind === 'highway') highway(c, x, y)
  else if (isZone(t.kind) && t.lvl === 0 && !t.ruin) {
    gp(ctx, [x + 0.08, y + 0.08, x + 0.92, y + 0.08, x + 0.92, y + 0.92, x + 0.08, y + 0.92])
    ctx.fillStyle = rgb(ZONE[t.kind], 1, 0.28)
    ctx.fill()
    ctx.strokeStyle = rgb(ZONE[t.kind], 1, t.access ? 0.85 : 0.4)
    ctx.lineWidth = 1
    ctx.setLineDash(t.access ? [] : [3, 3])
    ctx.stroke()
    ctx.setLineDash([])
  } else if (t.kind === 'park' && c.detail) {
    ctx.strokeStyle = 'rgba(226,212,170,0.85)'
    ctx.lineWidth = 2
    const a = P(x + 0.5, y)
    const b = P(x + 0.5, y + 1)
    const d = P(x, y + 0.5)
    const e = P(x + 1, y + 0.5)
    ctx.beginPath()
    ctx.moveTo(a[0], a[1])
    ctx.lineTo(b[0], b[1])
    ctx.moveTo(d[0], d[1])
    ctx.lineTo(e[0], e[1])
    ctx.stroke()
    if (t.seed > 0.6) {
      const [px, py] = P(x + 0.72, y + 0.28)
      ctx.beginPath()
      ctx.ellipse(px, py, 7, 3.5, 0, 0, Math.PI * 2)
      ctx.fillStyle = rgb(WATER, 1.15)
      ctx.fill()
    }
  }
}

function edgeStrip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dx: number,
  dy: number,
  w: number,
  color: string,
) {
  let pts: number[]
  if (dx === 1) pts = [x + 1, y, x + 1, y + 1, x + 1 - w, y + 1, x + 1 - w, y]
  else if (dx === -1) pts = [x, y, x, y + 1, x + w, y + 1, x + w, y]
  else if (dy === 1) pts = [x, y + 1, x + 1, y + 1, x + 1, y + 1 - w, x, y + 1 - w]
  else pts = [x, y, x + 1, y, x + 1, y + w, x, y + w]
  gp(ctx, pts)
  ctx.fillStyle = color
  ctx.fill()
}

function road(c: Ctx, city: City, t: Tile, x: number, y: number) {
  const { ctx } = c
  if (t.water) {
    // bridge deck shadow on the water
    gp(ctx, [x + 0.1, y + 0.1, x + 1.1, y + 0.1, x + 1.1, y + 1.1, x + 0.1, y + 1.1])
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.fill()
  }
  gp(ctx, [x, y, x + 1, y, x + 1, y + 1, x, y + 1])
  ctx.fillStyle = t.road === 'gravel' ? '#9a8c72' : rgb(t.road === 'avenue' ? hex('#36383d') : ASPHALT)
  ctx.fill()
  let links = 0
  const conn: [number, number][] = []
  for (const [dx, dy] of DIRS) {
    const n = city.tile(x + dx, y + dy)
    const linked = !!n && (n.kind === 'road' || n.kind === 'highway')
    if (linked) {
      links++
      conn.push([dx, dy])
    } else edgeStrip(ctx, x, y, dx, dy, 0.14, t.water ? '#d9d4c8' : rgb(SIDEWALK))
  }
  if (!c.detail || t.road === 'gravel') return
  if (t.road === 'avenue' && links < 3 && conn.length) {
    // planted median with small trees
    const [dx] = conn[0]
    const along = dx !== 0
    const pts = along
      ? [x, y + 0.45, x + 1, y + 0.45, x + 1, y + 0.55, x, y + 0.55]
      : [x + 0.45, y, x + 0.55, y, x + 0.55, y + 1, x + 0.45, y + 1]
    gp(ctx, pts)
    ctx.fillStyle = '#6f8f4a'
    ctx.fill()
    if (!t.water) tree(c, along ? x + 0.5 : x + 0.5, along ? y + 0.5 : y + 0.5, t.seed, 0.45)
    ctx.strokeStyle = 'rgba(240,240,235,0.6)'
    ctx.lineWidth = 0.8
    ctx.setLineDash([3, 3])
    for (const v of [0.25, 0.75]) {
      const a = along ? P(x, y + v) : P(x + v, y)
      const b = along ? P(x + 1, y + v) : P(x + v, y + 1)
      ctx.beginPath()
      ctx.moveTo(a[0], a[1])
      ctx.lineTo(b[0], b[1])
      ctx.stroke()
    }
    ctx.setLineDash([])
    return
  }
  ctx.strokeStyle = links >= 3 ? 'rgba(240,240,235,0.8)' : 'rgba(236,200,90,0.85)'
  ctx.lineWidth = 1
  if (links >= 3) {
    // crosswalk ticks at each linked edge
    for (const [dx, dy] of conn) {
      for (let k = 0; k < 4; k++) {
        const u = 0.22 + k * 0.17
        const a = dx !== 0 ? P(x + (dx > 0 ? 0.92 : 0.08), y + u) : P(x + u, y + (dy > 0 ? 0.92 : 0.08))
        const b = dx !== 0 ? P(x + (dx > 0 ? 0.84 : 0.16), y + u) : P(x + u, y + (dy > 0 ? 0.84 : 0.16))
        ctx.beginPath()
        ctx.moveTo(a[0], a[1])
        ctx.lineTo(b[0], b[1])
        ctx.stroke()
      }
    }
  } else {
    ctx.setLineDash([3, 3])
    const m = P(x + 0.5, y + 0.5)
    for (const [dx, dy] of conn) {
      const e = P(x + 0.5 + dx * 0.5, y + 0.5 + dy * 0.5)
      ctx.beginPath()
      ctx.moveTo(m[0], m[1])
      ctx.lineTo(e[0], e[1])
      ctx.stroke()
    }
    ctx.setLineDash([])
  }
}

function highway(c: Ctx, x: number, y: number) {
  const { ctx } = c
  gp(ctx, [x, y, x + 1, y, x + 1, y + 1, x, y + 1])
  ctx.fillStyle = rgb(HW_ASPHALT)
  ctx.fill()
  const junction = x === HW_COL && y === HW_ROW
  if (junction || !c.detail) return
  const alongX = y === HW_ROW
  const line = (v: number, color: string, dash: number[], w = 1) => {
    const a = alongX ? P(x, y + v) : P(x + v, y)
    const b = alongX ? P(x + 1, y + v) : P(x + v, y + 1)
    ctx.strokeStyle = color
    ctx.lineWidth = w
    ctx.setLineDash(dash)
    ctx.beginPath()
    ctx.moveTo(a[0], a[1])
    ctx.lineTo(b[0], b[1])
    ctx.stroke()
  }
  line(0.05, 'rgba(235,235,230,0.8)', [])
  line(0.95, 'rgba(235,235,230,0.8)', [])
  line(0.47, 'rgba(236,190,70,0.9)', [])
  line(0.53, 'rgba(236,190,70,0.9)', [])
  line(0.27, 'rgba(235,235,230,0.65)', [4, 4])
  line(0.73, 'rgba(235,235,230,0.65)', [4, 4])
  ctx.setLineDash([])
  // jersey barriers on the outer edges
  const side = (v: number) => {
    const a = alongX ? P(x, y + v) : P(x + v, y)
    const b = alongX ? P(x + 1, y + v) : P(x + v, y + 1)
    ctx.strokeStyle = 'rgba(200,196,188,0.9)'
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.moveTo(a[0], a[1] - 1.5)
    ctx.lineTo(b[0], b[1] - 1.5)
    ctx.stroke()
  }
  side(0.01)
  side(0.99)
}

// ---------- Cars ----------

function car(
  c: Ctx,
  px: number,
  py: number,
  dx: number,
  dy: number,
  color: string,
  len: number,
  truck: boolean,
) {
  const { ctx } = c
  const b = P(px - dx * len * 0.5, py - dy * len * 0.5)
  const f = P(px + dx * len * 0.5, py + dy * len * 0.5)
  const w = truck ? 5.4 : 4.4
  ctx.lineCap = 'round'
  if (c.L.day > 0.05) {
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'
    ctx.lineWidth = w + 1
    ctx.beginPath()
    ctx.moveTo(b[0] + c.shadow[0] * 3, b[1] + c.shadow[1] * 3 + 1)
    ctx.lineTo(f[0] + c.shadow[0] * 3, f[1] + c.shadow[1] * 3 + 1)
    ctx.stroke()
  }
  ctx.strokeStyle = color
  ctx.lineWidth = w
  ctx.beginPath()
  ctx.moveTo(b[0], b[1] - 1.5)
  ctx.lineTo(f[0], f[1] - 1.5)
  ctx.stroke()
  if (c.detail) {
    ctx.strokeStyle = truck ? 'rgba(120,124,130,1)' : 'rgba(30,40,50,0.75)'
    ctx.lineWidth = w * 0.55
    const m = truck ? 0.15 : 0.32
    ctx.beginPath()
    ctx.moveTo(b[0] + (f[0] - b[0]) * m, b[1] + (f[1] - b[1]) * m - 3)
    ctx.lineTo(b[0] + (f[0] - b[0]) * (1 - m * 0.7), b[1] + (f[1] - b[1]) * (1 - m * 0.7) - 3)
    ctx.stroke()
  }
  ctx.lineCap = 'butt'
  if (c.L.day < 0.75) {
    c.dots.push([f[0], f[1] - 1.5, 2.2, 'rgba(255,240,200,0.95)'])
    c.dots.push([b[0], b[1] - 1.5, 1.6, 'rgba(255,40,30,0.9)'])
  }
}

function vehicle(c: Ctx, city: City, k: Car, px: number, py: number, dx: number, dy: number) {
  const { ctx } = c
  if (k.kind === 'ped') {
    const [x, y] = P(px, py)
    const bob = Math.abs(Math.sin(c.t * 8 + k.a)) * 0.6
    if (c.L.day > 0.05) {
      ctx.beginPath()
      ctx.ellipse(x + c.shadow[0] * 4, y + c.shadow[1] * 4, 1.6, 0.8, 0, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(0,0,0,0.25)'
      ctx.fill()
    }
    ctx.strokeStyle = k.color
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x, y - 3.6 - bob)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(x, y - 4.6 - bob, 0.95, 0, Math.PI * 2)
    ctx.fillStyle = '#e0b38f'
    ctx.fill()
    return
  }
  const big = k.kind === 'bus' || k.kind === 'fire'
  car(c, px, py, dx, dy, k.color, k.kind === 'bus' ? 0.5 : k.kind === 'fire' ? 0.42 : 0.25, big)
  if (k.kind === 'police' || k.kind === 'fire') {
    const [x, y] = P(px, py)
    const on = Math.sin(c.t * (k.kind === 'fire' ? 14 : 9) + k.a) > 0
    c.beacons.push([x - 1.5, y - 5, 1.6, on ? 'rgba(255,40,40,1)' : 'rgba(255,40,40,0.15)'])
    c.beacons.push([x + 1.5, y - 5, 1.6, on ? (k.kind === 'fire' ? 'rgba(255,40,40,0.15)' : 'rgba(60,120,255,0.15)') : k.kind === 'fire' ? 'rgba(255,200,40,1)' : 'rgba(60,120,255,1)'])
  }
  if (k.kind === 'police' && c.detail) {
    const [x, y] = P(px, py)
    ctx.fillStyle = '#16233a'
    ctx.fillRect(x - 1.8, y - 3.6, 3.6, 1.2)
  }
  if (k.kind === 'fire' && k.arrived && k.target !== undefined) {
    const tx = k.target % N
    const ty = (k.target / N) | 0
    const [x, y] = P(px, py)
    const [bx, by] = P(tx + 0.5, ty + 0.5)
    const tt = city.tiles[k.target]
    const top = 10 + tt.lvl * 10
    ctx.strokeStyle = 'rgba(200,230,255,0.75)'
    ctx.lineWidth = 1.2
    ctx.setLineDash([2, 2])
    ctx.lineDashOffset = -c.t * 30
    ctx.beginPath()
    ctx.moveTo(x, y - 6)
    ctx.quadraticCurveTo((x + bx) / 2, Math.min(y, by - top) - 24, bx, by - top)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.lineDashOffset = 0
  }
}

function boat(c: Ctx, city: City, b: { y: number; dir: number; sail: boolean }) {
  const { ctx } = c
  const i = Math.max(0, Math.min(N - 1, Math.floor(b.y)))
  const j = Math.max(0, Math.min(N - 1, i + 1))
  const f = b.y - Math.floor(b.y)
  const x = city.riverX[i] + (city.riverX[j] - city.riverX[i]) * f
  const back = P(x, b.y - b.dir * 0.22)
  const front = P(x, b.y + b.dir * 0.22)
  // wake
  ctx.strokeStyle = 'rgba(230,240,245,0.35)'
  ctx.lineWidth = 1
  const w1 = P(x - 0.15, b.y - b.dir * 0.8)
  const w2 = P(x + 0.15, b.y - b.dir * 0.8)
  ctx.beginPath()
  ctx.moveTo(w1[0], w1[1])
  ctx.lineTo(back[0], back[1])
  ctx.lineTo(w2[0], w2[1])
  ctx.stroke()
  ctx.lineCap = 'round'
  ctx.strokeStyle = '#f2efe8'
  ctx.lineWidth = 4.5
  ctx.beginPath()
  ctx.moveTo(back[0], back[1] - 1)
  ctx.lineTo(front[0], front[1] - 1)
  ctx.stroke()
  ctx.lineCap = 'butt'
  const [mx, my] = P(x, b.y)
  if (b.sail) {
    ctx.beginPath()
    ctx.moveTo(mx, my - 2)
    ctx.lineTo(mx, my - 14)
    ctx.lineTo(mx + 6, my - 3)
    ctx.closePath()
    ctx.fillStyle = 'rgba(250,248,240,0.95)'
    ctx.fill()
  } else {
    ctx.fillStyle = '#3d5a73'
    ctx.fillRect(mx - 2, my - 5, 4, 3)
  }
  if (c.L.day < 0.75) c.dots.push([front[0], front[1] - 2, 1.5, 'rgba(255,240,200,0.9)'])
}

function cloudShadows(c: Ctx) {
  if (c.L.day < 0.1) return
  const { ctx } = c
  ctx.fillStyle = `rgba(30,30,50,${0.07 * c.L.day})`
  for (let i = 0; i < 6; i++) {
    const span = N + 30
    const cx = ((i * 17.3 + c.t * 0.35) % span) - 15
    const cy = (i * 11.7 + 5) % N
    for (let k = 0; k < 3; k++) {
      const [sx, sy] = P(cx + k * 1.6 - 1.6, cy + (k % 2) * 1.2)
      const r = (2.4 + hash(i, k, 2) * 2) * HW
      ctx.beginPath()
      ctx.ellipse(sx, sy, r, r / 2, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

const PROBLEM_STYLE: Record<Problem, [string, string]> = {
  fire: ['#e2462b', '🔥'],
  ruin: ['#5b5248', '⚒'],
  power: ['#e9b824', '⚡'],
  water: ['#2f86c9', '💧'],
  crime: ['#5a4a9e', '!'],
  pollution: ['#6d7a35', '☁'],
  health: ['#d94b6a', '+'],
  traffic: ['#d9822b', '🚗'],
  abandoned: ['#6b6b6b', '✕'],
  education: ['#3567c9', '✎'],
}

function heatColor(v: number, a = 0.6) {
  const t = Math.max(0, Math.min(1, v))
  const r = t < 0.5 ? 80 + t * 2 * 175 : 255
  const g = t < 0.5 ? 200 : 200 - (t - 0.5) * 2 * 160
  return `rgba(${r | 0},${g | 0},70,${a})`
}

function infoView(ctx: CanvasRenderingContext2D, city: City, view: View, visible: (x: number, y: number) => boolean) {
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (!visible(x, y)) continue
      const t = city.tiles[idx(x, y)]
      let fill: string | null = null
      const built = (isZone(t.kind) && t.lvl > 0) || isService(t.kind)
      if (view === 'power' && built)
        fill = t.power || t.kind === 'power' || t.kind === 'solar' || t.kind === 'wind' ? 'rgba(250,210,60,0.7)' : 'rgba(230,60,50,0.7)'
      else if (view === 'water' && t.pipe) fill = t.pipeOn ? 'rgba(40,140,255,0.85)' : 'rgba(120,130,150,0.8)'
      else if (view === 'water' && built) fill = t.waterOk || t.kind === 'pump' ? 'rgba(70,160,240,0.45)' : 'rgba(230,60,50,0.7)'
      else if (view === 'pollution' && t.pollution > 0.03) fill = `rgba(150,120,40,${Math.min(0.8, t.pollution)})`
      else if (view === 'crime' && isZone(t.kind) && t.lvl > 0) fill = heatColor(t.crime / 0.8)
      else if (view === 'crime' && t.policeCov) fill = 'rgba(80,120,230,0.18)'
      else if (view === 'traffic' && (t.kind === 'road' || t.kind === 'highway'))
        fill = t.kind === 'highway' ? 'rgba(120,200,120,0.5)' : heatColor(t.traffic / 5, 0.8)
      else if (view === 'value' && isZone(t.kind)) fill = heatColor(1 - t.value / 1.1)
      else if (view === 'services') {
        const n = (t.fireCov ? 1 : 0) + (t.policeCov ? 1 : 0) + (t.healthCov ? 1 : 0)
        if (n) fill = `rgba(${t.fireCov ? 230 : 60},${t.healthCov ? 200 : 80},${t.policeCov ? 240 : 60},${0.12 + n * 0.12})`
      }
      if (!fill) continue
      gp(ctx, [x, y, x + 1, y, x + 1, y + 1, x, y + 1])
      ctx.fillStyle = fill
      ctx.fill()
    }
  }
}

// ---------- Main ----------

export function render(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  dpr: number,
  city: City,
  cam: Camera,
  ov: Overlay,
  t: number,
) {
  const L = lightAt(city.time)
  const len = 0.45 + 2.2 * (1 - L.elev) ** 2
  const c: Ctx = {
    ctx,
    L,
    fl: 0.74 - 0.2 * L.sx,
    fr: 0.74 + 0.2 * L.sx,
    shadow: [-L.sx * len * 0.9, -len * 0.32],
    glows: [],
    dots: [],
    beacons: [],
    icons: [],
    detail: cam.z > 0.55,
    t,
    noLights: false,
    grime: 0,
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const bg = ctx.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, Math.max(w, h) * 0.8)
  bg.addColorStop(0, '#2b2117')
  bg.addColorStop(1, '#0d0906')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)

  ctx.setTransform(cam.z * dpr, 0, 0, cam.z * dpr, cam.x * dpr, cam.y * dpr)

  // diorama slab
  const S = 26
  const A = P(0, N)
  const B = P(N, N)
  const C = P(N, 0)
  path(ctx, [A, B, [B[0], B[1] + S], [A[0], A[1] + S]])
  ctx.fillStyle = '#5a4330'
  ctx.fill()
  path(ctx, [B, C, [C[0], C[1] + S], [B[0], B[1] + S]])
  ctx.fillStyle = '#3e2e21'
  ctx.fill()
  path(ctx, [A, B, [B[0], B[1] + 5], [A[0], A[1] + 5]])
  ctx.fillStyle = '#4f6b37'
  ctx.fill()
  path(ctx, [B, C, [C[0], C[1] + 5], [B[0], B[1] + 5]])
  ctx.fillStyle = '#3d5530'
  ctx.fill()

  // visible tile range
  const vx0 = -cam.x / cam.z - TW
  const vx1 = (w - cam.x) / cam.z + TW
  const vy0 = -cam.y / cam.z - TH
  const vy1 = (h - cam.y) / cam.z + 280
  const visible = (x: number, y: number) => {
    const sx = (x - y) * HW
    const sy = (x + y) * HH
    return sx > vx0 - HW && sx < vx1 && sy > vy0 - 20 && sy < vy1
  }

  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) if (visible(x, y)) ground(c, city, city.tiles[idx(x, y)], x, y)

  // shadows
  const sa = 0.3 * L.day
  ctx.fillStyle = `rgba(20,16,30,${sa})`
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (!visible(x, y)) continue
      const tl = city.tiles[idx(x, y)]
      if ((tl.lvl > 0 && isZone(tl.kind)) || isService(tl.kind)) {
        for (const m of shapes(tl, x, y)) shadowOf(c, m.x0, m.y0, m.x1, m.y1, m.h)
      }
      if (tl.trees && (tl.kind === 'none' || tl.kind === 'park')) {
        for (let k = 0; k < tl.trees; k++) {
          const [ox, oy] = TREE_SPOTS[k]
          treeShadow(c, x + ox, y + oy, hash(tl.seed, k, 1))
        }
      }
    }
  }

  cloudShadows(c)
  for (const b of city.boats) boat(c, city, b)

  // cars
  for (const k of city.cars) {
    const ax = k.a % N
    const ay = (k.a / N) | 0
    const bx = k.b % N
    const by = (k.b / N) | 0
    let dx = bx - ax
    const dy = by - ay
    if (dx === 0 && dy === 0) dx = 1
    const px = ax + 0.5 + dx * k.t - dy * k.lane
    const py = ay + 0.5 + dy * k.t + dx * k.lane
    if (!visible(Math.floor(px), Math.floor(py))) continue
    vehicle(c, city, k, px, py, dx, dy)
  }
  for (const k of city.hwCars) {
    const off = k.dir === 1 ? 0.62 + k.lane * 0.2 : 0.38 - k.lane * 0.2
    const px = k.axis === 'x' ? k.pos : k.line + off
    const py = k.axis === 'x' ? k.line + off : k.pos
    if (px < 0 || py < 0 || px > N || py > N) continue
    if (!visible(Math.floor(px), Math.floor(py))) continue
    const dx = k.axis === 'x' ? k.dir : 0
    const dy = k.axis === 'y' ? k.dir : 0
    car(c, px, py, dx, dy, k.color, k.truck ? 0.46 : 0.26, k.truck)
  }

  // objects, back to front
  for (let s = 0; s < N * 2 - 1; s++) {
    for (let x = Math.max(0, s - N + 1); x <= Math.min(N - 1, s); x++) {
      const y = s - x
      if (!visible(x, y)) continue
      const tl = city.tiles[idx(x, y)]
      if (tl.trees && (tl.kind === 'none' || tl.kind === 'park')) {
        for (let k = 0; k < tl.trees; k++) {
          const [ox, oy] = TREE_SPOTS[k]
          tree(c, x + ox, y + oy, hash(tl.seed, k, 1))
        }
      }
      if (tl.ruin) {
        rubble(c, tl, x, y)
        c.icons.push([...P(x + 0.5, y + 0.5), 'ruin'])
      } else if (tl.lvl > 0 && isZone(tl.kind)) {
        c.noLights = tl.abandoned || tl.burning > 0 || !tl.power
        c.grime = tl.burning > 0 ? Math.min(0.75, tl.burning / 30) : tl.abandoned ? 0.45 : 0
        building(c, tl, x, y)
        c.noLights = false
        c.grime = 0
        const top = Math.max(...shapes(tl, x, y).map((m) => m.h))
        if (tl.burning > 0) flames(c, x, y, top, tl.seed)
        if (tl.problem) {
          const [sx, sy] = P(x + 0.5, y + 0.5)
          c.icons.push([sx, sy - top - 12, tl.problem])
        }
      } else if (isService(tl.kind)) service(c, tl, x, y)
    }
  }

  // smoke
  for (const p of city.puffs) {
    const [sx, sy] = P(p.x, p.y)
    ctx.beginPath()
    ctx.arc(sx, sy - p.base - p.z, 3 + p.life * (p.dark ? 13 : 9), 0, Math.PI * 2)
    ctx.fillStyle = p.dark ? `rgba(40,34,30,${(1 - p.life) * 0.55})` : `rgba(220,215,205,${(1 - p.life) * 0.45})`
    ctx.fill()
  }

  // lighting grade (screen space)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.globalCompositeOperation = 'multiply'
  ctx.fillStyle = rgb(L.tint)
  ctx.fillRect(0, 0, w, h)
  ctx.globalCompositeOperation = 'source-over'

  // emissive lights
  const night = 1 - L.day
  if (night > 0.05) {
    ctx.setTransform(cam.z * dpr, 0, 0, cam.z * dpr, cam.x * dpr, cam.y * dpr)
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = Math.min(1, night * 1.4)
    for (const g of c.glows) {
      path(ctx, g.pts)
      ctx.fillStyle = g.color
      ctx.fill()
    }
    // street lamps
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const tl = city.tiles[idx(x, y)]
        if ((tl.kind !== 'road' && tl.kind !== 'highway') || (x + y) % 2 || !visible(x, y)) continue
        const [sx, sy] = P(x + 0.5, y + 0.5)
        ctx.beginPath()
        ctx.ellipse(sx, sy, 18, 9, 0, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255,170,90,0.07)'
        ctx.fill()
      }
    }
    for (const [x, y, r, col] of c.dots) {
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fillStyle = col
      ctx.fill()
    }
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }

  // golden sky glow from the sun side
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  if (L.golden > 0.05) {
    const gx = L.sx < 0 ? 0 : w
    const glow = ctx.createRadialGradient(gx, 0, 0, gx, 0, Math.max(w, h) * 0.9)
    glow.addColorStop(0, `rgba(255,170,90,${0.32 * L.golden})`)
    glow.addColorStop(1, 'rgba(255,170,90,0)')
    ctx.globalCompositeOperation = 'screen'
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, w, h)
    ctx.globalCompositeOperation = 'source-over'
  }

  // emergency lights, fire glow and aircraft warning lights show day and night
  ctx.setTransform(cam.z * dpr, 0, 0, cam.z * dpr, cam.x * dpr, cam.y * dpr)
  ctx.globalCompositeOperation = 'lighter'
  for (const [x, y, r, col] of c.beacons) {
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = col
    ctx.fill()
    if (r < 4) {
      ctx.beginPath()
      ctx.arc(x, y, r * 3, 0, Math.PI * 2)
      ctx.fillStyle = col.replace(/[\d.]+\)$/, '0.12)')
      ctx.fill()
    }
  }
  ctx.globalCompositeOperation = 'source-over'

  if (ov.view !== 'none') {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = 'rgba(10,12,20,0.45)'
    ctx.fillRect(0, 0, w, h)
    ctx.setTransform(cam.z * dpr, 0, 0, cam.z * dpr, cam.x * dpr, cam.y * dpr)
    infoView(ctx, city, ov.view, visible)
  }

  // problem notification bubbles
  if (cam.z > 0.4) {
    const bob = Math.sin(c.t * 3) * 1.5
    const s = Math.max(1, 0.9 / cam.z)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const [x, y, p] of c.icons) {
      if (ov.view === 'none' && (p === 'health' || p === 'traffic')) continue
      const [col, glyph] = PROBLEM_STYLE[p]
      const yy = y + bob
      ctx.beginPath()
      ctx.moveTo(x - 3 * s, yy + 5 * s)
      ctx.lineTo(x, yy + 10 * s)
      ctx.lineTo(x + 3 * s, yy + 5 * s)
      ctx.fillStyle = col
      ctx.fill()
      ctx.beginPath()
      ctx.arc(x, yy, 7 * s, 0, Math.PI * 2)
      ctx.fillStyle = col
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.lineWidth = 1.2 * s
      ctx.stroke()
      ctx.fillStyle = '#fff'
      ctx.font = `bold ${9 * s}px system-ui, sans-serif`
      ctx.fillText(glyph, x, yy + 0.5 * s)
    }
  }

  // tool overlay (drawn after grading so it stays legible)
  if (ov.selected) {
    const [x, y] = ov.selected
    gp(ctx, [x, y, x + 1, y, x + 1, y + 1, x, y + 1])
    ctx.strokeStyle = 'rgba(253,230,138,1)'
    ctx.lineWidth = 2.5 / cam.z
    ctx.setLineDash([4 / cam.z, 3 / cam.z])
    ctx.stroke()
    ctx.setLineDash([])
  }
  if (ov.tool !== 'pan' && ov.tool !== 'inspect') {
    const col = ZONE_TOOL_COLOR[ITEM[ov.tool].group] ?? '#ffffff'
    for (const [x, y] of ov.cells) {
      gp(ctx, [x, y, x + 1, y, x + 1, y + 1, x, y + 1])
      const ok = ov.valid.has(idx(x, y))
      ctx.fillStyle = ok ? hexA(col, 0.35) : 'rgba(255,80,60,0.18)'
      ctx.fill()
      ctx.strokeStyle = ok ? hexA(col, 0.9) : 'rgba(255,80,60,0.5)'
      ctx.lineWidth = 1 / cam.z
      ctx.stroke()
    }
  }
  if (ov.hover) {
    const [x, y] = ov.hover
    gp(ctx, [x, y, x + 1, y, x + 1, y + 1, x, y + 1])
    ctx.strokeStyle = 'rgba(255,240,210,0.95)'
    ctx.lineWidth = 1.5 / cam.z
    ctx.stroke()
  }
}

function hexA(h: string, a: number) {
  const [r, g, b] = hex(h)
  return `rgba(${r},${g},${b},${a})`
}

export function screenToTile(cam: Camera, sx: number, sy: number): [number, number] {
  const wx = (sx - cam.x) / cam.z
  const wy = (sy - cam.y) / cam.z
  const gx = (wx / HW + wy / HH) / 2
  const gy = (wy / HH - wx / HW) / 2
  return [Math.floor(gx), Math.floor(gy)]
}

export const MAP_CENTER = P(N / 2, N / 2)

/** Draws a small daylight picture of one catalog item for the build menu. */
export function drawPreview(canvas: HTMLCanvasElement, id: ItemId) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const W = canvas.clientWidth || 120
  const H = canvas.clientHeight || 96
  canvas.width = W * dpr
  canvas.height = H * dpr
  const item = ITEM[id]
  const L = lightAt(16.5)
  const len = 0.45 + 2.2 * (1 - L.elev) ** 2
  const c: Ctx = {
    ctx,
    L,
    fl: 0.74 - 0.2 * L.sx,
    fr: 0.74 + 0.2 * L.sx,
    shadow: [-L.sx * len * 0.9, -len * 0.32],
    glows: [],
    dots: [],
    beacons: [],
    icons: [],
    detail: true,
    t: 1.3,
    noLights: false,
    grime: 0,
  }
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, '#f6d7a8')
  g.addColorStop(1, '#c58c5a')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  const base = (kind: Tile['kind'], extra: Partial<Tile> = {}): Tile => ({
    water: false,
    kind,
    trees: 0,
    lvl: 0,
    seed: 0.62,
    grow: 1,
    access: true,
    connected: true,
    value: 1,
    power: true,
    waterOk: true,
    fireCov: true,
    policeCov: true,
    healthCov: true,
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
    pipe: false,
    pipeOn: false,
    eduCov: true,
    ...extra,
  })
  // 3×3 grid; centre tile shows the item
  const grid: Tile[] = []
  for (let k = 0; k < 9; k++) grid.push(base('none', { seed: (k * 0.37) % 1 }))
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < 3 && y < 3 ? grid[y * 3 + x] : undefined)
  const stub = { tile: at } as unknown as City
  const centre = grid[4]
  let tall = 30
  if (item.kind === 'road') {
    for (const k of [3, 4, 5]) Object.assign(grid[k], { kind: 'road', road: item.road })
  } else if (item.kind && isZone(item.kind)) {
    const high = item.dens === 'high'
    centre.kind = item.kind
    centre.dens = item.dens ?? 'low'
    centre.lvl = item.kind === 'ind' ? (high ? 3 : 2) : high ? (item.kind === 'com' ? 5 : 4) : item.kind === 'com' ? 1 : 1
    centre.seed = 0.7
    tall = high ? 150 : 40
    for (const k of [3, 5]) Object.assign(grid[k], { kind: item.kind, dens: centre.dens, lvl: Math.max(1, centre.lvl - 1), seed: 0.3 + k * 0.1 })
    for (const k of [6, 7, 8]) Object.assign(grid[k], { kind: 'road' })
  } else if (item.kind === 'park') {
    centre.kind = 'park'
    centre.trees = 3
    centre.seed = 0.8
  } else if (item.kind) {
    centre.kind = item.kind
    tall = item.kind === 'wind' ? 100 : 60
    for (const k of [6, 7, 8]) Object.assign(grid[k], { kind: 'road' })
    if (item.kind === 'pump') for (const k of [2, 5, 8]) Object.assign(grid[k], { water: true, kind: 'none' })
  } else if (id === 'pipe') {
    for (const k of [1, 4, 7]) grid[k].pipe = true
  } else {
    centre.ruin = true
  }
  for (const k of [0, 2, 6]) if (grid[k].kind === 'none' && !grid[k].water) grid[k].trees = 1 + (k % 2)
  const z = Math.min(W / (3 * TW), (H - 8) / (3 * TH + tall)) * 1.05
  const ox = W / 2
  const oy = H - 4 - 3 * TH * z
  ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * ox, dpr * oy)
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) ground(c, stub, grid[y * 3 + x], x, y)
  if (id === 'pipe') {
    ctx.strokeStyle = '#2f86c9'
    ctx.lineWidth = 6
    const a = P(1.5, 0)
    const b = P(1.5, 3)
    ctx.beginPath()
    ctx.moveTo(a[0], a[1])
    ctx.lineTo(b[0], b[1])
    ctx.stroke()
  }
  ctx.fillStyle = 'rgba(20,16,30,0.3)'
  for (let y = 0; y < 3; y++)
    for (let x = 0; x < 3; x++) {
      const t = grid[y * 3 + x]
      if ((t.lvl > 0 && isZone(t.kind)) || isService(t.kind)) for (const m of shapes(t, x, y)) shadowOf(c, m.x0, m.y0, m.x1, m.y1, m.h)
    }
  for (let s = 0; s < 5; s++)
    for (let x = Math.max(0, s - 2); x <= Math.min(2, s); x++) {
      const y = s - x
      const t = grid[y * 3 + x]
      if (t.trees && t.kind !== 'road') for (let k = 0; k < t.trees; k++) tree(c, x + TREE_SPOTS[k][0], y + TREE_SPOTS[k][1], hash(t.seed, k, 1))
      if (t.ruin) rubble(c, t, x, y)
      else if (t.lvl > 0 && isZone(t.kind)) building(c, t, x, y)
      else if (isService(t.kind)) service(c, t, x, y)
    }
}