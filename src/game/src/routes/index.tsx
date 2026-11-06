import { useEffect, useRef, useState } from 'react'
import type { ComponentType } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import {
  Building2,
  Droplet,
  Droplets,
  Factory,
  Flame,
  GraduationCap,
  Hand,
  Hospital,
  House,
  Milestone,
  Route as RouteIcon,
  Search,
  ShieldCheck,
  Shovel,
  Signpost,
  Smartphone,
  Star,
  Store,
  Sun,
  Trees,
  Warehouse,
  Wind,
  X,
  Zap,
} from 'lucide-react'
import {
  City,
  PROBLEM_LABEL,
  ROAD_CAP,
  SERVICE_INFO,
  dragCells,
  idx,
  isPowerKind,
  isService,
  isZone,
  type BuildTool,
  type CityEvent,
  type Problem,
  type Review,
  type Stats,
  type Tile,
  type Tool,
} from '../../engine'
import { GROUPS, ITEM, ITEMS } from '../../catalog'
import type { Group, ItemId } from '../../catalog'
import { MAP_CENTER, drawPreview, render, screenToTile } from '../../render'
import type { Camera, View } from '../../render'

export const Route = createFileRoute('/')({ 
    component: Game,
})

type Icon = ComponentType<{ className?: string }>
const ICON: Record<ItemId, Icon> = {
  street: RouteIcon,
  avenue: Milestone,
  gravel: Signpost,
  res_low: House,
  res_high: Building2,
  com_low: Store,
  com_high: Building2,
  ind_light: Warehouse,
  ind_heavy: Factory,
  park: Trees,
  power: Zap,
  solar: Sun,
  wind: Wind,
  pump: Droplets,
  pipe: Droplet,
  fire: Flame,
  police: ShieldCheck,
  health: Hospital,
  school: GraduationCap,
  bulldoze: Shovel,
}
const GROUP_ICON: Record<Group, Icon> = {
  roads: RouteIcon,
  zones: House,
  power: Zap,
  water: Droplets,
  services: ShieldCheck,
  tools: Shovel,
}
const ICON_TINT: Record<ItemId, string> = {
  street: 'text-stone-200',
  avenue: 'text-stone-200',
  gravel: 'text-amber-300',
  res_low: 'text-emerald-300',
  res_high: 'text-emerald-300',
  com_low: 'text-sky-300',
  com_high: 'text-sky-300',
  ind_light: 'text-amber-300',
  ind_heavy: 'text-amber-300',
  park: 'text-lime-300',
  power: 'text-yellow-300',
  solar: 'text-yellow-300',
  wind: 'text-yellow-300',
  pump: 'text-blue-300',
  pipe: 'text-blue-300',
  fire: 'text-red-300',
  police: 'text-indigo-300',
  health: 'text-pink-300',
  school: 'text-orange-300',
  bulldoze: 'text-red-300',
}

const VIEWS: [View, string][] = [
  ['none', 'Normal'],
  ['power', 'Electricity'],
  ['water', 'Water'],
  ['pollution', 'Pollution'],
  ['crime', 'Crime'],
  ['traffic', 'Traffic'],
  ['value', 'Land value'],
  ['services', 'Coverage'],
]

const PROBLEM_ORDER: Problem[] = ['fire', 'power', 'water', 'crime', 'pollution', 'traffic', 'health', 'education', 'abandoned', 'ruin']

interface Inspect {
  x: number
  y: number
  tile: Tile
}

