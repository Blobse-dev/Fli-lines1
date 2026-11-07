import { useEffect, useRef, useState } from 'react'
import type { ComponentType } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import {
  Building2,
  BookOpen,
  Cable,
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
  N,
  PROBLEM_LABEL,
  ROAD_CAP,
  SERVICE_INFO,
  brushCells,
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
type ZoneMode = 'fill' | 'marquee' | 'paint'
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
  pylon: Milestone,
  cable: Cable,
  overhead_transmission: Zap,
  overhead_distribution: Cable,
  overhead_service: Cable,
  overhead_swer: Signpost,
  pump: Droplets,
  pipe: Droplet,
  fire: Flame,
  police: ShieldCheck,
  health: Hospital,
  school: GraduationCap,
  substation: Building2,
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
  pylon: 'text-yellow-300',
  cable: 'text-yellow-300',
  overhead_transmission: 'text-stone-300',
  overhead_distribution: 'text-stone-300',
  overhead_service: 'text-amber-200',
  overhead_swer: 'text-amber-300',
  pump: 'text-blue-300',
  pipe: 'text-blue-300',
  fire: 'text-red-300',
  police: 'text-indigo-300',
  health: 'text-pink-300',
  school: 'text-orange-300',
  substation: 'text-yellow-300',
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
const TUTORIAL_STEPS = [
  {
    title: 'Open road tools',
    action: 'Tap Roads in the bottom toolbar.',
    completion: 'This opens the road-building tools.',
  },
  {
    title: 'Choose a street',
    action: 'Tap Street in the toolbar.',
    completion: 'Street is selected and ready to build.',
  },
  {
    title: 'Connect your street',
    action: 'On the map, press and hold a highway tile. Drag onto nearby land, then release.',
    completion: 'The new road must connect to the highway.',
  },
  {
    title: 'Open zone tools',
    action: 'Tap Zones in the bottom toolbar.',
    completion: 'This opens the types of land you can develop.',
  },
  {
    title: 'Choose housing',
    action: 'Tap Low-density housing in the toolbar.',
    completion: 'This selects a home zone.',
  },
  {
    title: 'Zone land beside your road',
    action: 'Press and hold an empty tile next to your road. Drag a rectangle, or zone a single tile, then release. Lots can be up to 6×6 tiles.',
    completion: 'Each lot must be zoned, touch the road, and can be as small as 1×1. Each lot gets its own chance to grow.',
  },
  {
    title: 'Open electricity tools',
    action: 'Tap Electricity in the bottom toolbar.',
    completion: 'Power plants and turbines supply electricity to nearby buildings.',
  },
  {
    title: 'Choose a wind turbine',
    action: 'Tap Wind turbine. It is the cheapest, clean power source.',
    completion: 'Roads carry power underground. Use cable tools to connect buildings away from the road network.',
  },
  {
    title: 'Power your homes',
    action: 'Place the turbine on empty land beside a road connected to the highway, near your housing.',
    completion: 'The turbine supplies power through the road network after it finishes building, up to its capacity.',
  },
  {
    title: 'Choose a power pylon',
    action: 'Tap Power pylon in the Electricity tools.',
    completion: 'Connect pylons to a powered road, power station or overhead line. They can span gaps up to 8 tiles.',
  },
  {
    title: 'Extend power with a pylon',
    action: 'Place a pylon on empty land within 8 tiles of a powered road or pylon.',
    completion: 'A connected pylon carries power across gaps and along transmission lines toward a substation.',
  },
  {
    title: 'Choose an electrical substation',
    action: 'Select Electrical substation in the Electricity tools.',
    completion: 'The substation is the hub where high-voltage transmission connects to local distribution.',
  },
  {
    title: 'Place the substation',
    action: 'Place it on empty land beside a road connected to the highway.',
    completion: 'The road gives the substation access; transmission and distribution lines can connect directly to it.',
  },
  {
    title: 'Choose transmission lines',
    action: 'Select Transmission lines in the Electricity tools.',
    completion: 'Use transmission lines to carry power from pylons to the substation.',
  },
  {
    title: 'Connect transmission to the substation',
    action: 'Drag a transmission-line path from a powered pylon to the substation.',
    completion: 'The powered transmission line now feeds the substation.',
  },
  {
    title: 'Choose distribution lines',
    action: 'Select Distribution lines in the Electricity tools.',
    completion: 'Distribution lines carry power from the substation toward your neighborhoods.',
  },
  {
    title: 'Extend local distribution',
    action: 'Drag distribution lines from the substation toward nearby homes.',
    completion: 'Power now flows from the pylon through the substation and out along distribution lines.',
  },
  {
    title: 'Open Roads again',
    action: 'Tap Roads in the bottom toolbar.',
    completion: 'A water pump must be on the riverbank and beside a connected road.',
  },
  {
    title: 'Choose Street',
    action: 'Tap Street in the toolbar.',
    completion: 'You will extend the connected road toward the river.',
  },
  {
    title: 'Connect a road to the river',
    action: 'Press and hold a connected road. Drag to empty land beside the river, then release.',
    completion: 'The road must stay connected to the highway and reach a riverbank so the pump can connect.',
  },
  {
    title: 'Open Water tools',
    action: 'Tap Water in the bottom toolbar.',
    completion: 'First place a pump on the riverbank, then connect it to homes with pipes.',
  },
  {
    title: 'Choose a water pump',
    action: 'Tap Water pump.',
    completion: 'The pump must sit on land next to the river and a connected road.',
  },
  {
    title: 'Place the pump',
    action: 'Place it on an empty riverbank tile beside your connected road.',
    completion: 'Pumps draw water from the river; pipes carry it to your buildings.',
  },
  {
    title: 'Choose Water pipe',
    action: 'Tap Water pipe in the Water tools.',
    completion: 'Pipes must form an unbroken line back to a working pump.',
  },
  {
    title: 'Connect water to your homes',
    action: 'Press and hold the pump tile. Drag a pipe path toward your housing, then release within 2 tiles of a zoned home.',
    completion: 'Connected pipes supply water to buildings within 2 tiles of the pipe network.',
  },
] as const

interface Inspect {
  x: number
  y: number
  tile: Tile
}

const hasConnectedRoadAtRiver = (city: City, cells: [number, number][]) =>
  cells.some(([x, y]) => {
    const tile = city.tile(x, y)
    if (tile?.kind !== 'road' || !tile.connected || tile.water) return false
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => city.tile(x + dx, y + dy)?.water)
  })

