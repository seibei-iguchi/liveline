import React, { useState, useEffect, useRef, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import { Liveline } from 'liveline'
import type { LivelinePoint, CandlePoint, LivelineMarker } from 'liveline'

// --- Data generators ---

type Volatility = 'calm' | 'normal' | 'spiky' | 'chaos'

function generatePoint(prev: number, time: number, volatility: Volatility, baseValue = 100): LivelinePoint {
  const v: Record<Volatility, number> = { calm: 0.15, normal: 0.8, spiky: 3, chaos: 8 }
  const bias: Record<Volatility, number> = { calm: 0.49, normal: 0.48, spiky: 0.47, chaos: 0.45 }
  const priceScale = baseValue / 100
  const scale = v[volatility] * priceScale
  const spike = (volatility === 'spiky' || volatility === 'chaos') && Math.random() < 0.08
    ? (Math.random() - 0.5) * scale * 3
    : 0
  const delta = (Math.random() - bias[volatility]) * scale + spike
  return { time, value: prev + delta }
}

/** Aggregate tick data into OHLC candles by time bucket. */
function aggregateCandles(ticks: LivelinePoint[], width: number): { candles: CandlePoint[]; live: CandlePoint | null } {
  if (ticks.length === 0) return { candles: [], live: null }
  const candles: CandlePoint[] = []
  let slot = Math.floor(ticks[0].time / width) * width
  let o = ticks[0].value, h = o, l = o, c = o
  for (let i = 1; i < ticks.length; i++) {
    const t = ticks[i]
    if (t.time >= slot + width) {
      candles.push({ time: slot, open: o, high: h, low: l, close: c })
      slot = Math.floor(t.time / width) * width
      o = t.value; h = o; l = o; c = o
    } else {
      c = t.value
      if (c > h) h = c
      if (c < l) l = c
    }
  }
  return { candles, live: { time: slot, open: o, high: h, low: l, close: c } }
}

// --- Constants ---

const TIME_WINDOWS = [
  { label: '10s', secs: 10 },
  { label: '30s', secs: 30 },
  { label: '1m', secs: 60 },
  { label: '5m', secs: 300 },
]

const TICK_RATES: { label: string; ms: number }[] = [
  { label: '50ms', ms: 50 },
  { label: '100ms', ms: 100 },
  { label: '300ms', ms: 300 },
  { label: '1s', ms: 1000 },
]

const VOLATILITIES: Volatility[] = ['calm', 'normal', 'spiky', 'chaos']

const CANDLE_WIDTHS = [
  { label: '1s', secs: 1 },
  { label: '2s', secs: 2 },
  { label: '5s', secs: 5 },
  { label: '10s', secs: 10 },
]

const MARKER_SIZES = [3, 4, 5, 6, 8]
const MARKER_OUTLINE_SIZES = [2, 3, 4, 5, 6, 8]

type Preset = 'dev' | 'static'

function buildMarker(prev: LivelinePoint, pt: LivelinePoint, preset: Preset): LivelineMarker {
  const delta = pt.value - prev.value
  const positive = delta >= 0
  const amount = Math.abs(delta).toFixed(2)

  return {
    time: pt.time,
    label: `${positive ? 'Received' : 'Sent'}: ${amount}`,
    type: positive ? 'positive' : 'negative',
  }
}

function buildStaticFixture(baseValue = 100): {
  data: LivelinePoint[]
  value: number
  markers: LivelineMarker[]
} {
  const now = Date.now() / 1000
  const points: LivelinePoint[] = []
  const markers: LivelineMarker[] = []
  const windowSecs = 300
  const stepSecs = 1
  const count = windowSecs / stepSecs + 1
  let value = baseValue

  for (let i = 0; i < count; i++) {
    const drift = Math.sin(i / 18) * 0.18 + Math.sin(i / 47) * 0.24
    const noise = (Math.random() - 0.5) * 0.55
    value += drift + noise
    points.push({
      time: now - windowSecs + i * stepSecs,
      value,
    })
  }

  const markerIndexes = [24, 61, 98, 142, 186, 229, 271]
  for (const index of markerIndexes) {
    const prev = points[Math.max(0, index - 1)]
    const pt = points[index]
    markers.push({
      ...buildMarker(prev, pt, 'dev'),
      time: pt.time,
    })
  }

  return {
    data: points,
    value: points[points.length - 1].value,
    markers,
  }
}

// --- Demo ---

function Demo() {
  const [preset, setPreset] = useState<Preset>('dev')
  const [data, setData] = useState<LivelinePoint[]>([])
  const [value, setValue] = useState(100)
  const [loading, setLoading] = useState(true)
  const [paused, setPaused] = useState(false)
  const [scenario, setScenario] = useState<'loading' | 'loading-hold' | 'live' | 'empty'>('loading')

  const [windowSecs, setWindowSecs] = useState(30)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [grid, setGrid] = useState(true)
  const [scrub, setScrub] = useState(true)
  const [markerSize, setMarkerSize] = useState(4)
  const [markerOutlineSize, setMarkerOutlineSize] = useState<number | null>(null)

  const [volatility, setVolatility] = useState<Volatility>('normal')
  const [tickRate, setTickRate] = useState(300)

  const [chartType, setChartType] = useState<'line' | 'candle'>('candle')
  const [candleSecs, setCandleSecs] = useState(2)
  const [candles, setCandles] = useState<CandlePoint[]>([])
  const [liveCandle, setLiveCandle] = useState<CandlePoint | null>(null)
  const [markers, setMarkers] = useState<LivelineMarker[]>([])

  const candleSecsRef = useRef(candleSecs)
  candleSecsRef.current = candleSecs
  const [startValue, setStartValue] = useState(100)
  const lastValueRef = useRef(100)
  const liveCandleRef = useRef<CandlePoint | null>(null)
  const dataRef = useRef<LivelinePoint[]>([])
  const intervalRef = useRef<number>(0)
  const markersRef = useRef<LivelineMarker[]>([])
  const tickCounterRef = useRef(0)
  const volatilityRef = useRef(volatility)
  volatilityRef.current = volatility
  const startValueRef = useRef(startValue)
  startValueRef.current = startValue
  // Tick buffer covers the widest live demo window comfortably.
  const maxTicksRef = useRef(1200)
  const effectivePaused = preset === 'static' && scenario === 'live' ? true : paused

  const resetMarkers = () => {
    markersRef.current = []
    tickCounterRef.current = 0
    setMarkers([])
  }

  const setMarkerState = (next: LivelineMarker[]) => {
    markersRef.current = next
    setMarkers(next)
  }

  const seedMarkers = (seed: LivelinePoint[]) => {
    const desiredCount = preset === 'static' ? 8 : 6
    const visiblePoints = Math.max(
      desiredCount * 3,
      Math.ceil((windowSecs * 1000) / tickRate) + desiredCount * 2,
    )
    const tail = seed.slice(-visiblePoints)
    const step = Math.max(6, Math.floor(tail.length / desiredCount))
    const next: LivelineMarker[] = []

    for (let i = step; i < tail.length - 1; i += step) {
      next.push(buildMarker(tail[i - 1], tail[i], preset))
    }

    setMarkerState(next.slice(-desiredCount))
  }

  const maybeAddMarker = (prev: LivelinePoint, pt: LivelinePoint) => {
    tickCounterRef.current += 1
    const markerEvery = 18
    if (tickCounterRef.current % markerEvery !== 0) return

    const next = [...markersRef.current, buildMarker(prev, pt, preset)]
    setMarkerState(next.slice(-18))
  }

  const tickAndAggregate = (pt: LivelinePoint) => {
    const width = candleSecsRef.current
    const lc = liveCandleRef.current
    if (!lc) {
      const slot = Math.floor(pt.time / width) * width
      liveCandleRef.current = { time: slot, open: pt.value, high: pt.value, low: pt.value, close: pt.value }
      setLiveCandle({ ...liveCandleRef.current })
    } else if (pt.time >= lc.time + width) {
      const committed = { ...lc }
      setCandles(prev => {
        const next = [...prev, committed]
        return next.length > maxTicksRef.current ? next.slice(-maxTicksRef.current) : next
      })
      const slot = Math.floor(pt.time / width) * width
      liveCandleRef.current = { time: slot, open: pt.value, high: pt.value, low: pt.value, close: pt.value }
      setLiveCandle({ ...liveCandleRef.current })
    } else {
      lc.close = pt.value
      if (pt.value > lc.high) lc.high = pt.value
      if (pt.value < lc.low) lc.low = pt.value
      setLiveCandle({ ...lc })
    }
  }

  const startLive = useCallback(() => {
    clearInterval(intervalRef.current)
    setLoading(false)

    const now = Date.now() / 1000
    const base = startValueRef.current
    const seedTickInterval = 0.3
    const seedCount = 500
    const seed: LivelinePoint[] = []
    let v = base
    for (let i = seedCount; i >= 0; i--) {
      const pt = generatePoint(v, now - i * seedTickInterval, volatilityRef.current, base)
      seed.push(pt)
      v = pt.value
    }
    setData(seed)
    dataRef.current = seed
    setValue(v)
    lastValueRef.current = v
    seedMarkers(seed)

    const agg = aggregateCandles(seed, candleSecsRef.current)
    setCandles(agg.candles)
    setLiveCandle(agg.live)
    liveCandleRef.current = agg.live ? { ...agg.live } : null

    intervalRef.current = window.setInterval(() => {
      const now = Date.now() / 1000
      const prevValue = lastValueRef.current
      const pt = generatePoint(prevValue, now, volatilityRef.current, startValueRef.current)
      lastValueRef.current = pt.value
      setValue(pt.value)
      maybeAddMarker({ time: now - tickRate / 1000, value: prevValue }, pt)
      setData(prev => {
        const next = [...prev, pt]
        const trimmed = next.length > maxTicksRef.current ? next.slice(-maxTicksRef.current) : next
        dataRef.current = trimmed
        return trimmed
      })
      tickAndAggregate(pt)
    }, tickRate)
  }, [tickRate])

  useEffect(() => {
    if (scenario === 'loading') {
      setLoading(true)
      setData([]); dataRef.current = []
      setCandles([]); setLiveCandle(null); liveCandleRef.current = null
      resetMarkers()
      clearInterval(intervalRef.current)
      const timer = setTimeout(() => setScenario('live'), 3000)
      return () => clearTimeout(timer)
    }

    if (scenario === 'loading-hold') {
      setLoading(true)
      setData([]); dataRef.current = []
      setCandles([]); setLiveCandle(null); liveCandleRef.current = null
      resetMarkers()
      clearInterval(intervalRef.current)
      return
    }

    if (scenario === 'empty') {
      setLoading(false)
      setData([]); dataRef.current = []
      setCandles([]); setLiveCandle(null); liveCandleRef.current = null
      resetMarkers()
      clearInterval(intervalRef.current)
      return
    }

    if (preset === 'static') {
      clearInterval(intervalRef.current)
      setLoading(false)
      const fixture = buildStaticFixture(startValueRef.current)
      setData(fixture.data)
      dataRef.current = fixture.data
      setValue(fixture.value)
      lastValueRef.current = fixture.value
      setMarkerState(fixture.markers)
      const agg = aggregateCandles(fixture.data, candleSecsRef.current)
      setCandles(agg.candles)
      setLiveCandle(agg.live)
      liveCandleRef.current = agg.live ? { ...agg.live } : null
      return
    }

    startLive()
    return () => clearInterval(intervalRef.current)
  }, [preset, scenario, startLive])

  useEffect(() => {
    if (scenario !== 'live' || preset === 'static') return
    clearInterval(intervalRef.current)
    intervalRef.current = window.setInterval(() => {
      const now = Date.now() / 1000
      const prevValue = lastValueRef.current
      const pt = generatePoint(prevValue, now, volatilityRef.current, startValueRef.current)
      lastValueRef.current = pt.value
      setValue(pt.value)
      maybeAddMarker({ time: now - tickRate / 1000, value: prevValue }, pt)
      setData(prev => {
        const next = [...prev, pt]
        const trimmed = next.length > maxTicksRef.current ? next.slice(-maxTicksRef.current) : next
        dataRef.current = trimmed
        return trimmed
      })
      tickAndAggregate(pt)
    }, tickRate)
    return () => clearInterval(intervalRef.current)
  }, [preset, tickRate, scenario])

  useEffect(() => {
    if (preset === 'static' || scenario !== 'live' || dataRef.current.length === 0) return
    const agg = aggregateCandles(dataRef.current, candleSecs)
    setCandles(agg.candles)
    setLiveCandle(agg.live)
    liveCandleRef.current = agg.live ? { ...agg.live } : null
  }, [candleSecs, scenario])

  // Preset switch — reset all dependent state
  useEffect(() => {
    if (preset === 'static') {
      setStartValue(100)
      startValueRef.current = 100
      setTickRate(300)
      setCandleSecs(5)
      candleSecsRef.current = 5
      setWindowSecs(300)
      setVolatility('calm')
      setChartType('line')
      maxTicksRef.current = 1200
    } else {
      setStartValue(100)
      startValueRef.current = 100
      setTickRate(300)
      setCandleSecs(2)
      candleSecsRef.current = 2
      setWindowSecs(30)
      setVolatility('normal')
      setChartType('candle')
      maxTicksRef.current = 1200 // covers 5m window at ~3 ticks/sec
    }
    // Force re-seed by cycling to loading
    setData([]); dataRef.current = []
    setCandles([]); setLiveCandle(null); liveCandleRef.current = null
    resetMarkers()
    lastValueRef.current = 100
    clearInterval(intervalRef.current)
    if (preset === 'static') {
      setLoading(false)
      setScenario('live')
    } else {
      setLoading(true)
      setScenario('loading')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset])

  const isDark = theme === 'dark'
  const fgBase = isDark ? '255,255,255' : '0,0,0'
  const pageBg = isDark ? '#111' : '#f5f5f5'

  return (
    <div style={{
      padding: 32, maxWidth: 960, margin: '0 auto',
      color: isDark ? '#fff' : '#111',
      background: pageBg,
      minHeight: '100vh',
      transition: 'background 0.3s, color 0.3s',
      '--fg-02': `rgba(${fgBase},0.02)`,
      '--fg-06': `rgba(${fgBase},0.06)`,
      '--fg-08': `rgba(${fgBase},0.08)`,
      '--fg-20': `rgba(${fgBase},0.2)`,
      '--fg-25': `rgba(${fgBase},0.25)`,
      '--fg-30': `rgba(${fgBase},0.3)`,
      '--fg-35': `rgba(${fgBase},0.35)`,
      '--fg-45': `rgba(${fgBase},0.45)`,
    } as React.CSSProperties}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>
        Liveline Candlestick
      </h1>
      <p style={{ fontSize: 12, color: 'var(--fg-30)', marginBottom: 20 }}>Candlestick chart with line mode morph</p>

      <Section label="Preset">
        <Btn active={preset === 'dev'} onClick={() => setPreset('dev')}>Dev</Btn>
        <Btn active={preset === 'static'} onClick={() => setPreset('static')}>Static</Btn>
      </Section>

      <Section label="State">
        <Btn active={scenario === 'loading'} onClick={() => setScenario('loading')}>Loading → Live</Btn>
        <Btn active={scenario === 'loading-hold'} onClick={() => setScenario('loading-hold')}>Loading</Btn>
        <Btn active={scenario === 'live'} onClick={() => setScenario('live')}>Live</Btn>
        <Btn active={scenario === 'empty'} onClick={() => setScenario('empty')}>No Data</Btn>
        <Sep />
        <Btn active={paused} onClick={() => setPaused(p => !p)}>
          {paused ? '▶ Play' : '⏸ Pause'}
        </Btn>
      </Section>

      <Section label="Chart">
        <Btn active={chartType === 'candle'} onClick={() => setChartType('candle')}>Candle</Btn>
        <Btn active={chartType === 'line'} onClick={() => setChartType('line')}>Line</Btn>
        <Sep />
        <Label text="Width">
          {CANDLE_WIDTHS.map(cw => (
            <Btn key={cw.secs} active={candleSecs === cw.secs} onClick={() => setCandleSecs(cw.secs)}>{cw.label}</Btn>
          ))}
        </Label>
      </Section>

      {preset !== 'static' && (
        <Section label="Data">
          <Label text="Volatility">
            {VOLATILITIES.map(v => (
              <Btn key={v} active={volatility === v} onClick={() => setVolatility(v)}>{v}</Btn>
            ))}
          </Label>
          <Sep />
          <Label text="Tick rate">
            {TICK_RATES.map(t => (
              <Btn key={t.ms} active={tickRate === t.ms} onClick={() => setTickRate(t.ms)}>{t.label}</Btn>
            ))}
          </Label>
        </Section>
      )}

      <Section label="Window">
        {TIME_WINDOWS.map(w => (
          <Btn key={w.secs} active={windowSecs === w.secs} onClick={() => setWindowSecs(w.secs)}>
            {w.label}
          </Btn>
        ))}
      </Section>

      <Section label="Features">
        <Btn active={theme === 'dark'} onClick={() => setTheme('dark')}>Dark</Btn>
        <Btn active={theme === 'light'} onClick={() => setTheme('light')}>Light</Btn>
        <Sep />
        <Toggle on={grid} onToggle={setGrid}>Grid</Toggle>
        <Toggle on={scrub} onToggle={setScrub}>Scrub</Toggle>
        <Sep />
        <Label text="Marker size">
          {MARKER_SIZES.map(size => (
            <Btn key={size} active={markerSize === size} onClick={() => setMarkerSize(size)}>
              {size}
            </Btn>
          ))}
        </Label>
        <Sep />
        <Label text="Outline">
          <Btn active={markerOutlineSize === null} onClick={() => setMarkerOutlineSize(null)}>Auto</Btn>
          {MARKER_OUTLINE_SIZES.map(size => (
            <Btn key={size} active={markerOutlineSize === size} onClick={() => setMarkerOutlineSize(size)}>
              {size}
            </Btn>
          ))}
        </Label>
      </Section>

      {/* Main chart */}
      <div style={{
        height: 320,
        background: 'var(--fg-02)',
        borderRadius: 12,
        border: '1px solid var(--fg-06)',
        padding: 8,
        overflow: 'hidden',
        marginTop: 16,
      }}>
        <Liveline
          mode="candle"
          data={data}
          value={value}
          candles={candles}
          candleWidth={candleSecs}
          liveCandle={liveCandle ?? undefined}
          lineMode={chartType === 'line'}
          lineData={data}
          lineValue={value}
          loading={loading}
          paused={effectivePaused}
          theme={theme}
          color={preset === 'static' ? '#10b981' : undefined}
          window={windowSecs}
          onModeChange={(mode) => setChartType(mode)}
          markers={markers}
          markerSize={markerSize}
          markerOutlineSize={markerOutlineSize ?? undefined}
          grid={grid}
          scrub={scrub}
        />
      </div>

      {/* Size variants */}
      <p style={{ fontSize: 12, color: 'var(--fg-30)', marginTop: 24, marginBottom: 8 }}>Size variants</p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {[
          { w: 320, h: 180, label: '320×180' },
          { w: 240, h: 120, label: '240×120' },
          { w: 160, h: 100, label: '160×100' },
          { w: 120, h: 80, label: '120×80' },
        ].map(size => (
          <div key={size.label}>
            <span style={{ fontSize: 10, color: 'var(--fg-25)', display: 'block', marginBottom: 4 }}>
              {size.label}
            </span>
            <div style={{
              width: size.w,
              height: size.h,
              background: 'var(--fg-02)',
              borderRadius: 8,
              border: '1px solid var(--fg-06)',
              overflow: 'hidden',
            }}>
              <Liveline
                mode="candle"
                data={data}
                value={value}
                candles={candles}
                candleWidth={candleSecs}
                liveCandle={liveCandle ?? undefined}
                lineMode={chartType === 'line'}
                lineData={data}
                lineValue={value}
                loading={loading}
                paused={effectivePaused}
                theme={theme}
                color={preset === 'static' ? '#10b981' : undefined}
                window={windowSecs}
                markers={markers}
                markerSize={markerSize}
                markerOutlineSize={markerOutlineSize ?? undefined}
                grid={grid && size.w >= 200}
                scrub={scrub}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Status bar */}
      <div style={{
        marginTop: 10,
        fontSize: 11,
        fontFamily: '"SF Mono", Menlo, monospace',
        color: 'var(--fg-25)',
        display: 'flex',
        gap: 16,
        flexWrap: 'wrap',
      }}>
        <span>preset: {preset}</span>
        <span>ticks: {data.length}</span>
        <span>candles: {candles.length}</span>
        <span>loading: {String(loading)}</span>
        <span>paused: {String(effectivePaused)}</span>
        <span>value: {value.toFixed(2)}</span>
        <span>window: {windowSecs}s</span>
        <span>candle: {candleSecs}s</span>
        <span>tick: {tickRate}ms</span>
        <span>markers: {markers.length}</span>
        <span>volatility: {volatility}</span>
        <span>mode: {chartType}</span>
      </div>
    </div>
  )
}

// --- UI components ---

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 10, color: 'var(--fg-30)', width: 56, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}
      </span>
      {children}
    </div>
  )
}

function Label({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: 10, color: 'var(--fg-20)', marginRight: 2 }}>{text}:</span>
      {children}
    </div>
  )
}

