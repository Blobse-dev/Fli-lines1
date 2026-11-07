// Canvas renderer for the miniature city. Isometric 2:1 projection.
import { City, DIRS, HW_COL, HW_ROW, N, idx, inside, isService, isZone } from './engine'
import type { Car, OverheadLineType, Problem, Tile, Tool } from './engine'
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
const GLASS = [
  '#3b6f8f',
  '#2c5873',
  '#4a7d96',
  '#2f4e63',
  '#55808f',
  '#467b87',
  '#365e79',
  '#638a96',
  '#31546a',
  '#507384',
].map(hex)
const CONCRETE = ['#d6d2c8', '#c4c0b6', '#e2ddd2'].map(hex)
const IND = ['#9aa0a6', '#b5aa94', '#8c949c'].map(hex)
const ZONE_FACADE_STYLES: Record<'res' | 'com' | 'ind', RGB[]> = {
  res: ['#efe6d4', '#e7d8bf', '#d9cdb6', '#f2eee6', '#cfd6d8', '#e3c9a8', '#d4d8c6', '#e7d9d4', '#c6d3d5', '#e9dfc9'].map(hex),
  com: ['#c5b9a5', '#aeb8b8', '#d2c7b7', '#9eafb5', '#c6b3a1', '#aeb9a7', '#d4d0c4', '#9dabb8', '#c6c1b4', '#b7a99a'].map(hex),
  ind: ['#9aa0a6', '#b5aa94', '#8c949c', '#a6a18f', '#788b91', '#b1a08b', '#858d83', '#a6abb0', '#9c886f', '#79858b'].map(hex),
}
const RES_ROOF_STYLES = ['#9b4a33', '#5b5f66', '#7a3f2c', '#3f4449', '#8e6a4a', '#6e4b46', '#454c5a', '#a35f3d', '#596b55', '#705b42'].map(hex)
const MANSION_TEXTURE_SIZE = 256
const mansionTextures: (HTMLCanvasElement | null)[] = Array(10).fill(null)
const mansionPatterns = new WeakMap<CanvasRenderingContext2D, (CanvasPattern | null)[]>()
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
  classicZoneArt?: boolean
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
  const wind = Math.sin(c.t * 1.25 + gx * 0.73 + gy * 0.49) * 1.1 * scale
  ctx.fillStyle = '#4a3a2a'
  ctx.fillRect(x - 0.8, y - hgt * 0.6, 1.6, hgt * 0.6)
  const col = pick(TREE, s)
  ctx.beginPath()
  ctx.arc(x + wind, y - hgt, r, 0, Math.PI * 2)
  ctx.fillStyle = rgb(col, 0.9)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(x + (c.L.sx > 0 ? r * 0.3 : -r * 0.3) + wind * 1.25, y - hgt - r * 0.3, r * 0.6, 0, Math.PI * 2)
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

