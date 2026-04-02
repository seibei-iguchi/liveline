import type {
  ThemeMode,
  LivelinePalette,
  LivelineSeries,
  LivelineTypography,
  LivelineFontSpec,
  LivelineFontValue,
} from './types'

const DEFAULT_LABEL_FONT = '400 12px system-ui, -apple-system, sans-serif'
const DEFAULT_GRID_LABEL_FONT = '11px "SF Mono", Menlo, Monaco, "Cascadia Code", monospace'
const DEFAULT_SCRUB_FONT = '400 13px "SF Mono", Menlo, monospace'
const DEFAULT_SERIES_LABEL_FONT = '600 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif'
const DEFAULT_REF_LABEL_FONT = '500 11px system-ui, sans-serif'
const DEFAULT_EMPTY_FONT = '400 12px system-ui, -apple-system, sans-serif'
const DEFAULT_ORDERBOOK_FONT = '600 13px "SF Mono", Menlo, monospace'
const DEFAULT_VALUE_FONT = '600 11px "SF Mono", Menlo, monospace'
const DEFAULT_BADGE_FONT = '500 11px "SF Mono", Menlo, monospace'

/** Parse any CSS color string to [r, g, b]. Handles hex (#rgb, #rrggbb), rgb(), rgba(). */
export function parseColorRgb(color: string): [number, number, number] {
  const hex = color.match(/^#([0-9a-f]{3,8})$/i)
  if (hex) {
    let h = hex[1]
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2]
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)]
  }
  const rgb = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (rgb) return [+rgb[1], +rgb[2], +rgb[3]]
  return [128, 128, 128]
}

function rgba(r: number, g: number, b: number, a: number): string {
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

function formatFontSize(size: number | string): string {
  return typeof size === 'number' ? `${size}px` : size
}

function formatLineHeight(lineHeight: number | string): string {
  return typeof lineHeight === 'number' ? String(lineHeight) : lineHeight
}

function formatFontFamily(family: string | string[]): string {
  return Array.isArray(family) ? family.join(', ') : family
}

function serializeFontSpec(font: LivelineFontSpec): string {
  const parts = [
    font.style,
    font.variant,
    font.weight != null ? String(font.weight) : undefined,
  ].filter(Boolean)
  const size = formatFontSize(font.size)
  const lineHeight = font.lineHeight != null ? `/${formatLineHeight(font.lineHeight)}` : ''
  parts.push(`${size}${lineHeight}`)
  parts.push(formatFontFamily(font.family))
  return parts.join(' ')
}

function toCanvasFont(font: LivelineFontValue | undefined, fallback: string): string {
  if (font == null) return fallback
  return typeof font === 'string' ? font : serializeFontSpec(font)
}

/**
 * Derive a full palette from a single accent color + theme mode.
 * Momentum colors are always semantic green/red regardless of accent.
 */
export function resolveTheme(
  color: string,
  mode: ThemeMode,
  typography: LivelineTypography = {},
): LivelinePalette {
  const [r, g, b] = parseColorRgb(color)
  const isDark = mode === 'dark'
  const labelFont = toCanvasFont(typography.labelFont, DEFAULT_LABEL_FONT)
  const gridLabelFont = toCanvasFont(typography.gridLabelFont ?? typography.labelFont, DEFAULT_GRID_LABEL_FONT)
  const scrubFont = toCanvasFont(typography.scrubFont ?? typography.labelFont, DEFAULT_SCRUB_FONT)
  const seriesLabelFont = toCanvasFont(typography.seriesLabelFont ?? typography.labelFont, DEFAULT_SERIES_LABEL_FONT)
  const refLabelFont = toCanvasFont(typography.labelFont, DEFAULT_REF_LABEL_FONT)
  const emptyFont = toCanvasFont(typography.labelFont, DEFAULT_EMPTY_FONT)
  const orderbookFont = toCanvasFont(typography.scrubFont ?? typography.labelFont, DEFAULT_ORDERBOOK_FONT)
  const badgeFont = toCanvasFont(typography.labelFont ?? typography.gridLabelFont, DEFAULT_BADGE_FONT)

  return {
    // Line
    line: color,
    lineWidth: 2,

    // Fill gradient
    fillTop: rgba(r, g, b, isDark ? 0.12 : 0.08),
    fillBottom: rgba(r, g, b, 0),

    // Grid
    gridLine: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
    gridLabel: isDark ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.35)',

    // Dot — always semantic
    dotUp: '#22c55e',
    dotDown: '#ef4444',
    dotFlat: color,
    glowUp: 'rgba(34, 197, 94, 0.18)',
    glowDown: 'rgba(239, 68, 68, 0.18)',
    glowFlat: rgba(r, g, b, 0.12),

    // Badge
    badgeOuterBg: isDark ? 'rgba(40, 40, 40, 0.95)' : 'rgba(255, 255, 255, 0.95)',
    badgeOuterShadow: isDark ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.15)',
    badgeBg: color,
    badgeText: '#ffffff',

    // Dash line
    dashLine: rgba(r, g, b, 0.4),

    // Reference line
    refLine: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.12)',
    refLabel: isDark ? 'rgba(255, 255, 255, 0.45)' : 'rgba(0, 0, 0, 0.4)',

    // Time axis
    timeLabel: isDark ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.3)',

    // Crosshair
    crosshairLine: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.12)',
    tooltipBg: isDark ? 'rgba(30, 30, 30, 0.95)' : 'rgba(255, 255, 255, 0.95)',
    tooltipText: isDark ? '#e5e5e5' : '#1a1a1a',
    tooltipBorder: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',

    // Background
    bgRgb: isDark ? [10, 10, 10] as [number, number, number] : [255, 255, 255] as [number, number, number],

    // Fonts
    labelFont,
    gridLabelFont,
    scrubFont,
    seriesLabelFont,
    refLabelFont,
    emptyFont,
    orderbookFont,
    valueFont: DEFAULT_VALUE_FONT,
    badgeFont,
  }
}

/** Default color palette for multi-series when no colors specified. */
export const SERIES_COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#22c55e', // green
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
]

/** Derive per-series palettes from series definitions. */
export function resolveSeriesPalettes(
  series: LivelineSeries[],
  mode: ThemeMode,
  typography: LivelineTypography = {},
): Map<string, LivelinePalette> {
  const map = new Map<string, LivelinePalette>()
  for (let i = 0; i < series.length; i++) {
    const s = series[i]
    const color = s.color || SERIES_COLORS[i % SERIES_COLORS.length]
    map.set(s.id, resolveTheme(color, mode, typography))
  }
  return map
}