function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cityRef = useRef<City | null>(null)
  const camRef = useRef<Camera>({ x: 0, y: 0, z: 0.8 })
  const toolRef = useRef<Tool>('street')
  const viewRef = useRef<View>('none')
  const speedRef = useRef(1)
  const selRef = useRef<[number, number] | null>(null)
  const [tool, setTool] = useState<Tool>('street')
  const [group, setGroup] = useState<Group | null>('roads')
  const [phone, setPhone] = useState(false)
  const [reviews, setReviews] = useState<Review[]>([])
  const [view, setView] = useState<View>('none')
  const [speed, setSpeed] = useState(1)
  const [stats, setStats] = useState<Stats | null>(null)
  const [events, setEvents] = useState<CityEvent[]>([])
  const [msg, setMsg] = useState('Drag roads off the highway, then zone land beside them.')
  const [info, setInfo] = useState<Inspect | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const city = new City()
    cityRef.current = city
    const cam = camRef.current
    let w = 0
    let h = 0
    let dpr = Math.min(2, window.devicePixelRatio || 1)
    const resize = () => {
      const nextWidth = canvas.clientWidth
      const nextHeight = canvas.clientHeight
      const nextDpr = Math.min(2, window.devicePixelRatio || 1)
      if (nextWidth === w && nextHeight === h && nextDpr === dpr) return
      w = nextWidth
      h = nextHeight
      dpr = nextDpr
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
    }
    resize()
    cam.x = w / 2 - MAP_CENTER[0] * cam.z
    cam.y = h / 2 - MAP_CENTER[1] * cam.z
    window.addEventListener('resize', resize)

    let hover: [number, number] | null = null
    let start: [number, number] | null = null
    let panFrom: [number, number] | null = null
    const pointers = new Map<number, [number, number]>()
    let pinch = 0
    const tileAt = (cx: number, cy: number) => {
      const r = canvas.getBoundingClientRect()
      return screenToTile(cam, cx - r.left, cy - r.top)
    }
    const zoomAt = (mx: number, my: number, nz: number) => {
      nz = Math.max(0.3, Math.min(2.8, nz))
      cam.x = mx - ((mx - cam.x) * nz) / cam.z
      cam.y = my - ((my - cam.y) * nz) / cam.z
      cam.z = nz
    }
    const down = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId)
      pointers.set(e.pointerId, [e.clientX, e.clientY])
      hover = tileAt(e.clientX, e.clientY)
      if (pointers.size === 2) {
        start = null
        const [a, b] = [...pointers.values()]
        pinch = Math.hypot(a[0] - b[0], a[1] - b[1])
        panFrom = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
        return
      }
      const t = toolRef.current
      if (t === 'pan' || e.button === 1 || e.button === 2) panFrom = [e.clientX, e.clientY]
      else if (t === 'inspect') {
        const [x, y] = tileAt(e.clientX, e.clientY)
        const tile = city.tile(x, y)
        selRef.current = tile ? [x, y] : null
        setInfo(tile ? { x, y, tile: { ...tile } } : null)
      } else start = tileAt(e.clientX, e.clientY)
    }
    const move = (e: PointerEvent) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [e.clientX, e.clientY])
      if (pointers.size === 2 && panFrom) {
        const [a, b] = [...pointers.values()]
        const d = Math.hypot(a[0] - b[0], a[1] - b[1])
        const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
        cam.x += mid[0] - panFrom[0]
        cam.y += mid[1] - panFrom[1]
        panFrom = mid
        const r = canvas.getBoundingClientRect()
        if (pinch > 0) zoomAt(mid[0] - r.left, mid[1] - r.top, cam.z * (d / pinch))
        pinch = d
        return
      }
      if (panFrom) {
        cam.x += e.clientX - panFrom[0]
        cam.y += e.clientY - panFrom[1]
        panFrom = [e.clientX, e.clientY]
      }
      hover = tileAt(e.clientX, e.clientY)
    }
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
      hover = tileAt(e.clientX, e.clientY)
      const t = toolRef.current
      if (start && hover && t !== 'pan' && t !== 'inspect') {
        const res = city.apply(t, dragCells(t, start, hover))
        if (res.ok) setMsg(`Built ${res.count} tile${res.count === 1 ? '' : 's'} for $${res.cost.toLocaleString()}`)
        else if (res.reason) setMsg(res.reason)
      }
      start = null
      if (pointers.size === 0) panFrom = null
      else if (pointers.size === 1) panFrom = [...pointers.values()][0]
      pinch = 0
    }
    const cancel = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
      start = null
      hover = tileAt(e.clientX, e.clientY)
      panFrom = pointers.size === 1 ? [...pointers.values()][0] : null
      pinch = 0
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = canvas.getBoundingClientRect()
      zoomAt(e.clientX - r.left, e.clientY - r.top, cam.z * (e.deltaY < 0 ? 1.1 : 0.9))
    }
    // Held keys pan smoothly (WASD / arrows), R/F zoom, Shift speeds up.
    const held = new Set<string>()
    let mouse: [number, number] | null = null
    const keys = (e: KeyboardEvent) => {
      if (
        e.defaultPrevented ||
        e.altKey ||
        e.ctrlKey ||
        e.metaKey ||
        (e.target instanceof Element &&
          (e.target instanceof HTMLElement && e.target.isContentEditable ||
            e.target.closest('input, textarea, select, button, a, [contenteditable="true"], [role="slider"]') !== null))
      ) return
      if (e.repeat) return
      const k = e.key.toLowerCase()
      if (['w', 'a', 's', 'd', 'r', 'f', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) {
        held.add(k)
        if (k.startsWith('arrow')) e.preventDefault()
      } else if (e.key === '+' || e.key === '=') zoomAt(w / 2, h / 2, cam.z * 1.15)
      else if (e.key === '-') zoomAt(w / 2, h / 2, cam.z / 1.15)
      else if (e.key === ' ') {
        e.preventDefault()
        speedRef.current = speedRef.current ? 0 : 1
        setSpeed(speedRef.current)
      } else if (e.key === '1' || e.key === '2' || e.key === '3') {
        speedRef.current = [1, 3, 8][Number(e.key) - 1]
        setSpeed(speedRef.current)
      } else if (k === 'b') {
        toolRef.current = 'bulldoze'
        setTool('bulldoze')
      } else if (k === 'p') setPhone((v) => !v)
      else if (e.key === 'Escape') {
        selRef.current = null
        setInfo(null)
        toolRef.current = 'pan'
        setTool('pan')
        setGroup(null)
      }
    }
    const keyUp = (e: KeyboardEvent) => held.delete(e.key.toLowerCase())
    const blur = () => held.clear()
    const track = (e: PointerEvent) => (mouse = [e.clientX, e.clientY])
    const leave = () => (mouse = null)
    const moveCamera = (dt: number) => {
      const sp = (held.has('shift') ? 1400 : 650) * dt
      let vx = 0
      let vy = 0
      if (held.has('a') || held.has('arrowleft')) vx += 1
      if (held.has('d') || held.has('arrowright')) vx -= 1
      if (held.has('w') || held.has('arrowup')) vy += 1
      if (held.has('s') || held.has('arrowdown')) vy -= 1
      if (mouse && !panFrom) {
        const r = canvas.getBoundingClientRect()
        const edge = 6
        if (mouse[0] - r.left < edge) vx += 1
        else if (r.right - mouse[0] < edge) vx -= 1
        if (mouse[1] - r.top < edge) vy += 1
        else if (r.bottom - mouse[1] < edge) vy -= 1
      }
      cam.x += vx * sp
      cam.y += vy * sp
      if (held.has('r')) zoomAt(w / 2, h / 2, cam.z * (1 + dt * 1.6))
      if (held.has('f')) zoomAt(w / 2, h / 2, cam.z / (1 + dt * 1.6))
    }
    const noMenu = (e: Event) => e.preventDefault()
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', cancel)
    canvas.addEventListener('wheel', wheel, { passive: false })
    canvas.addEventListener('contextmenu', noMenu)
    window.addEventListener('keydown', keys)
    window.addEventListener('keyup', keyUp)
    window.addEventListener('blur', blur)
    canvas.addEventListener('pointermove', track)
    canvas.addEventListener('pointerleave', leave)

    let raf = 0
    let last = performance.now()
    let statAcc = 0
    let seen = 0
    const frame = (now: number) => {
      resize()
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      moveCamera(dt)
      city.step(dt * speedRef.current)
      const t = toolRef.current
      const building = t !== 'pan' && t !== 'inspect'
      const cells = start && hover && building ? dragCells(t, start, hover) : hover && building ? dragCells(t, hover, hover) : []
      const valid = new Set<number>()
      if (building) for (const [x, y] of city.plan(t as BuildTool, cells).valid) valid.add(idx(x, y))
      render(
        ctx,
        w,
        h,
        dpr,
        city,
        cam,
        {
          hover,
          cells,
          valid,
          tool: t,
          view: viewRef.current === 'none' && (t === 'pipe' || t === 'pump') ? 'water' : viewRef.current,
          selected: selRef.current,
        },
        now / 1000,
      )
      statAcc += dt
      if (statAcc > 0.25) {
        statAcc = 0
        setStats(city.stats())
        if (city.events.length !== seen || city.events.length === 40) {
          seen = city.events.length
          setEvents(city.events.slice(-6).reverse())
        }
        setReviews((r) => (r.length === city.reviews.length && r[r.length - 1] === city.reviews[city.reviews.length - 1] ? r : city.reviews.slice()))
        const sel = selRef.current
        if (sel) {
          const tile = city.tile(sel[0], sel[1])
          if (tile) setInfo({ x: sel[0], y: sel[1], tile: { ...tile } })
        }
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('keydown', keys)
      window.removeEventListener('keyup', keyUp)
      window.removeEventListener('blur', blur)
      canvas.removeEventListener('pointermove', track)
      canvas.removeEventListener('pointerleave', leave)
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', cancel)
      canvas.removeEventListener('wheel', wheel)
      canvas.removeEventListener('contextmenu', noMenu)
    }
  }, [])

  const pickTool = (t: Tool) => {
    toolRef.current = t
    setTool(t)
    if (t !== 'inspect') {
      selRef.current = null
      setInfo(null)
    }
  }
  const pickView = (v: View) => {
    viewRef.current = v
    setView(v)
  }
  const pickSpeed = (s: number) => {
    speedRef.current = s
    setSpeed(s)
  }
  const focus = (at?: [number, number]) => {
    const canvas = canvasRef.current
    if (!at || !canvas) return
    const cam = camRef.current
    const [x, y] = at
    const wx = (x + 0.5 - (y + 0.5)) * 32
    const wy = (x + 0.5 + (y + 0.5)) * 16
    cam.z = Math.max(cam.z, 1.2)
    cam.x = canvas.clientWidth / 2 - wx * cam.z
    cam.y = canvas.clientHeight / 2 - wy * cam.z
    toolRef.current = 'inspect'
    setTool('inspect')
    selRef.current = at
    setGroup(null)
  }
  const setTax = (v: number) => cityRef.current?.setTax(v)
  const [hoverItem, setHoverItem] = useState<ItemId | null>(null)
  const shown: ItemId | null = hoverItem ?? (tool !== 'pan' && tool !== 'inspect' && group && ITEM[tool].group === group ? tool : null)

  const hour = stats ? Math.floor(stats.time) : 0
  const min = stats ? Math.floor((stats.time % 1) * 60) : 0
  const bar = (v: number) => `${Math.round(Math.max(0, v) * 100)}%`

  const cityTitle = stats?.title ?? 'Empty land'

  return (
    <main className="relative h-[100svh] overflow-hidden bg-[#120d08] font-mono text-[#f4e9d8] select-none">
      <h1 className="sr-only">Miniature City, an isometric city builder</h1>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" aria-label="City map" />

      <div className="game-topbar absolute top-3 right-3 left-3 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl bg-black/60 px-4 py-2 text-xs backdrop-blur max-sm:top-1 max-sm:right-1 max-sm:left-1 max-sm:gap-x-2 max-sm:gap-y-0.5 max-sm:rounded-lg max-sm:px-2 max-sm:py-1 max-sm:text-[10px]">
        <span className="font-display text-base text-amber-200 max-sm:text-sm">{cityTitle}</span>
        <span className={stats && stats.money < 0 ? 'text-red-400' : ''}>${stats?.money.toLocaleString() ?? '—'}</span>
        <span className={`max-sm:hidden ${stats && stats.income < 0 ? 'text-red-400' : 'text-emerald-300'}`}>
          {stats && stats.income >= 0 ? '+' : ''}
          {stats?.income.toLocaleString() ?? 0}/day
        </span>
        <span>👥 {stats?.pop.toLocaleString() ?? 0}</span>
        <span className="max-sm:hidden">💼 {stats?.jobs.toLocaleString() ?? 0}</span>
        <span className="max-sm:hidden" title="Share of buildings with no problems">🙂 {stats?.happiness ?? 100}%</span>
        <span className="max-sm:hidden"><Meter label="⚡" cap={stats?.power.cap ?? 0} use={stats?.power.use ?? 0} /></span>
        <span className="max-sm:hidden"><Meter label="💧" cap={stats?.water.cap ?? 0} use={stats?.water.use ?? 0} /></span>
        <span className="flex items-center gap-1 max-sm:hidden" title="Demand for residential, commercial, industrial">
          {(['r', 'c', 'i'] as const).map((k) => (
            <span key={k} className="flex h-5 w-3 flex-col-reverse overflow-hidden rounded-sm bg-white/10">
              <span
                className={k === 'r' ? 'bg-emerald-400' : k === 'c' ? 'bg-sky-400' : 'bg-amber-400'}
                style={{ height: bar(stats?.demand[k] ?? 0) }}
              />
            </span>
          ))}
        </span>
        <label className="flex items-center gap-2 max-sm:gap-1">
          Tax {stats?.tax ?? 10}%
          <input
            type="range"
            min={0}
            max={25}
            value={stats?.tax ?? 10}
            onChange={(e) => setTax(Number(e.target.value))}
            className="w-20 accent-amber-300 max-sm:w-12"
          />
        </label>
        <span className="ml-auto">
          Day {stats?.day ?? 1} · {String(hour).padStart(2, '0')}:{String(min).padStart(2, '0')}
        </span>
        <span className="flex gap-1">
          {[0, 1, 3, 8].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => pickSpeed(s)}
              className={`rounded-md px-2 py-1 transition motion-reduce:transition-none max-sm:px-1.5 max-sm:py-0.5 ${speed === s ? 'bg-amber-200 text-[#120d08]' : 'hover:bg-white/10'}`}
            >
                              {s === 0 ? '❚❚' : `${s}×`}
            </button>
          ))}
        </span>
      </div>

      {/* Problems + news */}
      <div className="game-news absolute top-16 left-3 flex w-72 max-w-[calc(100vw-1.5rem)] flex-col gap-2 text-xs max-sm:top-14 max-sm:left-1 max-sm:max-h-[25svh] max-sm:gap-1 max-sm:overflow-y-auto max-sm:text-[10px]">
        {stats && PROBLEM_ORDER.some((p) => stats.problems[p]) && (
          <div className="rounded-xl bg-black/60 p-3 backdrop-blur max-sm:rounded-lg max-sm:p-2">
            <p className="mb-1 text-[10px] tracking-widest text-[#f4e9d8]/50 uppercase">Problems</p>
            {PROBLEM_ORDER.filter((p) => stats.problems[p]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => focus(cityRef.current?.firstProblem(p))}
                className="flex w-full justify-between rounded px-1 py-0.5 text-left hover:bg-white/10"
              >
                <span>{PROBLEM_LABEL[p]}</span>
                <span className="text-amber-200">{stats.problems[p]}</span>
              </button>
            ))}
          </div>
        )}
        {events.length > 0 && (
          <div className="rounded-xl bg-black/60 p-3 backdrop-blur max-sm:rounded-lg max-sm:p-2" aria-live="polite">
            <p className="mb-1 text-[10px] tracking-widest text-[#f4e9d8]/50 uppercase">City news</p>
            {events.map((e, i) => (
              <button
                key={`${e.msg}-${i}`}
                type="button"
                onClick={() => focus(e.at)}
                className={`block w-full rounded px-1 py-0.5 text-left hover:bg-white/10 ${e.tone === 'warn' ? 'text-orange-300' : e.tone === 'good' ? 'text-emerald-300' : ''}`}
              >
                {e.msg}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Inspector */}
      {info && <InspectPanel info={info} onClose={() => (selRef.current = null, setInfo(null))} />}

      {/* Views */}
      <div className="absolute right-3 bottom-40 flex flex-col gap-1 rounded-xl bg-black/60 p-2 text-xs backdrop-blur max-sm:hidden">
        {VIEWS.map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => pickView(v)}
            className={`rounded-md px-3 py-1 text-left transition motion-reduce:transition-none ${view === v ? 'bg-amber-200 text-[#120d08]' : 'hover:bg-white/10'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Phone */}
      <button
        type="button"
        aria-label={phone ? 'Close phone' : 'Open phone'}
        onClick={() => setPhone((v) => !v)}
        className="game-phone absolute bottom-28 left-3 flex items-center gap-2 rounded-full bg-black/60 px-3 py-2 text-xs backdrop-blur hover:bg-black/80 max-sm:bottom-24 max-sm:left-1 max-sm:gap-1 max-sm:px-2 max-sm:py-1 max-sm:text-[10px]"
      >
        <Smartphone className="size-4 text-amber-200" /> Reviews
        {reviews.length > 0 && <span className="rounded-full bg-amber-300 px-1.5 text-[10px] text-black">{reviews.length}</span>}
      </button>
      {phone && <Phone reviews={reviews} onClose={() => setPhone(false)} onGo={focus} />}

      {/* Build preview card */}
      {shown && <PreviewCard id={shown} />}

      {/* Toolbar */}
      <div className="game-toolbar absolute right-3 bottom-3 left-3 rounded-xl bg-black/65 p-2 text-xs backdrop-blur max-sm:right-1 max-sm:bottom-1 max-sm:left-1 max-sm:max-h-[34svh] max-sm:overflow-y-auto max-sm:rounded-lg max-sm:p-1 max-sm:text-[10px]">
        {group && (
          <div className="game-items mb-2 flex flex-wrap gap-1 border-b border-white/10 pb-2 max-sm:mb-1 max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:pb-1" onMouseLeave={() => setHoverItem(null)}>
            {ITEMS.filter((it) => it.group === group).map((it: { id: ItemId; group: Group; name: string; cost: number }) => {
              const I = ICON[it.id]
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => pickTool(it.id)}
                  onMouseEnter={() => setHoverItem(it.id)}
                  onFocus={() => setHoverItem(it.id)}
                  onBlur={() => setHoverItem(null)}
                  className={`flex w-20 flex-col items-center gap-1 rounded-lg px-1 py-2 transition motion-reduce:transition-none max-sm:w-14 max-sm:shrink-0 max-sm:gap-0.5 max-sm:px-0.5 max-sm:py-1 ${tool === it.id ? 'bg-amber-200 text-[#120d08]' : 'hover:bg-white/10'}`}
                >
                  <I className={`size-6 max-sm:size-5 ${tool === it.id ? '' : ICON_TINT[it.id]}`} />
                  <span className="text-center text-[10px] leading-tight max-sm:text-[8px]">{it.name}</span>
                  <span className="text-[10px] opacity-70 max-sm:text-[8px]">${it.cost.toLocaleString()}</span>
                </button>
              )
            })}
          </div>
        )}
        <div className="game-controls flex flex-wrap items-center gap-1 max-sm:flex-nowrap max-sm:overflow-x-auto">
          {(
            [
              ['pan', 'Pan', Hand],
              ['inspect', 'Inspect', Search],
            ] as [Tool, string, Icon][]
          ).map(([t, label, I]) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                pickTool(t)
                setGroup(null)
              }}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 transition motion-reduce:transition-none max-sm:gap-1 max-sm:px-2 max-sm:py-1 ${tool === t ? 'bg-amber-200 text-[#120d08]' : 'hover:bg-white/10'}`}
            >
              <I className="size-4" /> {label}
            </button>
          ))}
          <span className="mx-1 h-6 w-px bg-white/15" />
          {GROUPS.map((g) => {
            const I = GROUP_ICON[g.id]
            return (
              <button
                key={g.id}
                type="button"
                aria-pressed={group === g.id}
                onClick={() => {
                  setGroup(group === g.id ? null : g.id)
                  const first = ITEMS.find((it) => it.group === g.id)
                  if (first && group !== g.id) pickTool(first.id)
                }}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 transition motion-reduce:transition-none max-sm:gap-1 max-sm:px-2 max-sm:py-1 ${group === g.id ? 'bg-white/20' : 'hover:bg-white/10'}`}
              >
                <I className="size-4" /> {g.name}
              </button>
            )
          })}
          <span className="ml-auto max-w-xs pr-1 text-[#f4e9d8]/70 max-sm:hidden">{msg}</span>
          <Link to="/still" className="rounded-lg px-3 py-2 hover:bg-white/10 max-sm:hidden">
            Still image
          </Link>
        </div>
        <p className="mt-1 px-1 text-[10px] text-[#f4e9d8]/40 max-sm:hidden">
          WASD / arrows or screen edge: move · Shift: faster · R/F or wheel: zoom · right/middle drag: pan · B: bulldoze · P: phone · Space: pause · 1-3: speed · Esc: cancel
        </p>
      </div>
       </main>
  )
}

function Meter({ label, cap, use }: { label: string; cap: number; use: number }) {
  const short = use > cap
  return (
    <span className={short && use > 0 ? 'text-red-400' : ''} title="Supply / demand">
      {label} {cap.toLocaleString()}/{use.toLocaleString()}
    </span>
  )
}

function InspectPanel({ info, onClose }: { info: Inspect; onClose: () => void }) {
  const t = info.tile
  const name = t.kind === 'highway'
    ? 'Highway'
    : t.water
    ? t.kind === 'road'
      ? 'Bridge'
      : 'River'
    : t.kind === 'none'
      ? t.trees
        ? 'Woodland'
        : 'Open land'
      : isService(t.kind)
        ? SERVICE_INFO[t.kind].name
        : t.kind === 'res'
          ? `Residential, level ${t.lvl}`
          : t.kind === 'com'
            ? `Commercial, level ${t.lvl}`
            : t.kind === 'ind'
              ? `Industrial, level ${t.lvl}`
              : t.kind === 'park'
                ? 'Park'
                : 'Road'
  const rows: [string, string][] = []
  if (isZone(t.kind) || isService(t.kind)) {
    rows.push(['Road access', t.access ? 'Yes' : 'No — connect a road'])
    rows.push(['Electricity', t.power || isPowerKind(t.kind) ? 'Yes' : 'No'])
    rows.push(['Water', t.waterOk || t.kind === 'pump' ? 'Yes' : 'No'])
  }
  if (isZone(t.kind)) {
    rows.push(['Land value', `${Math.round(t.value * 100)}`])
    rows.push(['Pollution', `${Math.round(t.pollution * 100)}%`])
    rows.push(['Crime', `${Math.round(t.crime * 100)}%`])
    rows.push(['Fire / police / clinic', `${t.fireCov ? '✓' : '✗'} ${t.policeCov ? '✓' : '✗'} ${t.healthCov ? '✓' : '✗'}`])
  }
  if (t.kind === 'road') {
    const capacity = ROAD_CAP[t.road]
    rows.push(['Traffic', t.traffic > 3.2 * capacity ? 'Jammed' : t.traffic > 1.5 * capacity ? 'Busy' : 'Light'])
  }
  return (
  <div className="absolute top-16 right-3 w-64 rounded-xl bg-black/70 p-4 text-xs backdrop-blur max-sm:top-14 max-sm:right-1 max-sm:w-52 max-sm:p-2 max-sm:text-[10px]">
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="font-display text-base text-amber-200">{name}</p>
        <button type="button" aria-label="Close" onClick={onClose} className="rounded px-1 hover:bg-white/10">
          ✕
        </button>
      </div>
        {t.problem && <p className="mb-2 rounded bg-orange-500/20 px-2 py-1 text-orange-200">⚠ {PROBLEM_LABEL[t.problem]}</p>}
      {t.abandoned && t.problem !== 'abandoned' && (
        <p className="mb-2 rounded bg-white/10 px-2 py-1">Abandoned until this problem is fixed</p>
      )}
      <dl className="space-y-1">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2">
            <dt className="text-[#f4e9d8]/55">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
            <p className="mt-2 text-[#f4e9d8]/40">
        Tile {info.x}, {info.y}
      </p>
    </div>
  )
}

function PreviewCard({ id }: { id: ItemId }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const it = ITEM[id]
  useEffect(() => {
    if (ref.current) drawPreview(ref.current, id)
  }, [id])
  const I = ICON[id]
  return (
        <div className="game-preview pointer-events-none absolute bottom-48 left-3 w-80 max-w-[calc(100vw-1.5rem)] origin-bottom-left scale-[0.75] overflow-hidden rounded-xl bg-black/80 text-xs shadow-2xl ring-1 ring-white/10 backdrop-blur max-sm:bottom-36 max-sm:scale-50">
      <canvas ref={ref} className="block h-36 w-full" aria-hidden />
      <div className="p-3">
        <div className="flex items-center gap-2">
          <I className={`size-4 ${ICON_TINT[id]}`} />
          <p className="font-display text-base text-amber-100">{it.name}</p>
          <span className="ml-auto text-amber-200">
            ${it.cost.toLocaleString()}
            {it.unit ? `/${it.unit}` : ''}
          </span>
        </div>
        <p className="mt-1 text-[#f4e9d8]/70">{it.desc}</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <ul className="space-y-0.5 text-emerald-300">
            {it.good.map((g) => (
              <li key={g}>＋ {g}</li>
            ))}
          </ul>
          <ul className="space-y-0.5 text-red-300">
            {it.bad.map((b) => (
              <li key={b}>－ {b}</li>
            ))}
          </ul>
        </div>
        {it.upkeep ? <p className="mt-2 text-[#f4e9d8]/50">Upkeep ${it.upkeep.toLocaleString()}/day{it.unit ? ' per tile' : ''}</p> : null}
      </div>
    </div>
  )
}

function Phone({ reviews, onClose, onGo }: { reviews: Review[]; onClose: () => void; onGo: (at?: [number, number]) => void }) {
  const [tab, setTab] = useState<'all' | 'good' | 'bad'>('all')
  const list = reviews
    .slice()
    .reverse()
    .filter((r) => (tab === 'all' ? true : tab === 'good' ? r.stars >= 4 : r.stars <= 2))
  const avg = reviews.length ? reviews.reduce((a, r) => a + r.stars, 0) / reviews.length : 0
  return (
    <div className="absolute bottom-40 left-3 flex h-[min(520px,60svh)] w-64 flex-col overflow-hidden rounded-[2rem] border-4 border-neutral-800 bg-neutral-50 text-neutral-900 shadow-2xl">
      <div className="flex items-center justify-between bg-neutral-900 px-5 pt-2 pb-1 text-[10px] text-white">
        <span>9:41</span>
        <span className="h-4 w-16 rounded-full bg-black" />
        <span>5G ▮▮▮</span>
      </div>
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div>
          <p className="font-display text-sm font-semibold">CityVoice</p>
          <p className="flex items-center gap-1 text-[10px] text-neutral-500">
            <Stars n={Math.round(avg)} /> {avg ? avg.toFixed(1) : '–'} · {reviews.length} reviews
          </p>
        </div>
        <button type="button" aria-label="Close phone" onClick={onClose} className="rounded-full p-1 hover:bg-neutral-200">
          <X className="size-4" />
        </button>
      </div>
      <div className="flex gap-1 px-3 py-2 text-[11px]">
        {(['all', 'good', 'bad'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`rounded-full px-3 py-1 capitalize ${tab === k ? 'bg-neutral-900 text-white' : 'bg-neutral-200'}`}
          >
            {k === 'all' ? 'All' : k === 'good' ? '👍 Good' : '👎 Bad'}
          </button>
        ))}
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto px-3 pb-3">
        {list.length === 0 && <p className="pt-6 text-center text-xs text-neutral-500">No reviews yet. Grow your city and residents will start posting.</p>}
        {list.map((r, i) => (
          <button
            key={`${r.day}-${r.time}-${i}`}
            type="button"
            onClick={() => onGo(r.at)}
            className="block w-full rounded-xl bg-white p-2 text-left shadow-sm ring-1 ring-neutral-200 hover:ring-neutral-400"
          >
            <div className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: r.color }}>
                {r.name[0]}
              </span>
              <span className="text-[11px] font-semibold">{r.name}</span>
              <span className="ml-auto text-[9px] text-neutral-400">
                Day {r.day} {String(Math.floor(r.time)).padStart(2, '0')}:00
              </span>
            </div>
            <Stars n={r.stars} />
            <p className="mt-0.5 text-[11px] leading-snug">{r.text}</p>
          </button>
        ))}
      </div>
          </div>
  )
}

function Stars({ n }: { n: number }) {
  return (
    <span className="inline-flex" aria-label={`${n} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((k) => (
        <Star key={k} className={`size-3 ${k <= n ? 'fill-amber-400 text-amber-400' : 'text-neutral-300'}`} />
      ))}
    </span>
  )
}