import { useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Download, ScanSearch } from 'lucide-react'

export const Route = createFileRoute('/still')({
  component: Home,
})

const SRC = '/img/aerial-city-golden-hour.jpg'
const cdn = (w: number, fm = 'webp', q = 80) =>
  `/.netlify/images?url=${SRC}&w=${w}&fm=${fm}&q=${q}`

const PROMPT =
  'Realistic aerial tilt-shift photo of a modern city, Cities Skylines 2 style, clean urban planning, complex highway interchange, 8k resolution, golden hour lighting.'

const SPECS = [
  ['Resolution', '5504 × 3072'],
  ['Aspect', '16 : 9'],
  ['Light', 'Golden hour'],
  ['Lens', 'Tilt-shift'],
]

function Home() {
  return (
    <main className="min-h-screen bg-[#120d08] text-[#f4e9d8] selection:bg-amber-300/40">
      <Hero />
      <Inspector />
      <About />
      <footer className="px-6 py-10 text-center font-mono text-xs tracking-widest text-[#f4e9d8]/40 uppercase">
        Golden Hour Interchange · AI-generated image
      </footer>
    </main>
  )
}

function Hero() {
  return (
    <section className="relative h-[100svh] min-h-[560px] overflow-hidden">
      <img
        src={cdn(1920)}
        srcSet={[960, 1600, 2400, 3200].map((w) => `${cdn(w)} ${w}w`).join(', ')}
        sizes="100vw"
        alt="Aerial tilt-shift view of a modern city at golden hour, centred on a multi-level cloverleaf highway interchange beside a river"
        className="absolute inset-0 h-full w-full object-cover animate-[heroZoom_24s_ease-out_forwards]"
        fetchPriority="high"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[#120d08]/70 via-transparent to-[#120d08]" />
      <div className="relative z-10 flex h-full flex-col justify-between p-6 md:p-12">
        <p className="font-mono text-xs tracking-[0.3em] text-amber-200/90 uppercase">
          Aerial study · No. 01
        </p>
        <div className="max-w-3xl">
          <h1 className="font-display text-5xl leading-[0.95] font-light md:text-8xl">
            Golden Hour
            <br />
            <span className="font-semibold italic text-amber-200">Interchange</span>
          </h1>
          <p className="mt-6 max-w-xl text-base text-[#f4e9d8]/80 md:text-lg">
            A planned city in miniature: stacked flyovers, cloverleaf loops, and a
            river district, caught in warm low sun with a tilt-shift lens.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#inspect"
              className="inline-flex items-center gap-2 rounded-full bg-amber-200 px-5 py-3 text-sm font-medium text-[#120d08] transition hover:bg-amber-100"
            >
              <ScanSearch className="size-4" /> Inspect the details
            </a>
            <a
              href={SRC}
              download="golden-hour-interchange.jpg"
              className="inline-flex items-center gap-2 rounded-full border border-[#f4e9d8]/30 px-5 py-3 text-sm font-medium backdrop-blur transition hover:border-[#f4e9d8]/70"
            >
              <Download className="size-4" /> Download full resolution
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}

function Inspector() {
  const ref = useRef<HTMLDivElement>(null)
  const [lens, setLens] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const ZOOM = 3.5
  const SIZE = 240

  const move = (clientX: number, clientY: number) => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    setLens({
      x: Math.min(Math.max(clientX - r.left, 0), r.width),
      y: Math.min(Math.max(clientY - r.top, 0), r.height),
      w: r.width,
      h: r.height,
    })
  }

  return (
    <section id="inspect" className="mx-auto max-w-6xl px-6 py-20 md:py-28">
      <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <h2 className="font-display text-3xl font-light md:text-5xl">
          Every lane, <span className="italic text-amber-200">every car</span>
        </h2>
        <p className="max-w-sm text-sm text-[#f4e9d8]/60">
          Move across the image (or drag on touch) to look closely at the full
          5.5K source through the loupe.
        </p>
      </div>
      <div
        ref={ref}
        className="relative cursor-none touch-none overflow-hidden rounded-2xl ring-1 ring-[#f4e9d8]/10"
        onPointerMove={(e) => move(e.clientX, e.clientY)}
        onPointerDown={(e) => move(e.clientX, e.clientY)}
        onPointerLeave={() => setLens(null)}
      >
        <img
          src={cdn(1600)}
          srcSet={[900, 1600, 2400].map((w) => `${cdn(w)} ${w}w`).join(', ')}
          sizes="(min-width: 72rem) 72rem, 100vw"
          alt="The same city view, shown for close inspection"
          className="block aspect-[5504/3072] w-full object-cover"
          loading="lazy"
        />
        {lens && (
          <div
            className="pointer-events-none absolute rounded-full shadow-[0_20px_60px_rgba(0,0,0,0.6)] ring-2 ring-amber-200/80"
            style={{
              width: SIZE,
              height: SIZE,
              left: lens.x - SIZE / 2,
              top: lens.y - SIZE / 2,
              backgroundImage: `url("${cdn(4096, 'webp', 85)}")`,
              backgroundRepeat: 'no-repeat',
              backgroundSize: `${lens.w * ZOOM}px ${lens.h * ZOOM}px`,
              backgroundPosition: `${-(lens.x * ZOOM - SIZE / 2)}px ${-(lens.y * ZOOM - SIZE / 2)}px`,
            }}
          />
        )}
      </div>
      <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-[#f4e9d8]/10 md:grid-cols-4">
        {SPECS.map(([k, v]) => (
          <div key={k} className="bg-[#120d08] p-5">
            <dt className="font-mono text-[11px] tracking-widest text-[#f4e9d8]/45 uppercase">
              {k}
            </dt>
            <dd className="mt-1 font-display text-xl">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function About() {
  return (
    <section className="mx-auto grid max-w-6xl gap-10 border-t border-[#f4e9d8]/10 px-6 py-20 md:grid-cols-[1fr_1.4fr]">
      <h2 className="font-display text-3xl font-light">The prompt</h2>
      <div>
        <blockquote className="border-l-2 border-amber-200/70 pl-5 font-mono text-sm leading-relaxed text-[#f4e9d8]/80">
          {PROMPT}
        </blockquote>
        <p className="mt-6 text-sm leading-relaxed text-[#f4e9d8]/60">
          Rendered with Google's Gemini 3 Pro Image model via Netlify AI Gateway, then
          served through the Netlify Image CDN, so each screen gets a right-sized WebP.
          The original 5504 × 3072 file is available above.
        </p>
      </div>
    </section>
  )
}