const hasConnectedWindTurbine = (city: City, cells: [number, number][]) =>
  cells.some(([x, y]) => city.tile(x, y)?.kind === 'wind' && city.tile(x, y)?.access)

const hasPoweredPylon = (city: City, cells: [number, number][]) =>
  cells.some(([x, y]) => city.tile(x, y)?.kind === 'pylon' && city.tile(x, y)?.power)

const hasRoadsideSubstation = (city: City, cells: [number, number][]) =>
  cells.some(([x, y]) => city.tile(x, y)?.kind === 'substation' && city.tile(x, y)?.access)

const hasTransmissionToSubstation = (city: City) =>
  city.tiles.some((tile, i) => {
    if (tile.kind !== 'substation' || !tile.power) return false
    const x = i % N
    const y = Math.floor(i / N)
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const line = city.tile(x + dx, y + dy)
      return line?.overheadCable && line.overheadType === 'transmission' && line.power
    })
  })

const hasDistributionFromSubstation = (city: City, cells: [number, number][]) =>
  cells.some(([x, y]) => {
    const line = city.tile(x, y)
    if (!line?.overheadCable || line.overheadType !== 'distribution' || !line.power) return false
    return city.tiles.some((tile, i) => {
      if (tile.kind !== 'substation' || !tile.power) return false
      const sx = i % N
      const sy = Math.floor(i / N)
      return Math.abs(x - sx) + Math.abs(y - sy) <= 8
    })
  })

const hasWorkingPumpOnRiverbank = (city: City, cells: [number, number][]) =>
  cells.some(([x, y]) => {
    const pump = city.tile(x, y)
    if (pump?.kind !== 'pump' || !pump.access) return false
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => city.tile(x + dx, y + dy)?.water)
  })