function groundTexture(c: Ctx, x: number, y: number, seed: number, col: RGB, count: number) {
  if (!c.detail) return
  const { ctx } = c
  const tileSeed = seed + x * 17.31 + y * 41.73
  const corners = [P(x, y), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1)]
  path(ctx, corners)
  ctx.save()
  ctx.clip()
  ctx.fillStyle = rgb(col, 1, 0.18)
  for (let mark = 0; mark < count; mark++) {
    const u = 0.12 + hash(tileSeed, mark, 31) * 0.76
    const v = 0.12 + hash(tileSeed, mark, 32) * 0.76
    const [px, py] = P(x + u, y + v)
    const size = 0.35 + hash(tileSeed, mark, 33) * 0.55
    ctx.beginPath()
    ctx.ellipse(px, py, size, size * 0.52, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function roadTexture(c: Ctx, x: number, y: number, seed: number) {
  if (!c.detail) return
  const { ctx } = c
  const tileSeed = seed + x * 17.31 + y * 41.73
  ctx.strokeStyle = 'rgba(225,220,205,0.12)'
  ctx.lineWidth = 0.65
  ctx.beginPath()
  for (let mark = 0; mark < 4; mark++) {
    const u = 0.18 + hash(tileSeed, mark, 41) * 0.64
    const v = 0.18 + hash(tileSeed, mark, 42) * 0.64
    const length = 0.035 + hash(tileSeed, mark, 43) * 0.045
    const a = P(x + u, y + v)
    const b = P(x + u + length, y + v + length * 0.25)
    ctx.moveTo(a[0], a[1])
    ctx.lineTo(b[0], b[1])
  }
  ctx.stroke()
}

function facadeTexture(c: Ctx, m: Shape, seed: number) {
  if (!c.detail) return
  const { ctx } = c
  const A = P(m.x0, m.y1)
  const B = P(m.x1, m.y1)
  const C = P(m.x1, m.y0)
  for (const [start, end, side] of [[A, B, 0], [B, C, 1]] as const) {
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(start[0], start[1])
    ctx.lineTo(end[0], end[1])
    ctx.lineTo(end[0], end[1] - m.h)
    ctx.lineTo(start[0], start[1] - m.h)
    ctx.closePath()
    ctx.clip()
    ctx.beginPath()
    for (let mark = 0; mark < 24; mark++) {
      const u = 0.035 + hash(seed, mark, side + 51) * 0.93
      const v = 0.1 + hash(seed, mark, side + 53) * 0.82
      const sx = start[0] + (end[0] - start[0]) * u
      const sy = start[1] + (end[1] - start[1]) * u - m.h * v
      const length = 0.7 + hash(seed, mark, side + 55) * 1.8
      ctx.moveTo(sx, sy)
      ctx.lineTo(sx + length, sy - 0.35)
    }
    ctx.strokeStyle = 'rgba(48,40,32,0.13)'
    ctx.lineWidth = 0.55
    ctx.stroke()
    ctx.restore()
  }
}

function waterRipples(c: Ctx, x: number, y: number) {
  if (!c.detail) return
  const { ctx } = c
  const corners = [P(x, y), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1)]
  path(ctx, corners)
  ctx.save()
  ctx.clip()
  const [cx, cy] = P(x + 0.5, y + 0.5)
  const phase = c.t * 0.7 + x * 1.71 + y * 2.37
  for (let ripple = 0; ripple < 2; ripple++) {
    const drift = ((phase + ripple * 0.8) % 1.6) / 1.6
    const rx = 5 + ripple * 3.5
    const ry = 1.3 + ripple * 0.55
    const cyOffset = (drift - 0.5) * 7
    ctx.beginPath()
    ctx.ellipse(cx + (ripple ? 7 : -6) * (drift - 0.5), cy + cyOffset, rx, ry, -0.08, Math.PI * 1.08, Math.PI * 1.92)
    ctx.strokeStyle = 'rgba(116,166,174,0.12)'
    ctx.lineWidth = 0.8
    ctx.stroke()
  }
  ctx.restore()
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
  const lotW = t.lotW > 0 ? t.lotW : 1
  const lotH = t.lotH > 0 ? t.lotH : 1
  const scaleHeight = 1 + Math.min(0.35, (lotW * lotH - 1) * 0.012)
  const b = (i: number, h: number): Shape => ({
    x0: x + i,
    y0: y + i,
    x1: x + lotW - i,
    y1: y + lotH - i,
    h: h * g * scaleHeight,
  })
  if (t.kind === 'res') {
    if (lotW * lotH >= 4) return [b(0.16, (s < 0.5 ? 2 : 3) * 10.5 + s * 2 + (t.lvl - 1) * 3)]
    if (t.dens === 'low') return [b(0.22, 11 + s * 3)]
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
  if (t.kind === 'pylon') return [r(0.3, 0.3, 0.7, 0.7, 2)]
  if (t.kind === 'substation') return [r(0.08, 0.1, 0.92, 0.9, 8), r(0.12, 0.14, 0.38, 0.48, 12)]
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
  if (t.kind === 'pylon') {
    const [cx, cy] = P(x + 0.5, y + 0.5)
    const h = 62 * Math.min(1, t.grow * 1.2)
    const top = cy - h
    ctx.strokeStyle = busy ? '#969b9e' : '#c4c9ca'
    ctx.lineWidth = 1.7
    ctx.beginPath()
    ctx.moveTo(cx - 8, cy - 1)
    ctx.lineTo(cx - 2, top)
    ctx.lineTo(cx + 2, top)
    ctx.lineTo(cx + 8, cy - 1)
    ctx.moveTo(cx - 6, cy - 1)
    ctx.lineTo(cx + 6, cy - 1)
    ctx.moveTo(cx - 5, cy - h * 0.35)
    ctx.lineTo(cx + 5, cy - h * 0.35)
    ctx.moveTo(cx - 4, cy - h * 0.58)
    ctx.lineTo(cx + 4, cy - h * 0.58)
    ctx.moveTo(cx - 4, cy - h * 0.58)
    ctx.lineTo(cx + 5, cy - h * 0.35)
    ctx.moveTo(cx + 4, cy - h * 0.58)
    ctx.lineTo(cx - 5, cy - h * 0.35)
    ctx.moveTo(cx - 5, cy - h * 0.35)
    ctx.lineTo(cx + 6, cy - 1)
    ctx.moveTo(cx + 5, cy - h * 0.35)
    ctx.lineTo(cx - 6, cy - 1)
    ctx.moveTo(cx - 12, top + 8)
    ctx.lineTo(cx + 12, top + 8)
    ctx.moveTo(cx - 10, top + 15)
    ctx.lineTo(cx + 10, top + 15)
    ctx.stroke()
    ctx.lineWidth = 1
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(cx + side * 12, top + 8)
      ctx.lineTo(cx + side * 17, top + 13)
      ctx.moveTo(cx + side * 10, top + 15)
      ctx.lineTo(cx + side * 14, top + 20)
      ctx.stroke()
    }
  } else if (t.kind === 'substation') {
    const [yard, control] = sh
    box(c, yard.x0, yard.y0, yard.x1, yard.y1, 0, yard.h, hex('#777d7d'), { top: hex('#8c918c') })
    box(c, control.x0, control.y0, control.x1, control.y1, 0, control.h, hex('#b4b1a7'), {
      windows: 'band',
      seed: t.seed,
      top: hex('#777d7d'),
    })
    if (!busy) {
      for (let k = 0; k < 3; k++) {
        const tx = x + 0.48 + k * 0.14
        box(c, tx, y + 0.52, tx + 0.1, y + 0.72, 0, 7, hex('#9c9b8e'), { top: hex('#c1bfae') })
        const [px, py] = P(tx + 0.05, y + 0.55)
        ctx.strokeStyle = '#d1cbb7'
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.moveTo(px, py - 7)
        ctx.lineTo(px, py - 20)
        ctx.lineTo(px + 5, py - 20)
        ctx.moveTo(px + 5, py - 20)
        ctx.lineTo(px + 5, py - 7)
        ctx.stroke()
        ctx.fillStyle = '#d1cbb7'
        ctx.fillRect(px - 1, py - 9, 3, 2)
        ctx.fillRect(px + 4, py - 9, 3, 2)
      }
      const [aX, aY] = P(x + 0.45, y + 0.55)
      const [bX, bY] = P(x + 0.88, y + 0.55)
      ctx.strokeStyle = '#b7b9b3'
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.moveTo(aX, aY - 24)
      ctx.lineTo(bX, bY - 24)
      ctx.stroke()
    }
  } else if (t.kind === 'power') {
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
  const zoneKind = t.kind === 'res' || t.kind === 'com' || t.kind === 'ind' ? t.kind : null
  const variant = zoneKind && !c.classicZoneArt
    ? Math.floor(hash(s, t.lvl + (t.dens === 'high' ? 8 : 0), zoneKind === 'res' ? 1 : zoneKind === 'com' ? 2 : 3) * 100)
    : 0
  const palette = Math.floor(variant / 10)
  const detail = variant % 10
  if (t.kind === 'res') {
    const [m] = sh
    if (!c.classicZoneArt && t.lotW * t.lotH >= 4) {
      mansion(c, m, s, palette, building)
    } else if (t.dens === 'low') {
      const wall = c.classicZoneArt ? pick(HOUSE_WALL, s) : ZONE_FACADE_STYLES.res[palette]
      const roofColor = c.classicZoneArt ? pick(ROOF, s * 7.3) : RES_ROOF_STYLES[palette]
      box(c, m.x0, m.y0, m.x1, m.y1, 0, m.h, wall, { windows: 'house', seed: s })
      roof(c, m, roofColor, s > 0.5)
    } else if (t.lvl === 1) {
      const wall = c.classicZoneArt ? pick(HOUSE_WALL, s) : ZONE_FACADE_STYLES.res[palette]
      box(c, m.x0, m.y0, m.x1, m.y1, 0, m.h, wall, { windows: 'house', seed: s })
      roof(c, m, c.classicZoneArt ? pick(ROOF, s * 7.3) : RES_ROOF_STYLES[palette], c.classicZoneArt ? s > 0.5 : detail % 2 === 0)
    } else if (t.lvl === 2) {
      const wall = c.classicZoneArt ? pick(BRICK, s) : mix(pick(BRICK, s), ZONE_FACADE_STYLES.res[palette], 0.45)
      box(c, m.x0, m.y0, m.x1, m.y1, 0, m.h, wall, { windows: 'grid', seed: s, top: hex('#6b6660') })
    } else if (t.lvl === 3) {
      const wall = c.classicZoneArt ? pick(CONCRETE, s) : mix(pick(CONCRETE, s), ZONE_FACADE_STYLES.res[palette], 0.3)
      box(c, m.x0, m.y0, m.x1, m.y1, 0, m.h, wall, { windows: 'grid', seed: s, top: hex('#8f8a82') })
      if (!building) box(c, m.x0 + 0.15, m.y0 + 0.15, m.x0 + 0.35, m.y0 + 0.35, m.h, 4, hex('#bdb8ae'))
    } else {
      const wall = c.classicZoneArt ? pick(CONCRETE, s * 3.1) : mix(pick(CONCRETE, s * 3.1), ZONE_FACADE_STYLES.res[palette], 0.3)
      box(c, m.x0, m.y0, m.x1, m.y1, 0, m.h, wall, {
        windows: 'band',
        seed: s,
        top: hex('#9c978e'),
      })
      if (!building) box(c, m.x0 + 0.1, m.y0 + 0.1, m.x1 - 0.25, m.y1 - 0.25, m.h, 5, hex('#c8c3b9'))
    }
  } else if (t.kind === 'com') {
    const m = sh[sh.length - 1]
    if (t.lvl === 1) {
      const wall = c.classicZoneArt ? pick(CONCRETE, s) : ZONE_FACADE_STYLES.com[palette]
      box(c, m.x0, m.y0, m.x1, m.y1, 0, m.h, wall, { windows: 'band', seed: s, glass: true })
      // awning
      const col = pick(['#c0392b', '#2e86ab', '#e1a730', '#3c8d5a'].map(hex), s * 5)
      box(c, m.x0, m.y1 - 0.02, m.x1, m.y1 + 0.06, 5, 1.5, col)
    } else if (t.lvl <= 4) {
      const col = c.classicZoneArt
        ? t.lvl === 2 ? pick(CONCRETE, s) : pick(GLASS, s)
        : t.lvl === 2 ? mix(pick(CONCRETE, s), ZONE_FACADE_STYLES.com[palette], 0.5) : GLASS[palette]
      box(c, m.x0, m.y0, m.x1, m.y1, 0, m.h, col, { windows: 'band', seed: s, glass: true, top: hex('#5d6670') })
      if (!building && t.lvl >= 3)
        box(c, m.x0 + 0.12, m.y0 + 0.12, m.x1 - 0.12, m.y1 - 0.12, m.h, 6, hex('#7d868f'))
    } else {
      const [pod, tw] = sh
      const base = c.classicZoneArt ? pick(CONCRETE, s) : mix(pick(CONCRETE, s), ZONE_FACADE_STYLES.com[palette], 0.5)
      box(c, pod.x0, pod.y0, pod.x1, pod.y1, 0, pod.h, base, { windows: 'band', seed: s, glass: true })
      const col = c.classicZoneArt ? pick(GLASS, s * 2.7) : GLASS[palette]
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
    const col = c.classicZoneArt ? pick(IND, s) : ZONE_FACADE_STYLES.ind[palette]
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
  if (!c.classicZoneArt && zoneKind && !(t.kind === 'res' && t.dens === 'low') && detail > 0 && sh.length > 0)
    drawZoneVariant(c, t, sh[sh.length - 1], detail, palette, zoneKind)
  if (
    zoneKind &&
    !(t.kind === 'res' && (t.dens === 'low' || !c.classicZoneArt && t.lotW * t.lotH >= 4)) &&
    sh.length > 0
  ) {
    for (const shape of sh) facadeTexture(c, shape, s + shape.x0 * 17.31 + shape.y0 * 41.73)
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

function mansion(c: Ctx, m: Shape, seed: number, palette: number, building: boolean) {
  const wall = ZONE_FACADE_STYLES.res[palette]
  const stone = mix(wall, [255, 255, 255], 0.42)
  const roofColor = RES_ROOF_STYLES[palette]
  const stories = seed < 0.5 ? 2 : 3
  const width = m.x1 - m.x0
  const depth = m.y1 - m.y0
  const centerX = (m.x0 + m.x1) / 2
  const floorHeight = 10.5
  box(c, m.x0, m.y0, m.x1, m.y1, 0, m.h, wall, {
    windows: 'grid',
    seed,
    top: mix(wall, [255, 255, 255], 0.12),
  })
  mansionWallTexture(c.ctx, m, palette)
  roof(c, m, roofColor, seed > 0.5)
  const wing: Shape = {
    x0: m.x0 + width * 0.06,
    y0: m.y0 + depth * 0.08,
    x1: centerX + width * 0.12,
    y1: m.y0 + depth * 0.42,
    h: Math.min(floorHeight * 0.92, m.h * 0.72),
  }
  box(c, wing.x0, wing.y0, wing.x1, wing.y1, 0, wing.h, mix(wall, [255, 255, 255], 0.04), {
    windows: 'band',
    seed: seed + 0.31,
    top: mix(wall, [255, 255, 255], 0.16),
  })
  mansionWallTexture(c.ctx, wing, palette)
  roof(c, wing, mix(roofColor, [255, 255, 255], 0.08), seed > 0.5)

  const porchWidth = Math.min(0.46, width * 0.34)
  const porchX0 = centerX - porchWidth / 2
  const porchX1 = centerX + porchWidth / 2
  const porchY = m.y1 + 0.07
  const porticoTop = Math.min(floorHeight * 0.78, m.h * 0.38)
  box(c, porchX0 - 0.07, porchY, porchX1 + 0.07, porchY + 0.18, 0, 2, stone, { top: hex('#f4ecdc') })
  box(c, porchX0 - 0.09, porchY + 0.02, porchX1 + 0.09, porchY + 0.14, porticoTop, 2, stone, {
    top: hex('#f5eddf'),
  })

  const ctx = c.ctx
  const gridLine = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
    const [sx0, sy0] = P(x0, y0)
    const [sx1, sy1] = P(x1, y1)
    ctx.moveTo(sx0, sy0 - z0)
    ctx.lineTo(sx1, sy1 - z1)
  }
  ctx.lineWidth = 0.7
  ctx.strokeStyle = rgb(stone, 0.9, 0.8)
  ctx.beginPath()
  for (let floor = 1; floor <= stories; floor++) {
    const z = Math.min(m.h - 1, floor * floorHeight)
    gridLine(m.x0 + 0.025, m.y1 + 0.015, z, m.x1 - 0.025, m.y1 + 0.015, z)
    gridLine(m.x1 + 0.015, m.y1 - 0.025, z, m.x1 + 0.015, m.y0 + 0.025, z)
  }
  const pilasters = [m.x0 + width * 0.08, centerX, m.x1 - width * 0.08]
  for (const px of pilasters) {
    gridLine(px, m.y1 + 0.018, 1.2, px, m.y1 + 0.018, m.h - 2)
    for (const z of [1.2, floorHeight, floorHeight * 2, m.h - 2]) {
      if (z < m.h) {
        gridLine(px - 0.035, m.y1 + 0.02, z, px + 0.035, m.y1 + 0.02, z)
      }
    }
  }
  ctx.stroke()

  const columnXs = [porchX0 + 0.04, porchX1 - 0.04]
  ctx.lineWidth = 2.1
  ctx.strokeStyle = rgb(stone, 1)
  ctx.beginPath()
  for (const px of columnXs) gridLine(px, porchY + 0.1, 2, px, porchY + 0.1, porticoTop)
  ctx.stroke()

  if (m.h > floorHeight + 4) {
    const balconyWidth = Math.min(0.58, width * 0.48)
    const bx0 = centerX - balconyWidth / 2
    const bx1 = centerX + balconyWidth / 2
    const balconyZ = floorHeight + 1.5
    ctx.lineWidth = 0.8
    ctx.strokeStyle = rgb(stone, 0.95)
    ctx.beginPath()
    gridLine(bx0, m.y1 + 0.055, balconyZ, bx1, m.y1 + 0.055, balconyZ)
    gridLine(bx0, m.y1 + 0.055, balconyZ + 2.4, bx1, m.y1 + 0.055, balconyZ + 2.4)
    for (let post = 0; post <= 8; post++) {
      const px = bx0 + ((bx1 - bx0) * post) / 8
      gridLine(px, m.y1 + 0.055, balconyZ, px, m.y1 + 0.055, balconyZ + 2.4)
    }
    ctx.stroke()
  }

  ctx.lineWidth = 0.55
  ctx.strokeStyle = 'rgba(255,255,255,0.28)'
  ctx.beginPath()
  for (let course = 0; course < stories * 2; course++) {
    const z = 2.5 + course * (floorHeight / 2)
    if (z >= m.h - 1) continue
    for (let bay = 0; bay < 5; bay++) {
      const x0 = m.x0 + width * (bay / 5 + 0.035)
      const x1 = x0 + width * 0.035
      gridLine(x0, m.y1 + 0.012, z, x1, m.y1 + 0.012, z)
    }
  }
  ctx.stroke()

  const chimneyX = m.x0 + width * 0.19
  box(
    c,
    chimneyX,
    m.y0 + depth * 0.13,
    chimneyX + 0.075,
    m.y0 + depth * 0.22,
    m.h + 4,
    7,
    mix(wall, [90, 75, 65], 0.38),
  )

  if (!building && seed > 0.3) {
    tree(c, m.x0 + 0.18, m.y1 + 0.34, seed, 0.58)
    tree(c, m.x1 - 0.18, m.y1 + 0.34, 1 - seed, 0.58)
  }
}

function mansionWallTexture(ctx: CanvasRenderingContext2D, m: Shape, palette: number) {
  let patterns = mansionPatterns.get(ctx)
  if (!patterns) {
    patterns = Array(10).fill(null)
    mansionPatterns.set(ctx, patterns)
  }
  if (!patterns[palette]) {
    let texture = mansionTextures[palette]
    if (!texture) {
      texture = document.createElement('canvas')
      texture.width = MANSION_TEXTURE_SIZE
      texture.height = MANSION_TEXTURE_SIZE
      const textureCtx = texture.getContext('2d')
      if (!textureCtx) throw new Error('Unable to create mansion detail texture')

      const seed = 0x9e3779b9 ^ (palette * 0x85ebca6b)
      let state = seed >>> 0
      const random = () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0
        return state / 0x100000000
      }
      const colors = [
        rgb(mix(ZONE_FACADE_STYLES.res[palette], [60, 48, 40], 0.28), 1, 0.24),
        rgb(mix(ZONE_FACADE_STYLES.res[palette], [255, 255, 255], 0.75), 1, 0.38),
        rgb(mix(ZONE_FACADE_STYLES.res[palette], [120, 100, 82], 0.42), 1, 0.2),
        rgb(mix(ZONE_FACADE_STYLES.res[palette], [255, 255, 255], 0.42), 1, 0.3),
      ]
      for (let group = 0; group < colors.length; group++) {
        textureCtx.fillStyle = colors[group]
        for (let i = 0; i < 2500; i++) {
          const x = random() * MANSION_TEXTURE_SIZE
          const y = random() * MANSION_TEXTURE_SIZE
          const width = 0.35 + random() * (group === 3 ? 1.1 : 1.8)
          const height = group === 1 ? 0.35 + random() * 0.8 : 0.35 + random() * 1.35
          textureCtx.fillRect(x, y, width, height)
        }
      }
      mansionTextures[palette] = texture
    }
    patterns[palette] = ctx.createPattern(texture, 'repeat')
    if (!patterns[palette]) throw new Error('Unable to create mansion detail pattern')
  }

  const pattern = patterns[palette]
  if (!pattern) throw new Error('Mansion detail pattern was not initialized')
  const A = P(m.x0, m.y1)
  const B = P(m.x1, m.y1)
  const C = P(m.x1, m.y0)
  const D = P(m.x0, m.y0)
  ctx.save()
  ctx.globalAlpha *= 0.22
  ctx.fillStyle = pattern
  for (const points of [
    [
      [A[0], A[1]],
      [B[0], B[1]],
      [B[0], B[1] - m.h],
      [A[0], A[1] - m.h],
    ],
    [
      [B[0], B[1]],
      [C[0], C[1]],
      [C[0], C[1] - m.h],
      [B[0], B[1] - m.h],
    ],
  ]) {
    ctx.beginPath()
    ctx.moveTo(points[0][0], points[0][1])
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1])
    ctx.closePath()
    ctx.save()
    ctx.clip()
    ctx.fillRect(
      Math.min(A[0], D[0]) - MANSION_TEXTURE_SIZE,
      Math.min(A[1], C[1]) - m.h - MANSION_TEXTURE_SIZE,
      Math.abs(C[0] - A[0]) + MANSION_TEXTURE_SIZE * 2,
      Math.abs(B[1] - D[1]) + m.h + MANSION_TEXTURE_SIZE * 2,
    )
    ctx.restore()
  }
  ctx.restore()
}

function drawZoneVariant(c: Ctx, t: Tile, m: Shape, detail: number, palette: number, kind: 'res' | 'com' | 'ind') {
  if (t.grow < 1) return
  const width = m.x1 - m.x0
  const depth = m.y1 - m.y0
  const accent = mix(ZONE_FACADE_STYLES[kind][palette], [255, 255, 255], 0.3)
  const centerX = (m.x0 + m.x1) / 2
  const centerY = (m.y0 + m.y1) / 2

  if (kind === 'res') {
    if (detail === 1 || detail === 7) {
      const chimneyX = m.x1 - Math.min(0.12, width * 0.18)
      box(c, chimneyX, m.y0 + depth * 0.18, chimneyX + 0.06, m.y0 + depth * 0.3, m.h + 3, detail === 1 ? 5 : 8, accent)
    } else if (detail === 2 || detail === 5 || detail === 8) {
      const porchWidth = Math.min(detail === 8 ? 0.48 : 0.38, width * 0.72)
      const porchX0 = centerX - porchWidth / 2
      const porchX1 = centerX + porchWidth / 2
      const porchY = m.y1 - Math.min(0.08, depth * 0.12)
      box(c, porchX0, porchY, porchX1, porchY + 0.14, 0, 2, accent)
      if (detail === 5) {
        for (const columnX of [porchX0 + 0.025, porchX1 - 0.045]) {
          box(c, columnX, porchY + 0.025, columnX + 0.02, porchY + 0.07, 2, Math.max(3, m.h * 0.55 - 2), hex('#eee7d9'))
        }
        box(c, porchX0 - 0.03, porchY - 0.025, porchX1 + 0.03, porchY + 0.08, m.h * 0.55, 2, accent)
      } else if (detail === 8) {
        box(c, porchX0 - 0.02, porchY - 0.03, porchX1 + 0.02, porchY + 0.08, m.h * 0.62, 2, accent)
      }
    } else if (detail === 3 || detail === 9) {
      const dormerX = detail === 3 ? centerX - 0.08 : m.x0 + width * 0.25
      box(c, dormerX, centerY - 0.05, dormerX + 0.16, centerY + 0.05, m.h + 3, 4, accent, { windows: 'house', seed: t.seed })
    } else if (detail === 4) {
      box(c, centerX - 0.1, m.y1 - 0.025, centerX + 0.1, m.y1 + 0.04, 2, 4, accent, { windows: 'band', seed: t.seed })
    } else if (detail === 6) {
      const wingWidth = Math.min(0.24, width * 0.28)
      box(c, m.x0 + 0.04, centerY - 0.1, m.x0 + 0.04 + wingWidth, centerY + 0.1, 0, m.h * 0.62, accent, {
        windows: 'house',
        seed: t.seed,
      })
    }
    return
  }

  if (kind === 'com') {
    if (detail <= 3) {
      const bandHeight = detail === 1 ? 1.5 : detail === 2 ? 3 : 4.5
      box(c, m.x0 + 0.04, m.y0 + 0.04, m.x1 - 0.04, m.y1 - 0.04, m.h, bandHeight, accent)
    } else if (detail <= 6) {
      const trimWidth = Math.min(0.045, width * 0.12)
      const trimXs =
        detail === 4 ? [m.x0 + 0.06] : detail === 5 ? [m.x1 - 0.06 - trimWidth] : [m.x0 + 0.06, m.x1 - 0.06 - trimWidth]
      for (const trimX of trimXs) {
        box(c, trimX, m.y0 + 0.06, trimX + trimWidth, m.y1 - 0.06, 0, m.h, accent)
      }
    } else if (detail <= 8) {
      const unitWidth = Math.min(0.14, width * 0.25)
      box(c, centerX - unitWidth / 2, centerY - 0.08, centerX + unitWidth / 2, centerY + 0.08, m.h, detail === 7 ? 4 : 7, accent)
    } else {
      const inset = Math.min(0.12, width * 0.18, depth * 0.18)
      box(c, m.x0 + inset, m.y0 + inset, m.x1 - inset, m.y1 - inset, m.h, 5, accent)
    }
    return
  }

  if (detail <= 3) {
    const ventSize = Math.min(0.12, width * 0.22, depth * 0.22)
    const ventX = m.x0 + 0.08 + ((detail - 1) % 2) * Math.max(0.12, width - ventSize - 0.16)
    box(c, ventX, centerY - ventSize / 2, ventX + ventSize, centerY + ventSize / 2, m.h, detail === 3 ? 5 : 3, accent)
  } else if (detail <= 6) {
    const skylightX = m.x0 + width * (detail === 4 ? 0.25 : detail === 5 ? 0.5 : 0.68)
    box(c, skylightX, centerY - 0.1, skylightX + Math.min(0.18, width * 0.24), centerY + 0.1, m.h, 2, hex('#8fb3bd'))
  } else {
    const stackX = m.x0 + width * (detail === 7 ? 0.28 : detail === 8 ? 0.5 : 0.72)
    box(c, stackX, centerY - 0.06, stackX + Math.min(0.07, width * 0.12), centerY + 0.06, m.h, detail === 9 ? 16 : 10, accent)
    box(c, stackX - 0.025, centerY - 0.08, stackX + Math.min(0.095, width * 0.16), centerY + 0.08, m.h + (detail === 9 ? 14 : 8), 2, hex('#777b7b'))
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
    waterRipples(c, x, y)
    // shoreline
    for (const [dx, dy] of DIRS) {
      const n = city.tile(x + dx, y + dy)
      if (n && !n.water) edgeStrip(ctx, x, y, dx, dy, 0.12, 'rgba(196,184,150,0.55)')
    }
  } else {
    diamond()
    let col = pick(GRASS, t.seed)
    if (t.kind === 'park') col = mix(col, hex('#8fbf5a'), 0.45)
    if (isService(t.kind) || t.kind === 'pylon') col = hex('#b4afa4')
    if (t.ruin) col = hex('#5b5248')
    if (isZone(t.kind) && t.lvl > 0) {
      col = t.kind === 'res' ? mix(col, hex('#86a35c'), 0.3) : t.kind === 'com' ? hex('#b8b3a8') : hex('#8f8b82')
    }
    ctx.fillStyle = rgb(col)
    ctx.fill()
    if (t.kind === 'none' || t.kind === 'park' || isZone(t.kind) && t.lvl > 0) {
      groundTexture(c, x, y, t.seed, mix(col, hex('#283020'), 0.34), t.kind === 'park' ? 8 : 5)
    }
  }

  if (t.kind === 'road') road(c, city, t, x, y)
  else if (t.kind === 'highway') highway(c, x, y)
  else if (isZone(t.kind) && t.lvl === 0 && !t.ruin && t.lotId == null) {
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
  roadTexture(c, x, y, t.seed)
  ctx.strokeStyle = 'rgba(225,220,205,0.24)'
  ctx.lineWidth = 0.7
  ctx.stroke()
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
  const straight =
    conn.length === 2 &&
    ((conn[0][0] === -conn[1][0] && conn[0][1] === 0 && conn[1][1] === 0) ||
      (conn[0][1] === -conn[1][1] && conn[0][0] === 0 && conn[1][0] === 0))
  if (straight) {
    const alongX = conn[0][0] !== 0
    const line = (offset: number) => {
      const a = alongX ? P(x, y + offset) : P(x + offset, y)
      const b = alongX ? P(x + 1, y + offset) : P(x + offset, y + 1)
      ctx.beginPath()
      ctx.moveTo(a[0], a[1])
      ctx.lineTo(b[0], b[1])
      ctx.stroke()
    }
    ctx.strokeStyle = 'rgba(255,205,80,0.9)'
    ctx.lineWidth = 0.85
    line(0.485)
    line(0.515)
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

function powerLines(c: Ctx, city: City, visible: (x: number, y: number) => boolean) {
  const { ctx } = c
  const cableSpans = new Map<
    string,
    [[number, number], [number, number], OverheadLineType]
  >()
  const lineHeight: Record<OverheadLineType, number> = {
    transmission: 84,
    distribution: 56,
    service: 34,
    swer: 46,
  }
  const wireHeight: Record<OverheadLineType, number> = {
    transmission: 80,
    distribution: 54,
    service: 32,
    swer: 44,
  }
  const conductorCount: Record<OverheadLineType, number> = {
    transmission: 3,
    distribution: 3,
    service: 2,
    swer: 1,
  }
  for (let i = 0; i < city.tiles.length; i++) {
    const tile = city.tiles[i]
    if (!tile.overheadCable) continue
    const type = tile.overheadType ?? 'distribution'
    const x = i % N
    const y = (i / N) | 0
    for (const [dx, dy] of DIRS) {
      const nx = x + dx
      const ny = y + dy
      const neighbor = city.tile(nx, ny)
      if (
        !neighbor ||
        !(neighbor.overheadCable ||
          neighbor.kind === 'pylon' ||
          neighbor.kind === 'substation' ||
          neighbor.kind === 'road' && neighbor.connected) ||
        !visible(x, y) && !visible(nx, ny)
      )
        continue
      const a: [number, number] = i < idx(nx, ny) ? [x, y] : [nx, ny]
      const b: [number, number] = i < idx(nx, ny) ? [nx, ny] : [x, y]
      cableSpans.set(`${idx(a[0], a[1])}:${idx(b[0], b[1])}`, [a, b, type])
    }
  }
  for (const [[ax, ay], [bx, by], type] of cableSpans.values()) {
    const [count, height] = [conductorCount[type], wireHeight[type]]
    const [a0, a1] = P(ax + 0.5, ay + 0.5)
    const [b0, b1] = P(bx + 0.5, by + 0.5)
    const dx = b0 - a0
    const dy = b1 - a1
    const length = Math.hypot(dx, dy) || 1
    const nx = -dy / length
    const ny = dx / length
    const spacing = type === 'transmission' ? 5 : 3
    ctx.setLineDash(type === 'swer' ? [5, 3] : [])
    for (let conductor = 0; conductor < count; conductor++) {
      const offset = (conductor - (count - 1) / 2) * spacing
      const startX = a0 + nx * offset
      const startY = a1 - height + ny * offset
      const endX = b0 + nx * offset
      const endY = b1 - height + ny * offset
      ctx.beginPath()
      ctx.moveTo(startX, startY)
      ctx.quadraticCurveTo((startX + endX) / 2, (startY + endY) / 2 + 3, endX, endY)
      ctx.strokeStyle = type === 'transmission' ? '#d2d7d2' : '#c7c9c4'
      ctx.lineWidth = type === 'transmission' ? 1.1 : 0.9
      ctx.stroke()
    }
    ctx.setLineDash([])
  }

  for (let i = 0; i < city.tiles.length; i++) {
    const tile = city.tiles[i]
    if (!tile.overheadCable) continue
    const type = tile.overheadType ?? 'distribution'
    const x = i % N
    const y = (i / N) | 0
    if (!visible(x, y)) continue
    const sameTypeNeighbors = DIRS.filter(([dx, dy]) => {
      const neighbor = city.tile(x + dx, y + dy)
      return neighbor?.overheadCable && (neighbor.overheadType ?? 'distribution') === type
    })
    const isBend =
      sameTypeNeighbors.length === 2 &&
      sameTypeNeighbors[0][0] !== -sameTypeNeighbors[1][0] &&
      sameTypeNeighbors[0][1] !== -sameTypeNeighbors[1][1]
    const supportSpacing = type === 'transmission' || type === 'swer' ? 4 : type === 'distribution' ? 2 : 1
    if (sameTypeNeighbors.length === 2 && !isBend && (x + y) % supportSpacing !== 0) continue

    const height = lineHeight[type]
    const metal = type === 'transmission' ? '#aab2b0' : type === 'service' ? '#937959' : '#88735b'
    const armHeight = wireHeight[type] - 5
    const shaftWidth = type === 'transmission' ? 0.022 : type === 'service' ? 0.03 : 0.038
    const shaftColor = hex(metal)
    const shaftHighlight = rgb(shaftColor, 1.25)
    const shaftShadow = rgb(shaftColor, 0.58)
    const pole = (gx: number, gy: number, poleHeight: number) => {
      const [px, py] = P(gx, gy)
      ctx.lineCap = 'round'
      ctx.strokeStyle = shaftShadow
      ctx.lineWidth = type === 'transmission' ? 2.3 : 2
      ctx.beginPath()
      ctx.moveTo(px + 0.6, py)
      ctx.lineTo(px + 0.6, py - poleHeight)
      ctx.stroke()
      ctx.strokeStyle = shaftHighlight
      ctx.lineWidth = 0.8
      ctx.beginPath()
      ctx.moveTo(px - 0.3, py - 1)
      ctx.lineTo(px - 0.3, py - poleHeight)
      ctx.stroke()
      return [px, py - poleHeight] as const
    }

    if (type === 'transmission') {
      const feet: [number, number][] = [
        [x + 0.34, y + 0.34],
        [x + 0.66, y + 0.34],
        [x + 0.34, y + 0.66],
        [x + 0.66, y + 0.66],
      ]
      const top: [number, number][] = [
        [x + 0.45, y + 0.45],
        [x + 0.55, y + 0.45],
        [x + 0.45, y + 0.55],
        [x + 0.55, y + 0.55],
      ]
      for (let leg = 0; leg < feet.length; leg++) {
        const [fx, fy] = P(...feet[leg])
        const [tx, ty] = P(...top[leg])
        ctx.strokeStyle = shaftShadow
        ctx.lineWidth = 1.3
        ctx.beginPath()
        ctx.moveTo(fx, fy - 3)
        ctx.lineTo(tx, ty - height)
        ctx.stroke()
        ctx.strokeStyle = shaftHighlight
        ctx.lineWidth = 0.55
        ctx.beginPath()
        ctx.moveTo(fx - 0.4, fy - 3)
        ctx.lineTo(tx - 0.4, ty - height)
        ctx.stroke()
      }
      for (const [level, halfWidth] of [[0.55, 0.27], [0.75, 0.23], [0.93, 0.19]] as const) {
        const z = height * level
        const [aX, aY] = P(x + 0.5 - halfWidth, y + 0.5)
        const [bX, bY] = P(x + 0.5 + halfWidth, y + 0.5)
        ctx.strokeStyle = shaftShadow
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(aX, aY - z)
        ctx.lineTo(bX, bY - z)
        ctx.stroke()
        ctx.strokeStyle = shaftHighlight
        ctx.lineWidth = 0.8
        ctx.beginPath()
        ctx.moveTo(aX, aY - z - 0.5)
        ctx.lineTo(bX, bY - z - 0.5)
        ctx.stroke()
      }
      const [cx, cy] = P(x + 0.5, y + 0.5)
      ctx.strokeStyle = shaftShadow
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(cx - 3, cy - height * 0.55)
      ctx.lineTo(cx + 3, cy - height * 0.75)
      ctx.moveTo(cx + 3, cy - height * 0.55)
      ctx.lineTo(cx - 3, cy - height * 0.75)
      ctx.stroke()
    } else {
      const [poleX, poleY] = pole(x + 0.5, y + 0.5, height)
      const armHalfWidth = type === 'distribution' ? 10 : type === 'service' ? 5 : 8
      const armZ = type === 'service' ? armHeight + 1 : armHeight
      ctx.strokeStyle = shaftShadow
      ctx.lineWidth = 2.4
      ctx.beginPath()
      ctx.moveTo(poleX - armHalfWidth, poleY + height - armZ)
      ctx.lineTo(poleX + armHalfWidth, poleY + height - armZ)
      ctx.stroke()
      ctx.strokeStyle = shaftHighlight
      ctx.lineWidth = 0.9
      ctx.beginPath()
      ctx.moveTo(poleX - armHalfWidth, poleY + height - armZ - 0.6)
      ctx.lineTo(poleX + armHalfWidth, poleY + height - armZ - 0.6)
      ctx.stroke()
      const insulators = type === 'distribution' ? [-5, 0, 5] : type === 'service' ? [-2, 2] : [0]
      for (const offset of insulators) {
        ctx.fillStyle = '#b7b2a4'
        ctx.beginPath()
        ctx.ellipse(poleX + offset, poleY + height - armZ - 1.5, 1.5, 2.2, 0, 0, Math.PI * 2)
        ctx.fill()
      }
      if (type === 'swer') {
        const [px, py] = P(x + 0.68, y + 0.5)
        ctx.strokeStyle = '#a99568'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(px, py - 2)
        ctx.lineTo(px, py + 4)
        ctx.moveTo(px - 4, py + 4)
        ctx.lineTo(px + 4, py + 4)
        ctx.stroke()
      }
    }
    ctx.lineCap = 'butt'
  }

  const spans = new Map<string, [[number, number], [number, number], number]>()
  for (let i = 0; i < city.tiles.length; i++) {
    const tile = city.tiles[i]
    if (tile.kind !== 'pylon' || !tile.power) continue
    const x = i % N
    const y = (i / N) | 0
    let nearest = Infinity
    let target: [number, number] | null = null
    for (let dy = -8; dy <= 8; dy++) {
      for (let dx = -8; dx <= 8; dx++) {
        const distance = dx * dx + dy * dy
        if (distance === 0 || distance > 64 || distance > nearest) continue
        const nx = x + dx
        const ny = y + dy
        if (!inside(nx, ny)) continue
        const neighbor = city.tiles[idx(nx, ny)]
        if (
          !neighbor.power ||
          !(neighbor.kind === 'pylon' ||
            neighbor.kind === 'substation' ||
            neighbor.undergroundCable ||
            neighbor.overheadCable ||
            neighbor.kind === 'road' && neighbor.connected)
        )
          continue
        nearest = distance
        target = [nx, ny]
      }
    }
    if (!target || !visible(x, y) && !visible(target[0], target[1])) continue
    const [nx, ny] = target
    const a: [number, number] = i < idx(nx, ny) ? [x, y] : [nx, ny]
    const b: [number, number] = i < idx(nx, ny) ? [nx, ny] : [x, y]
    const key = `${idx(a[0], a[1])}:${idx(b[0], b[1])}`
    if (!spans.has(key)) spans.set(key, [a, b, i])
  }

  ctx.strokeStyle = 'rgba(205,211,209,0.65)'
  ctx.lineWidth = 0.8
  for (const [[ax, ay], [bx, by]] of spans.values()) {
    const [a0, a1] = P(ax + 0.5, ay + 0.5)
    const [b0, b1] = P(bx + 0.5, by + 0.5)
    ctx.beginPath()
    for (const offset of [-4, 0, 4]) {
      ctx.moveTo(a0 + offset, a1 - 48)
      ctx.quadraticCurveTo((a0 + b0) / 2 + offset, (a1 + b1) / 2 - 54, b0 + offset, b1 - 48)
    }
    ctx.stroke()
  }

  ctx.save()
  ctx.shadowColor = '#ffe58a'
  ctx.shadowBlur = 7
  for (const [[ax, ay], [bx, by], seed] of spans.values()) {
    const [a0, a1] = P(ax + 0.5, ay + 0.5)
    const [b0, b1] = P(bx + 0.5, by + 0.5)
    const phase = ((c.t * 0.45 + hash(ax + ay, bx, seed)) % 1 + 1) % 1
    for (let pulse = 0; pulse < 2; pulse++) {
      const progress = (phase + pulse * 0.5) % 1
      const inverse = 1 - progress
      const px = inverse * inverse * a0 + 2 * inverse * progress * ((a0 + b0) / 2) + progress * progress * b0
      const py = inverse * inverse * (a1 - 48) + 2 * inverse * progress * ((a1 + b1) / 2 - 54) + progress * progress * (b1 - 48)
      ctx.beginPath()
      ctx.arc(px, py, 1.8, 0, Math.PI * 2)
      ctx.fillStyle = '#fff2b0'
      ctx.fill()
    }
  }
  ctx.restore()
}

function infoView(ctx: CanvasRenderingContext2D, city: City, view: View, visible: (x: number, y: number) => boolean) {
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (!visible(x, y)) continue
      const t = city.tiles[idx(x, y)]
      let fill: string | null = null
      const built =
        (isZone(t.kind) && t.lvl > 0) ||
        isService(t.kind) ||
        t.kind === 'pylon' ||
        t.undergroundCable ||
        t.overheadCable
      if (view === 'power' && (t.undergroundCable || t.overheadCable))
        fill = t.power ? 'rgba(250,210,60,0.7)' : 'rgba(230,60,50,0.7)'
      else if (view === 'power' && (t.kind === 'road' || t.kind === 'pylon'))
        fill = t.power ? 'rgba(250,210,60,0.7)' : t.kind === 'pylon' ? 'rgba(230,60,50,0.7)' : null
      else if (view === 'power' && built)
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
      if ((tl.lvl > 0 && isZone(tl.kind)) || isService(tl.kind) || tl.kind === 'pylon') {
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
      } else if (isService(tl.kind) || tl.kind === 'pylon') service(c, tl, x, y)
    }
  }

  powerLines(c, city, visible)

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
  const activeKind = ov.tool === 'pan' || ov.tool === 'inspect' ? undefined : ITEM[ov.tool].kind
  if (activeKind && isZone(activeKind)) {
    const zoning = city.zoningTiles()
    for (let i = 0; i < zoning.length; i++) {
      if (!zoning[i] || !visible(i % N, (i / N) | 0)) continue
      const tile = city.tiles[i]
      if (tile.kind !== 'none') continue
      const x = i % N
      const y = (i / N) | 0
      gp(ctx, [x, y, x + 1, y, x + 1, y + 1, x, y + 1])
      ctx.fillStyle = 'rgba(127,209,122,0.08)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(175,235,150,0.42)'
      ctx.lineWidth = 0.65 / cam.z
      ctx.stroke()
    }
  }
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
    classicZoneArt: true,
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
    lotId: null,
    lotW: 0,
    lotH: 0,
    pipe: false,
    pipeOn: false,
    undergroundCable: false,
    overheadCable: false,
    overheadType: null,
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
    const levels = item.kind === 'com' && high ? [3, 4, 5] : null
    for (const [position, tileIndex] of [3, 4, 5].entries()) {
      Object.assign(grid[tileIndex], {
        kind: item.kind,
        dens: item.dens ?? 'low',
        lvl: levels?.[position] ?? (item.kind === 'ind' ? (high ? 3 : 2) : high ? 4 : 1),
        seed: [0.34, 0.62, 0.83][position],
      })
    }
    tall = high ? 150 : 40
    for (const k of [6, 7, 8]) Object.assign(grid[k], { kind: 'road' })
  } else if (item.kind === 'park') {
    centre.kind = 'park'
    centre.trees = 3
    centre.seed = 0.8
  } else if (item.kind) {
    centre.kind = item.kind
    tall = item.kind === 'wind' ? 100 : item.kind === 'pylon' ? 80 : 60
    for (const k of [6, 7, 8]) Object.assign(grid[k], { kind: 'road' })
    if (item.kind === 'pump') for (const k of [2, 5, 8]) Object.assign(grid[k], { water: true, kind: 'none' })
  } else if (id === 'pipe') {
    for (const k of [1, 4, 7]) grid[k].pipe = true
  } else if (id === 'cable') {
    for (const k of [1, 4, 7]) grid[k].undergroundCable = true
  } else if (id.startsWith('overhead_')) {
    const type: OverheadLineType = id === 'overhead_transmission'
      ? 'transmission'
      : id === 'overhead_service'
        ? 'service'
        : id === 'overhead_swer'
          ? 'swer'
          : 'distribution'
    for (const k of [1, 4, 7]) {
      grid[k].overheadCable = true
      grid[k].overheadType = type
    }
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
  } else if (id === 'cable' || id.startsWith('overhead_')) {
    const overhead = id.startsWith('overhead_')
    const type: OverheadLineType = id === 'overhead_transmission'
      ? 'transmission'
      : id === 'overhead_service'
        ? 'service'
        : id === 'overhead_swer'
          ? 'swer'
          : 'distribution'
    const height = type === 'transmission' ? 34 : type === 'distribution' ? 27 : type === 'service' ? 20 : 24
    const conductors = type === 'transmission' || type === 'distribution' ? 3 : type === 'service' ? 2 : 1
    ctx.strokeStyle = id === 'cable' ? '#e9b824' : '#d0d5d4'
    ctx.lineWidth = id === 'cable' ? 3 : type === 'transmission' ? 1.3 : 1
    if (id === 'cable') ctx.setLineDash([5, 3])
    const a = P(1.5, 0.5)
    const b = P(1.5, 2.5)
    for (let wire = 0; wire < conductors; wire++) {
      const offset = (wire - (conductors - 1) / 2) * 3
      ctx.beginPath()
      ctx.moveTo(a[0] + offset, a[1] - (overhead ? height : 0))
      ctx.lineTo(b[0] + offset, b[1] - (overhead ? height : 0))
      ctx.stroke()
    }
    if (overhead) {
      const poleColor = type === 'transmission' ? '#747d7d' : type === 'service' ? '#82684c' : '#75634f'
      ctx.strokeStyle = poleColor
      ctx.lineWidth = type === 'transmission' ? 2 : 1.5
      for (const y of [0.5, 1.5, 2.5]) {
        const [px, py] = P(1.5, y)
        const top = py - height
        ctx.beginPath()
        ctx.moveTo(px, py)
        ctx.lineTo(px, top)
        ctx.moveTo(px - (type === 'transmission' ? 8 : 5), top + 5)
        ctx.lineTo(px + (type === 'transmission' ? 8 : 5), top + 5)
        ctx.stroke()
      }
    }
    ctx.setLineDash([])
  }
  ctx.fillStyle = 'rgba(20,16,30,0.3)'
  for (let y = 0; y < 3; y++)
    for (let x = 0; x < 3; x++) {
      const t = grid[y * 3 + x]
      if ((t.lvl > 0 && isZone(t.kind)) || isService(t.kind) || t.kind === 'pylon')
        for (const m of shapes(t, x, y)) shadowOf(c, m.x0, m.y0, m.x1, m.y1, m.h)
    }
  for (let s = 0; s < 5; s++)
    for (let x = Math.max(0, s - 2); x <= Math.min(2, s); x++) {
      const y = s - x
      const t = grid[y * 3 + x]
      if (t.trees && t.kind !== 'road') for (let k = 0; k < t.trees; k++) tree(c, x + TREE_SPOTS[k][0], y + TREE_SPOTS[k][1], hash(t.seed, k, 1))
      if (t.ruin) rubble(c, t, x, y)
      else if (t.lvl > 0 && isZone(t.kind)) building(c, t, x, y)
      else if (isService(t.kind) || t.kind === 'pylon') service(c, t, x, y)
    }
}