function Sep() {
  return <div style={{ width: 1, height: 16, background: 'var(--fg-08)', margin: '0 2px' }} />
}

function Toggle({ on, onToggle, children }: { on: boolean; onToggle: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <button
      onClick={() => onToggle(!on)}
      style={{
        fontSize: 11,
        padding: '4px 10px',
        borderRadius: 5,
        border: '1px solid',
        borderColor: on ? 'rgba(59,130,246,0.4)' : 'var(--fg-06)',
        background: on ? 'rgba(59,130,246,0.1)' : 'transparent',
        color: on ? '#3b82f6' : 'var(--fg-35)',
        cursor: 'pointer',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        transition: 'all 0.15s',
      }}
    >
      {children}
    </button>
  )
}

function Btn({ children, active, onClick }: {
  children: React.ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 11,
        padding: '4px 10px',
        borderRadius: 5,
        border: '1px solid',
        borderColor: active ? 'rgba(59,130,246,0.5)' : 'var(--fg-08)',
        background: active ? 'rgba(59,130,246,0.12)' : 'var(--fg-02)',
        color: active ? '#3b82f6' : 'var(--fg-45)',
        cursor: 'pointer',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        transition: 'all 0.15s',
      }}
    >
      {children}
    </button>
  )
}

createRoot(document.getElementById('root')!).render(<Demo />)