const hasPipeToHomes = (city: City) => {
  const visited = new Uint8Array(city.tiles.length)
  const queue: number[] = []
  for (let i = 0; i < city.tiles.length; i++) {
    const tile = city.tiles[i]
    if (tile.kind === 'pump' && tile.access) {
      visited[i] = 1
      queue.push(i)
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]
    const x = i % N
    const y = Math.floor(i / N)
    const tile = city.tiles[i]
    if (tile.pipe) {
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (Math.abs(dx) + Math.abs(dy) > 2) continue
          if (city.tile(x + dx, y + dy)?.kind === 'res') return true
        }
      }
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx
      const ny = y + dy
      const ni = ny * N + nx
      if (nx < 0 || nx >= N || ny < 0 || ny >= N || visited[ni]) continue
      if (city.tiles[ni].pipe) {
        visited[ni] = 1
        queue.push(ni)
      }
    }
  }
  return false
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
  const [zoneMode, setZoneMode] = useState<ZoneMode>('marquee')
  const zoneModeRef = useRef<ZoneMode>('marquee')
  const [phone, setPhone] = useState(false)
  const [reviews, setReviews] = useState<Review[]>([])
  const [view, setView] = useState<View>('none')
  const [speed, setSpeed] = useState(1)
  const [stats, setStats] = useState<Stats | null>(null)
  const [events, setEvents] = useState<CityEvent[]>([])
  const [msg, setMsg] = useState('Drag roads off the highway, then zone land beside them.')
  const [info, setInfo] = useState<Inspect | null>(null)
  const [tutorialStep, setTutorialStep] = useState<number | null>(0)
  const tutorialStepRef = useRef(tutorialStep)

  const dismissTutorial = () => {
    tutorialStepRef.current = null
    setTutorialStep(null)
  }
  const completeTutorialStep = (step: number) => {
    if (tutorialStepRef.current !== step) return
    if (step === TUTORIAL_STEPS.length - 1) {
      dismissTutorial()
      return
    }
    tutorialStepRef.current = step + 1
    setTutorialStep(step + 1)
  }
  const replayTutorial = () => {
    tutorialStepRef.current = 0
    setTutorialStep(0)
    setGroup('roads')
    toolRef.current = 'street'
    setTool('street')
    selRef.current = null
    setInfo(null)
  }
  const cellsForAction = (city: City, activeTool: Tool, start: [number, number], end: [number, number]) => {
    if (activeTool !== 'pan' && activeTool !== 'inspect' && isZone(ITEM[activeTool].kind ?? 'none')) {
      if (zoneModeRef.current === 'fill') return city.zoneFill(start)
      if (zoneModeRef.current === 'paint') return brushCells(start, end)
    }
    return dragCells(activeTool, start, end)
  }
  const pickZoneMode = (mode: ZoneMode) => {
    zoneModeRef.current = mode
    setZoneMode(mode)
  }

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
      if (e.button === 2 && t !== 'pan' && t !== 'inspect' && isZone(ITEM[t].kind ?? 'none')) {
        const [x, y] = hover
        if (isZone(city.tile(x, y)?.kind ?? 'none')) {
          const res = city.apply('bulldoze', [[x, y]])
          if (res.ok) setMsg('De-zoned 1 tile')
          else if (res.reason) setMsg(res.reason)
        }
        return
      }
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
        const cells = cellsForAction(city, t, start, hover)
        const validCells = city.plan(t, cells).valid
        const res = city.apply(t, cells)
        if (res.ok) {
          setMsg(`Built ${res.count} tile${res.count === 1 ? '' : 's'} for $${res.cost.toLocaleString()}`)
          const step = tutorialStepRef.current
          if (step === 2 && ITEM[t].kind === 'road') completeTutorialStep(2)
          else if (step === 5 && isZone(ITEM[t].kind ?? 'none')) completeTutorialStep(5)
          else if (step === 8 && t === 'wind') {
            if (hasConnectedWindTurbine(city, validCells)) completeTutorialStep(8)
            else setMsg('Place the turbine beside a road connected to the highway.')
          } else if (step === 10 && t === 'pylon') {
            if (hasPoweredPylon(city, validCells)) completeTutorialStep(10)
            else setMsg('Place the pylon within 8 tiles of a powered road or pylon.')
          } else if (step === 12 && t === 'substation') {
            if (hasRoadsideSubstation(city, validCells)) completeTutorialStep(12)
            else setMsg('Place the substation beside a road connected to the highway.')
          } else if (step === 14 && t === 'overhead_transmission') {
            if (hasTransmissionToSubstation(city)) completeTutorialStep(14)
            else setMsg('Connect a powered transmission line directly to the substation.')
          } else if (step === 16 && t === 'overhead_distribution') {
            if (hasDistributionFromSubstation(city, validCells)) completeTutorialStep(16)
            else setMsg('Connect a distribution line to the powered substation and extend it toward homes.')
          } else if (step === 19 && t === 'street') {
            if (hasConnectedRoadAtRiver(city, validCells)) completeTutorialStep(19)
            else setMsg('Extend a connected street until a road tile touches the riverbank.')
          } else if (step === 22 && t === 'pump') {
            if (hasWorkingPumpOnRiverbank(city, validCells)) completeTutorialStep(22)
            else setMsg('Place the pump on a riverbank tile beside a road connected to the highway.')
          } else if (step === 24 && t === 'pipe') {
            if (hasPipeToHomes(city)) completeTutorialStep(24)
            else setMsg('Drag one unbroken pipe line from the pump to within 2 tiles of your housing.')
          }
        }
        else {
          if (res.reason) setMsg(res.reason)
        }
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
      const cells = start && hover && building ? cellsForAction(city, t, start, hover) : hover && building ? cellsForAction(city, t, hover, hover) : []
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
  const tutorialTargetClass = 'ring-2 ring-amber-300 ring-offset-2 ring-offset-[#120d08] shadow-[0_0_22px_rgba(252,211,77,0.65)] motion-safe:animate-pulse'

  const hour = stats ? Math.floor(stats.time) : 0
  const min = stats ? Math.floor((stats.time % 1) * 60) : 0
  const bar = (v: number) => `${Math.round(Math.max(0, v) * 100)}%`

  const cityTitle = stats?.title ?? 'Empty land'

  return (
    <main className="relative h-[100svh] overflow-hidden bg-[#120d08] font-mono text-[#f4e9d8] select-none">
      <h1 className="sr-only">Miniature City, an isometric city builder</h1>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" aria-label="City map" />

      {tutorialStep !== null && (
        <div className="pointer-events-none absolute inset-0 z-50">
          <button
            type="button"
            onClick={dismissTutorial}
            className="pointer-events-auto fixed top-3 right-3 flex items-center gap-1 rounded-lg bg-black/80 px-3 py-2 text-xs text-[#f4e9d8] shadow-lg backdrop-blur transition hover:bg-black motion-reduce:transition-none"
          >
            Skip tutorial <X className="size-3.5" />
          </button>
          <section
            aria-label="Tutorial step"
            aria-live="polite"
            aria-atomic="true"
            className="pointer-events-auto absolute top-20 left-1/2 w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-amber-200/40 bg-[#120d08]/[0.97] p-5 text-sm shadow-2xl shadow-black/60 backdrop-blur max-sm:top-[4.25rem] max-sm:left-1/2 max-sm:max-h-[30svh] max-sm:w-[min(20rem,calc(100vw-2rem))] max-sm:-translate-x-1/2 max-sm:overflow-y-auto max-sm:rounded-xl max-sm:p-2 max-sm:text-[11px]"
          >
            <div className="mb-3 flex items-center justify-between gap-3 max-sm:mb-1">
              <p className="text-[11px] font-semibold tracking-widest text-amber-200 uppercase max-sm:text-[9px] max-sm:tracking-wide">
                Getting started · Step {tutorialStep + 1} of {TUTORIAL_STEPS.length}
              </p>
              <p className="shrink-0 text-[11px] text-[#f4e9d8]/55 max-sm:text-[9px]">Gold outline = tap</p>
            </div>
            <h2 className="mb-3 font-display text-xl text-amber-100 max-sm:mb-1.5 max-sm:text-sm">{TUTORIAL_STEPS[tutorialStep].title}</h2>
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-200/25 bg-amber-200/10 p-3 leading-relaxed text-[#f4e9d8] max-sm:gap-1.5 max-sm:p-1.5">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-amber-200 text-xs font-bold text-[#120d08] max-sm:size-4 max-sm:text-[9px]">
                {tutorialStep + 1}
              </span>
              <span>{TUTORIAL_STEPS[tutorialStep].action}</span>
            </div>
            <p className="mt-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs leading-relaxed text-[#f4e9d8]/70 max-sm:mt-1.5 max-sm:px-1.5 max-sm:py-1 max-sm:text-[9px]">
              <span className="font-semibold text-amber-200">Then: </span>
              {TUTORIAL_STEPS[tutorialStep].completion}
            </p>
            <div className="mt-4 flex items-center gap-1.5 max-sm:mt-2 max-sm:gap-1" aria-hidden="true">
              {TUTORIAL_STEPS.map((_, step) => (
                <span
                  key={step}
                  className={`h-1 flex-1 rounded-full ${step <= tutorialStep ? 'bg-amber-300' : 'bg-white/15'}`}
                />
              ))}
            </div>
          </section>
        </div>
      )}

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
        {tutorialStep === null && (
          <button
            type="button"
            onClick={replayTutorial}
            className="flex items-center gap-1.5 rounded-md bg-amber-200/15 px-2.5 py-1.5 text-amber-100 transition hover:bg-amber-200/25 motion-reduce:transition-none max-sm:px-2"
            aria-label="Replay tutorial"
            title="Replay tutorial"
          >
            <BookOpen className="size-3.5" />
            <span>Replay tutorial</span>
          </button>
        )}
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
      <div
        role="group"
        aria-label="Map information overlays"
        className="absolute right-3 bottom-40 flex flex-col gap-1 rounded-xl bg-black/60 p-2 text-xs backdrop-blur max-sm:right-1 max-sm:bottom-[calc(34svh+0.5rem)] max-sm:left-1 max-sm:flex-row max-sm:overflow-x-auto max-sm:rounded-lg max-sm:p-1"
      >
        {VIEWS.map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => pickView(v)}
            aria-pressed={view === v}
            className={`shrink-0 rounded-md px-3 py-1 text-left transition motion-reduce:transition-none max-sm:px-2 max-sm:py-1.5 ${view === v ? 'bg-amber-200 text-[#120d08]' : 'hover:bg-white/10'}`}
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
        {group === 'zones' && (
          <div className="mb-2 flex flex-wrap items-center gap-1 border-b border-white/10 pb-2 max-sm:mb-1 max-sm:pb-1" role="group" aria-label="Zone painting mode">
            {([
              ['paint', 'Paint'],
              ['marquee', 'Marquee'],
              ['fill', 'Fill'],
            ] as [ZoneMode, string][]).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                aria-pressed={zoneMode === mode}
                onClick={() => pickZoneMode(mode)}
                className={`rounded-md px-2.5 py-1.5 transition motion-reduce:transition-none max-sm:px-2 max-sm:py-1 ${zoneMode === mode ? 'bg-emerald-300 text-[#120d08]' : 'bg-white/5 hover:bg-white/10'}`}
              >
                {label}
              </button>
            ))}
            <span className="ml-auto text-[10px] text-[#f4e9d8]/60 max-sm:hidden">
              6-tile road reach · 1×1–6×6 lots grow independently when touching a road · Right-click to remove
            </span>
            <span className="w-full text-[9px] text-[#f4e9d8]/50 sm:hidden">
              {zoneMode === 'fill' ? 'Tap to fill' : zoneMode === 'paint' ? 'Drag to paint' : 'Drag a rectangle or single tile'} · 1×1–6×6 lots touch the road and grow independently
            </span>
          </div>
        )}
        {group && (
          <div className="game-items mb-2 flex flex-wrap gap-1 border-b border-white/10 pb-2 max-sm:mb-1 max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:pb-1" onMouseLeave={() => setHoverItem(null)}>
            {ITEMS.filter((it) => it.group === group).map((it: { id: ItemId; group: Group; name: string; cost: number }) => {
              const I = ICON[it.id]
              const tutorialTarget =
                (tutorialStep === 1 && it.id === 'street') ||
                (tutorialStep === 2 && tool !== 'street' && it.id === 'street') ||
                (tutorialStep === 4 && it.id === 'res_low') ||
                (tutorialStep === 5 && tool !== 'res_low' && it.id === 'res_low') ||
                (tutorialStep === 7 && it.id === 'wind') ||
                (tutorialStep === 9 && it.id === 'pylon') ||
                (tutorialStep === 11 && it.id === 'substation') ||
                (tutorialStep === 13 && it.id === 'overhead_transmission') ||
                (tutorialStep === 15 && it.id === 'overhead_distribution') ||
                (tutorialStep === 18 && it.id === 'street') ||
                (tutorialStep === 21 && it.id === 'pump') ||
                (tutorialStep === 23 && it.id === 'pipe')
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => {
                    pickTool(it.id)
                    if (tutorialStepRef.current === 1 && it.id === 'street') completeTutorialStep(1)
                    if (tutorialStepRef.current === 4 && it.id === 'res_low') completeTutorialStep(4)
                    if (tutorialStepRef.current === 7 && it.id === 'wind') completeTutorialStep(7)
                    if (tutorialStepRef.current === 9 && it.id === 'pylon') completeTutorialStep(9)
                    if (tutorialStepRef.current === 11 && it.id === 'substation') completeTutorialStep(11)
                    if (tutorialStepRef.current === 13 && it.id === 'overhead_transmission') completeTutorialStep(13)
                    if (tutorialStepRef.current === 15 && it.id === 'overhead_distribution') completeTutorialStep(15)
                    if (tutorialStepRef.current === 18 && it.id === 'street') completeTutorialStep(18)
                    if (tutorialStepRef.current === 21 && it.id === 'pump') completeTutorialStep(21)
                    if (tutorialStepRef.current === 23 && it.id === 'pipe') completeTutorialStep(23)
                  }}
                  onMouseEnter={() => setHoverItem(it.id)}
                  onFocus={() => setHoverItem(it.id)}
                  onBlur={() => setHoverItem(null)}
                  className={`flex w-20 flex-col items-center gap-1 rounded-lg px-1 py-2 transition motion-reduce:transition-none max-sm:w-14 max-sm:shrink-0 max-sm:gap-0.5 max-sm:px-0.5 max-sm:py-1 ${tool === it.id ? 'bg-amber-200 text-[#120d08]' : 'hover:bg-white/10'} ${tutorialTarget ? tutorialTargetClass : ''}`}
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
            const tutorialTarget =
              (tutorialStep === 0 && g.id === 'roads') ||
              ((tutorialStep === 2 || tutorialStep === 17 || tutorialStep === 19) && g.id === 'roads' && group !== 'roads') ||
              ((tutorialStep === 3 || tutorialStep === 4 || tutorialStep === 5) && g.id === 'zones' && group !== 'zones')
              || ([6, 9, 10].includes(tutorialStep ?? -1) && g.id === 'power' && group !== 'power')
              || ([11, 12, 13, 14, 15, 16].includes(tutorialStep ?? -1) && g.id === 'power' && group !== 'power')
              || ([20, 21, 22, 23, 24].includes(tutorialStep ?? -1) && g.id === 'water' && group !== 'water')
            return (
              <button
                key={g.id}
                type="button"
                aria-pressed={group === g.id}
                onClick={() => {
                  const tutorialGroupClick =
                    [0, 2, 17, 19].includes(tutorialStepRef.current ?? -1) && g.id === 'roads' ||
                    (tutorialStepRef.current === 3 ||
                      tutorialStepRef.current === 4 ||
                      tutorialStepRef.current === 5) &&
                      g.id === 'zones' ||
                    [6, 9, 10, 11, 12, 13, 14, 15, 16].includes(tutorialStepRef.current ?? -1) && g.id === 'power' ||
                    [20, 21, 22, 23, 24].includes(tutorialStepRef.current ?? -1) && g.id === 'water'
                  setGroup(tutorialGroupClick ? g.id : group === g.id ? null : g.id)
                  const first = ITEMS.find((it) => it.group === g.id)
                  if (first && group !== g.id) pickTool(first.id)
                  if (tutorialStepRef.current === 0 && g.id === 'roads') completeTutorialStep(0)
                  if (tutorialStepRef.current === 3 && g.id === 'zones') completeTutorialStep(3)
                  if (tutorialStepRef.current === 6 && g.id === 'power') completeTutorialStep(6)
                  if (tutorialStepRef.current === 17 && g.id === 'roads') completeTutorialStep(17)
                  if (tutorialStepRef.current === 20 && g.id === 'water') completeTutorialStep(20)
                }}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 transition motion-reduce:transition-none max-sm:gap-1 max-sm:px-2 max-sm:py-1 ${group === g.id ? 'bg-white/20' : 'hover:bg-white/10'} ${tutorialTarget ? tutorialTargetClass : ''}`}
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
  const overheadLineName = t.overheadType === 'swer'
    ? 'SWER line'
    : t.overheadType === 'service'
      ? 'Service line / mains'
      : t.overheadType === 'transmission'
        ? 'Transmission line'
        : 'Distribution line'
  const name = t.kind === 'highway'
    ? 'Highway'
    : t.kind === 'none' && t.undergroundCable
      ? 'Underground electric cable'
      : t.kind === 'none' && t.overheadCable
        ? overheadLineName
    : t.kind === 'pylon'
      ? 'Power pylon'
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
  if (t.kind === 'pylon') rows.push(['Power line', t.power ? 'Connected' : 'Not connected'])
  if (t.kind === 'substation')
    rows.push(['Grid connection', t.power ? 'Connected — feeds local distribution' : 'Not connected to a powered line'])
  if (t.kind === 'road') rows.push(['Electric cable', 'Built into the road'])
  if (t.undergroundCable) rows.push(['Underground cable', t.power ? 'Connected' : 'Not connected'])
  if (t.overheadCable) rows.push([overheadLineName, t.power ? 'Connected' : 'Not connected'])
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