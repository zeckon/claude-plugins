import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Counters, Git, Snapshot, Tokens } from '../types'

// ── State ────────────────────────────────────────────────────────────────

const ZERO: Tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
const NO_COUNTS: Counters = { tools: 0, edits: 0, compacts: 0, lastTurnMs: null }
const HISTORY_LEN = 24

const snapAtom = atom({ plugin: 'pixelbar', key: 'snap' } as const, null)
const effortAtom = atom({ plugin: 'pixelbar', key: 'effort' } as const, null)
const lastAtom = atom({ plugin: 'pixelbar', key: 'last' } as const, null)
const totalAtom = atom({ plugin: 'pixelbar', key: 'total' } as const, ZERO)
const historyAtom = atom({ plugin: 'pixelbar', key: 'history' } as const, [])
const paletteAtom = atom({ plugin: 'pixelbar', key: 'palette' } as const, 'gameboy')
const countersAtom = atom({ plugin: 'pixelbar', key: 'counters' } as const, NO_COUNTS)
/** Sections hidden until /pixelbar-sections says otherwise. */
export const DEFAULT_HIDDEN: readonly string[] = ['commit', '7d', 'last', 'agents', 'tools', 'edits', 'compacts', 'hint']
const hiddenAtom = atom({ plugin: 'pixelbar', key: 'hidden' } as const, [...DEFAULT_HIDDEN])

// ── Palettes: each one hue, dark to light, plus one alert tone ───────────

type Palette = {
  id: string
  name: string
  ground: number
  tiles: number
  labels: number
  accent: number
  values: number
  alert: number
}

export const PALETTES: readonly Palette[] = [
  { id: 'gameboy', name: 'Game Boy', ground: 0x0f380f, tiles: 0x306230, labels: 0x8bac0f, accent: 0x9bbc0f, values: 0xe0f8d0, alert: 0xff5050 },
  { id: 'phosphor', name: 'Green phosphor', ground: 0x0b120c, tiles: 0x18301c, labels: 0x3f8f4c, accent: 0x39ff6a, values: 0xc8ffd2, alert: 0xffb000 },
  { id: 'amber', name: 'Amber monitor', ground: 0x120c04, tiles: 0x2e1f08, labels: 0x9a6418, accent: 0xffb000, values: 0xffe2a8, alert: 0xff3b30 },
  { id: 'slate', name: 'Cool slate', ground: 0x0e1116, tiles: 0x1f2733, labels: 0x5b6b82, accent: 0x7cc4ff, values: 0xdbe7f5, alert: 0xff6b5a },
  { id: 'clay', name: 'Clay', ground: 0x14100e, tiles: 0x3d2c24, labels: 0xa96a50, accent: 0xd97757, values: 0xf2cdbb, alert: 0xff5a36 },
  { id: 'synthwave', name: 'Synthwave', ground: 0x140a1f, tiles: 0x2d1747, labels: 0x8a4fbf, accent: 0xff4fd8, values: 0xf3d9ff, alert: 0x2de2e6 },
  { id: 'ocean', name: 'Ocean', ground: 0x071a1f, tiles: 0x0f3640, labels: 0x2a8a96, accent: 0x4fe0d0, values: 0xd4f7f2, alert: 0xff7a59 },
  { id: 'ice', name: 'Ice', ground: 0x0c1418, tiles: 0x22343d, labels: 0x6f8f9c, accent: 0xbfe9ff, values: 0xf2fbff, alert: 0xff4d6d },
  { id: 'sepia', name: 'Sepia', ground: 0x17110b, tiles: 0x33261a, labels: 0x8c7254, accent: 0xd9b98c, values: 0xf5ead8, alert: 0xe0533d },
  { id: 'grayscale', name: 'Grayscale', ground: 0x0d0d0d, tiles: 0x262626, labels: 0x7a7a7a, accent: 0xe0e0e0, values: 0xffffff, alert: 0xff4040 },
  { id: 'virtualboy', name: 'Virtual Boy', ground: 0x0a0000, tiles: 0x330000, labels: 0x8c0000, accent: 0xff2020, values: 0xffb3b3, alert: 0xffffff },
  { id: 'matrix', name: 'Matrix', ground: 0x000000, tiles: 0x002200, labels: 0x008f11, accent: 0x00ff41, values: 0xb8ffc8, alert: 0xff3b3b },
]

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** The palette named by id or name, loosely: `game boy`, `GameBoy`, `matrix`. */
export function findPalette(query: string): Palette | undefined {
  const key = squash(query)
  return PALETTES.find(p => p.id === key || squash(p.name) === key) ?? PALETTES.find(p => p.id.startsWith(key))
}

// The colors drawing reads; `usePalette` sets them before each paint.
let BASE = 0 // the strip's ground
let C1 = 0 // empty gauge cells, trail
let C2 = 0 // tile ground
let C3 = 0 // quiet text
let C4 = 0 // labels
let ACCENT = 0 // the character at work, filled gauges
let LIGHT = 0 // values
let ALERT = 0 // warnings

function usePalette(p: Palette): void {
  BASE = p.ground
  C1 = mix(p.ground, p.tiles, 0.5)
  C2 = p.tiles
  C3 = mix(p.tiles, p.labels, 0.5)
  C4 = p.labels
  ACCENT = p.accent
  LIGHT = p.values
  ALERT = p.alert
}

function mix(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 0xff) * (1 - t) + ((b >> s) & 0xff) * t) << s
  return ch(16) | ch(8) | ch(0)
}

// ── Sections: what /pixelbar-sections switches on and off ────────────────

export const SECTIONS = [
  { id: 'dir', line: 1, about: 'working folder' },
  { id: 'git', line: 1, about: 'branch, changed files, ahead/behind' },
  { id: 'diff', line: 1, about: 'lines added/removed vs last commit' },
  { id: 'commit', line: 1, about: 'last commit age and subject' },
  { id: 'stash', line: 1, about: 'stash count (when any)' },
  { id: 'mode', line: 2, about: 'permission mode tile' },
  { id: 'model', line: 2, about: 'model' },
  { id: 'effort', line: 2, about: 'reasoning effort' },
  { id: 'ctx', line: 2, about: 'context window gauge' },
  { id: 'cache', line: 2, about: 'cache hit rate' },
  { id: 'tok', line: 2, about: 'tokens-per-turn sparkline' },
  { id: '5h', line: 2, about: 'five-hour usage limit' },
  { id: '7d', line: 2, about: 'seven-day usage limit' },
  { id: 'session', line: 2, about: 'session clock, turns, tokens, cost' },
  { id: 'last', line: 2, about: 'last turn duration' },
  { id: 'agents', line: 2, about: 'running subagents (when any)' },
  { id: 'tools', line: 2, about: 'tool calls this session' },
  { id: 'edits', line: 2, about: 'files edited this session' },
  { id: 'compacts', line: 2, about: 'compactions (when any)' },
  { id: 'hint', line: 2, about: "Claude Code's hint text" },
] as const

type SectionId = (typeof SECTIONS)[number]['id']

export function findSection(query: string): SectionId | undefined {
  const key = squash(query)
  return SECTIONS.find(s => s.id === key)?.id
}

// ── Canvas: the Raster's cells ───────────────────────────────────────────

/**
 * A Raster cell holds one printable width-1 character; anything else refuses
 * the whole tree. Text from outside (paths, branches, commit subjects, the
 * engine's hint) is cut down to printable ASCII.
 */
function ascii(s: string): string {
  return s.replace(/[^\x20-\x7e]+/g, ' ').replace(/\s+/g, ' ').trim()
}

const ROWS = 1

class Canvas {
  readonly cells: Uint32Array
  readonly h = ROWS

  constructor(readonly w: number) {
    this.cells = new Uint32Array(w * ROWS * 3)
    for (let i = 0; i < w * ROWS; i++) this.cells.set([0x20, LIGHT, BASE], i * 3)
  }

  put(x: number, y: number, ch: string, fg: number, bg = BASE): void {
    if (x < 0 || x >= this.w || y < 0 || y >= this.h) return
    this.cells.set([ch.codePointAt(0) ?? 0x20, fg, bg], (y * this.w + x) * 3)
  }

  /** Writes `s` from `x`, clipped at the edge; returns the column after it. */
  text(x: number, y: number, s: string, fg: number, bg = BASE): number {
    for (const ch of s) this.put(x++, y, ch, fg, bg)
    return x
  }

  base64(): string {
    return toBase64(new Uint8Array(this.cells.buffer))
  }
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function toBase64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1] ?? 0
    const c = bytes[i + 2] ?? 0
    const n = (a << 16) | (b << 8) | c
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63]! : '='
    out += i + 2 < bytes.length ? B64[n & 63]! : '='
  }
  return out
}

// ── The walker: 2 cells of quarter blocks (4×2 pixels), one row tall ─────
// It lives in a 3-cell slot: the third cell holds its sparkles and z's.

export type Mood = 'idle' | 'walk' | 'happy' | 'panic' | 'sleep'
export type Pose = { mood: Mood; frame: number }

const FRAMES: Record<Mood, readonly string[]> = {
  idle: ['▛▜'],
  walk: ['▛▜', '▜▛'], // legs out, legs in
  happy: ['▟▙', '▛▜'], // arms up, then down: a hop
  panic: ['▛▜', '▜▛'], // flailing, drawn shaking
  sleep: ['▄▄'], // curled up
}

const WALKER_X = 1
const WALKER_W = 3
const CONTENT_X = WALKER_X + WALKER_W + 1

function bodyColor(mood: Mood): number {
  return mood === 'panic' ? ALERT : mood === 'walk' || mood === 'happy' ? ACCENT : mood === 'sleep' ? C3 : C4
}

function drawWalker(c: Canvas, pose: Pose): void {
  const frames = FRAMES[pose.mood]
  const glyph = frames[pose.frame % frames.length] ?? frames[0]!
  const shake = pose.mood === 'panic' && pose.frame % 2 ? 1 : 0
  c.text(WALKER_X + shake, 0, glyph, bodyColor(pose.mood))
  const side = WALKER_X + 2
  if (pose.mood === 'happy') c.put(side, 0, pose.frame % 2 ? '+' : '*', LIGHT)
  if (pose.mood === 'sleep') c.put(side, 0, pose.frame % 2 ? 'Z' : 'z', C4)
}

// ── Items: what the row is made of, laid out left to right ───────────────

type Item = { id: SectionId; width: number; priority: number; draw: (c: Canvas, x: number, y: number) => void }

/** `▐ LABEL value ▌`: half-block edges give the tile a stepped pixel outline. */
function tile(id: SectionId, label: string, value: string, priority: number, valueColor?: number): Item {
  return {
    id,
    width: label.length + value.length + 5,
    priority,
    draw: (c, x, y) => {
      c.put(x++, y, '▐', C2)
      x = c.text(x, y, ` ${label} `, C4, C2)
      x = c.text(x, y, `${value} `, valueColor ?? LIGHT, C2)
      c.put(x, y, '▌', C2)
    },
  }
}

function gauge(c: Canvas, x: number, y: number, width: number, pct: number, isHot: boolean): number {
  const filled = Math.round((Math.min(100, Math.max(0, pct)) / 100) * width)
  for (let i = 0; i < width; i++) {
    const t = i / Math.max(1, width - 1)
    c.put(x + i, y, '▆', i >= filled ? C1 : isHot ? ALERT : mix(C3, ACCENT, t))
  }
  return x + width
}

function gaugeItem(id: SectionId, label: string, pct: number, width: number, hotAt: number, priority: number, extra = ''): Item {
  const isHot = pct >= hotAt
  const text = ` ${Math.round(pct)}%${extra}`
  return {
    id,
    width: label.length + 1 + width + text.length,
    priority,
    draw: (c, x, y) => {
      x = c.text(x, y, `${label} `, C4)
      x = gauge(c, x, y, width, pct, isHot)
      c.text(x, y, text, isHot ? ALERT : LIGHT)
    },
  }
}

const SPARKS = '▁▂▃▄▅▆▇█'

function sparkItem(history: number[]): Item | null {
  const spark = history.slice(-12)
  if (!spark.length) return null
  const max = Math.max(1, ...spark)
  return {
    id: 'tok',
    width: 4 + spark.length,
    priority: 4,
    draw: (c, x, y) => {
      x = c.text(x, y, 'TOK ', C4)
      for (const v of spark) {
        const level = Math.min(SPARKS.length - 1, Math.floor((v / max) * (SPARKS.length - 1)))
        c.put(x++, y, SPARKS[level]!, mix(C3, LIGHT, level / (SPARKS.length - 1)))
      }
    },
  }
}

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']

const EFFORT_BARS = '▁▂▃▄▅'

/**
 * Effort as a tile of rising bars, one per level, lit up to the current one:
 * `▐ ▁▂▃▄▅ ▌` with three lit is `high`. An effort the bars don't know (or
 * none yet) shows as its word.
 */
function effortItem(effort: string | null): Item {
  const level = effort === null ? -1 : EFFORTS.indexOf(effort)
  if (level < 0) return tile('effort', 'EFFORT', effort === null ? 'AUTO' : clip(effort, 10).toUpperCase(), 2)
  return {
    id: 'effort',
    width: EFFORT_BARS.length + 4,
    priority: 2,
    draw: (c, x, y) => {
      c.put(x++, y, '▐', C2)
      c.put(x++, y, ' ', C2, C2)
      for (let i = 0; i < EFFORT_BARS.length; i++) c.put(x++, y, EFFORT_BARS[i]!, i <= level ? LIGHT : C3, C2)
      c.put(x++, y, ' ', C2, C2)
      c.put(x, y, '▌', C2)
    },
  }
}

function projectItems(snap: Snapshot, now: number): Item[] {
  const out: Item[] = [tile('dir', 'DIR', clip(snap.dir, 24), 1)]
  const g = snap.git
  if (!g) return out
  let branch = clip(g.branch, 28)
  if (g.dirty) branch += ` *${g.dirty}`
  if (g.ahead) branch += ` ^${g.ahead}`
  if (g.behind) branch += ` v${g.behind}`
  out.push(tile('git', 'GIT', branch, 1.5))
  if (g.added || g.removed) out.push(tile('diff', 'DIFF', `+${g.added} -${g.removed}`, 3))
  if (g.commitAt !== null) {
    out.push(tile('commit', 'COMMIT', `${duration(now - g.commitAt)} ${clip(g.commitSubject, 36)}`, 4))
  }
  if (g.stashes) out.push(tile('stash', 'STASH', `${g.stashes}`, 5))
  return out
}

function claudeItems(
  snap: Snapshot,
  total: Tokens,
  history: number[],
  counters: Counters,
  mode: string,
  now: number,
): Item[] {
  const out: (Item | null)[] = [
    tile('mode', 'MODE', modeLabel(mode), 1),
    tile('model', 'MODEL', clip(modelName(snap.model), 18), 2),
    effortItem(snap.effort),
    gaugeItem('ctx', 'CTX', snap.ctxPercent ?? 0, 6, 80, 1,
      ` ${compact(snap.ctxTokens ?? 0)}/${compact(snap.ctxWindow)}`),
  ]
  const cacheBase = total.input + total.cacheRead + total.cacheWrite
  if (cacheBase) out.push(tile('cache', 'CACHE', `${Math.round((total.cacheRead / cacheBase) * 100)}%`, 4))
  out.push(sparkItem(history))
  if (snap.limit5h !== null) out.push(gaugeItem('5h', '5H', snap.limit5h, 6, 90, 4))
  if (snap.limit7d !== null) out.push(gaugeItem('7d', '7D', snap.limit7d, 6, 90, 5))

  let session = snap.startedAt ? `${duration(now - snap.startedAt)} ${snap.turns}T` : `${snap.turns}T`
  if (total.input + total.output) session += ` ${compact(total.input + total.output)}`
  if (snap.costUsd !== null) session += ` $${snap.costUsd.toFixed(2)}`
  out.push(tile('session', 'SESSION', session, 3))
  if (counters.lastTurnMs !== null) out.push(tile('last', 'LAST', duration(counters.lastTurnMs), 4))
  if (snap.agents) out.push(tile('agents', 'AGENTS', `${snap.agents}`, 3, ACCENT))
  if (counters.tools) out.push(tile('tools', 'TOOLS', `${counters.tools}`, 5))
  if (counters.edits) out.push(tile('edits', 'EDITS', `${counters.edits}`, 4))
  if (counters.compacts) out.push(tile('compacts', 'CMP', `${counters.compacts}`, 5))
  return out.filter((i): i is Item => i !== null)
}

/**
 * Lays out one line: `left` from `x0`, `right` packed against the right edge.
 * Drops the least important items (the rightmost of the lowest rank, across
 * both groups) until the rest fit, and fills the gap with a faint pixel trail.
 */
function drawLine(c: Canvas, y: number, x0: number, left: Item[], right: Item[]): void {
  let list = [...left, ...right]
  const width = (l: Item[]) => l.reduce((n, i) => n + i.width + 1, x0)
  while (list.length > 1 && width(list) > c.w) {
    const worst = list.reduce((a, b) => (b.priority >= a.priority ? b : a))
    list = list.filter(i => i !== worst)
  }
  let x = x0
  for (const item of left.filter(i => list.includes(i))) {
    item.draw(c, x, y)
    x += item.width + 1
  }
  const shownRight = right.filter(i => list.includes(i))
  let rx = c.w - shownRight.reduce((n, i) => n + i.width + 1, 0) + 1
  for (let i = x; i < rx - 1; i++) c.put(i, y, '░', C1)
  for (const item of shownRight) {
    item.draw(c, rx, y)
    rx += item.width + 1
  }
}

// ── Mode: which permission mode the MODE tile names ───────────────────────
//
// Outside the default mode the engine draws a pill (`⏵⏵ auto mode on`) at
// the left of the hint row, outside this site, on the site's first row; the
// site's `hint` is then only the rest (`(shift+tab to cycle)`). The strip
// paints over that pill (see `ui.render` below) and names the mode in its own
// MODE tile instead. Mods can't read the mode directly, so it is gathered
// from the pill's phrase, which reaches the hint for a moment as the mode
// changes, and from the `permission_mode` of each classic prompt hook.

const PHRASES: readonly [RegExp, string][] = [
  [/auto mode on/i, 'auto'],
  [/plan mode on/i, 'plan'],
  [/accept edits on/i, 'acceptEdits'],
  [/bypass permissions on/i, 'bypassPermissions'],
  [/don'?t ask(?: mode)? on/i, 'dontAsk'],
  [/manual mode on/i, 'default'],
]
const CYCLE = /\(shift\+tab to cycle\)/i

const MODE_LABELS: Record<string, string> = {
  default: 'DEFAULT',
  auto: 'AUTO',
  plan: 'PLAN',
  acceptEdits: 'ACCEPT EDITS',
  bypassPermissions: 'BYPASS',
  dontAsk: "DON'T ASK",
  unknown: 'ON',
}

export function modeLabel(mode: string): string {
  return MODE_LABELS[mode] ?? clip(mode, 14).toUpperCase()
}

export type HintRead = {
  /** The mode this hint's pill phrase names (`auto`), else null. */
  mode: string | null
  /** True when the hint carries the pill's `(shift+tab to cycle)`: some mode other than the default is on. */
  hasPill: boolean
  /** The hint with the pill's words and the cycle reminder taken out. */
  rest: string
}

export function readHint(hint: string): HintRead {
  let text = ascii(hint)
  let mode: string | null = null
  for (const [re, id] of PHRASES) {
    if (re.test(text)) {
      mode ??= id
      text = text.replace(re, ' ')
    }
  }
  const rest = text
    .replace(CYCLE, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s|·-]+|[\s|·-]+$/g, '')
  return { mode, hasPill: CYCLE.test(text), rest }
}

/**
 * Columns from the hint row's left margin to where this site starts: the
 * engine's pill and its ` · ` (`⏸ plan mode on · `), by mode. Measured on the
 * terminal, build 2.1.308, where every mode draws a pill (the default's is
 * `⏸ manual mode on`). An unknown mode is taken to be auto's width.
 */
const PILL_OFFSETS: Record<string, number> = {
  default: 19,
  acceptEdits: 21,
  plan: 17,
  auto: 18,
  dontAsk: 18,
  bypassPermissions: 27,
}

export const pillOffset = (mode: string) => PILL_OFFSETS[mode] ?? PILL_OFFSETS.auto!

/**
 * Columns of the hint row the strip spans: the row less the engine's
 * two-column margins at each side (measured on the terminal; the right one
 * also keeps the strip off the last column, where writing can wrap the row).
 */
export const stripWidth = (columns: number) => Math.max(30, Math.min(512, columns - 4))

// ── Formatting ───────────────────────────────────────────────────────────

function compact(n: number): string {
  if (n < 1000) return `${n}`
  const [div, unit] = n < 1e6 ? [1e3, 'K'] : [1e6, 'M']
  const v = n / div
  return `${(v < 10 ? v.toFixed(1) : v.toFixed(0)).replace(/\.0$/, '')}${unit}`
}

/** `48s`, `12m`, `1h12m`, `3d`. */
function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}h${m % 60 ? `${m % 60}m` : ''}`
  return `${Math.floor(h / 24)}d`
}

function clip(s: string, max: number): string {
  const a = ascii(s)
  return a.length <= max ? a : `${a.slice(0, max - 1)}~`
}

function modelName(raw: string): string {
  return raw
    .replace(/^claude-/i, '')
    .replace(/\[1m\]$/i, ' 1M')
    .replace(/-(\d+)-(\d+)$/, ' $1.$2')
    .replace(/-/g, ' ')
    .toUpperCase()
}

// ── Painting ─────────────────────────────────────────────────────────────

export type PaintInput = {
  snap: Snapshot
  total: Tokens
  history: number[]
  counters: Counters
  hint: HintRead
  /** The permission mode (`default`, `auto`, ...) the MODE tile names. */
  mode: string
  pose: Pose
  columns: number
  now: number
  palette?: Palette
  hidden?: readonly string[]
}

/**
 * Paints the strip, one row over the engine's pill line: the walker, the
 * mode and the Claude and session sections from the left; the engine's hint
 * and the project sections packed against the right end.
 */
export function paint(p: PaintInput): Canvas {
  usePalette(p.palette ?? PALETTES[0]!)
  const c = new Canvas(stripWidth(p.columns))
  const hidden = new Set(p.hidden ?? DEFAULT_HIDDEN)
  const visible = (items: Item[]) => items.filter(i => !hidden.has(i.id))

  drawWalker(c, p.pose)

  const rest = p.hint.rest
  const hintItem: Item | null =
    rest && !hidden.has('hint')
      ? { id: 'hint', width: rest.length, priority: 2.5, draw: (cv, x, y) => cv.text(x, y, rest, C3) }
      : null

  const project = visible(projectItems(p.snap, p.now))
  const claude = visible(claudeItems(p.snap, p.total, p.history, p.counters, p.mode, p.now))
  drawLine(c, 0, CONTENT_X, claude, hintItem ? [hintItem, ...project] : project)
  return c
}

// ── Reading the session ──────────────────────────────────────────────────

async function git($: EngineInterface, cwd: string, args: string[]): Promise<string | null> {
  try {
    const r = await $.process.run(['git', ...args], { cwd, timeoutMs: 5000 })
    return r.exitCode === 0 ? r.stdout : null
  } catch {
    return null
  }
}

async function readGit($: EngineInterface, cwd: string): Promise<Git | null> {
  const [status, diff, log, stash] = await Promise.all([
    git($, cwd, ['status', '--porcelain=v2', '--branch']),
    git($, cwd, ['diff', '--shortstat', 'HEAD']),
    git($, cwd, ['log', '-1', '--format=%ct%x09%s']),
    git($, cwd, ['rev-list', '--walk-reflogs', '--count', 'refs/stash']),
  ])
  if (status === null) return null

  let head = ''
  let oid = ''
  let ahead = 0
  let behind = 0
  let dirty = 0
  for (const line of status.split('\n')) {
    if (line.startsWith('# branch.head ')) head = line.slice(14)
    else if (line.startsWith('# branch.oid ')) oid = line.slice(13)
    else if (line.startsWith('# branch.ab ')) {
      const m = /\+(\d+) -(\d+)/.exec(line)
      ahead = Number(m?.[1] ?? 0)
      behind = Number(m?.[2] ?? 0)
    } else if (line && !line.startsWith('#')) dirty++
  }

  const tab = log?.indexOf('\t') ?? -1
  return {
    branch: head === '(detached)' ? `@${oid.slice(0, 7)}` : head,
    dirty,
    ahead,
    behind,
    added: Number(/(\d+) insertion/.exec(diff ?? '')?.[1] ?? 0),
    removed: Number(/(\d+) deletion/.exec(diff ?? '')?.[1] ?? 0),
    commitAt: log && tab > 0 ? Number(log.slice(0, tab)) * 1000 : null,
    commitSubject: log && tab > 0 ? log.slice(tab + 1).trim() : '',
    stashes: Number((stash ?? '0').trim()) || 0,
  }
}

async function configuredEffort($: EngineInterface): Promise<string | null> {
  const fromSettings = await $.settings.read({ key: 'effortLevel' })
  if (typeof fromSettings === 'string') return fromSettings
  return (await $.env.get('CLAUDE_EFFORT')) ?? null
}

async function refresh($: EngineInterface): Promise<void> {
  const cwd = await $.session.cwd()
  const [model, usage, turns, gitState, seen, agents] = await Promise.all([
    $.session.model(),
    $.session.usage(),
    $.session.turns(),
    readGit($, cwd),
    read($, effortAtom),
    $.agent.list().catch(() => []),
  ])
  const limit = (kind: string) => usage.rateLimits.find(l => l.kind === kind)?.percentUsed ?? null
  const snap: Snapshot = {
    dir: cwd.split('/').filter(Boolean).pop() ?? cwd,
    git: gitState,
    model,
    effort: seen ?? (await configuredEffort($)),
    ctxTokens: usage.context.tokens ?? null,
    ctxWindow: usage.context.window,
    ctxPercent: usage.context.percent ?? null,
    costUsd: usage.cost?.usd ?? null,
    turns,
    startedAt: usage.startedAt,
    limit5h: limit('five_hour'),
    limit7d: limit('seven_day'),
    agents: agents.filter(a => a.status === 'pending' || a.status === 'running' || a.status === 'waiting').length,
  }
  await update($, snapAtom, () => snap)
}

async function safeRefresh($: EngineInterface): Promise<void> {
  try {
    await refresh($)
  } catch (err) {
    $.ui.log(`pixelbar: refresh failed: ${String(err)}`, { to: 'debug' })
  }
}

// ── The character's moods and the timer that animates them ───────────────

const SLEEP_AFTER_MS = 5 * 60_000
const HAPPY_MS = 2_500

const mood = {
  isWorking: false,
  happyUntil: 0,
  lastActive: 0,
  frame: 0,
  ticker: null as Timer | null,
  dozer: null as Timer | null,
}

/** Redraws every `ms` while there is something to animate; stops itself after. */
function animate($: EngineInterface, ms: number): void {
  mood.ticker?.cancel()
  mood.ticker = $.clock.every(ms, () => {
    mood.frame += 1
    $.ui.invalidate('ui.render')
    void stopWhenStill($)
  })
}

async function stopWhenStill($: EngineInterface): Promise<void> {
  const now = await $.clock.now()
  const isAsleep = now - mood.lastActive >= SLEEP_AFTER_MS
  if (!mood.isWorking && now > mood.happyUntil && !isAsleep) {
    mood.ticker?.cancel()
    mood.ticker = null
  }
}

/** After a quiet spell the character dozes off; a slow tick drifts its z's. */
function scheduleSleep($: EngineInterface): void {
  mood.dozer?.cancel()
  mood.dozer = $.clock.after(SLEEP_AFTER_MS, () => animate($, 900))
}

function poseAt(now: number, snap: Snapshot): Pose {
  const isAsleep = !mood.isWorking && mood.lastActive > 0 && now - mood.lastActive >= SLEEP_AFTER_MS
  const isPanicked = (snap.ctxPercent ?? 0) >= 80
  const m: Mood = isAsleep
    ? 'sleep'
    : now < mood.happyUntil
      ? 'happy'
      : isPanicked
        ? 'panic'
        : mood.isWorking
          ? 'walk'
          : 'idle'
  return { mood: m, frame: mood.frame }
}

// ── Hooks ────────────────────────────────────────────────────────────────

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

/**
 * The permission mode the MODE tile names. Nothing tells a mod the mode a
 * session starts in, so it starts as a guess, the settings' `defaultMode`,
 * and is corrected by the hint (see `nextMode`) and by each prompt.
 */
let mode = 'default'
let leaving: string | null = null

function noteMode($: EngineInterface, seen: string | null | undefined): void {
  if (seen && seen !== mode) {
    mode = seen
    leaving = null
    $.ui.invalidate('ui.render')
  }
}

async function guessMode($: EngineInterface): Promise<void> {
  const perms = (await $.settings.read({ key: 'permissions' }).catch(() => undefined)) as { defaultMode?: unknown } | undefined
  mode = typeof perms?.defaultMode === 'string' ? perms.defaultMode : 'default'
  leaving = null
}

/** The order shift+tab steps through the modes. */
const CYCLE_ORDER = ['default', 'acceptEdits', 'plan', 'auto', 'bypassPermissions']

export type ModeState = {
  mode: string
  /** The mode a shift+tab is leaving, between its two hints. */
  leaving: string | null
}

/**
 * The mode after this hint (measured on the terminal, build 2.1.308). A
 * shift+tab hands the hint the phrase of the mode it LEAVES for a moment
 * (`plan mode on (shift+tab to cycle)` on the way to auto), then only the
 * cycle reminder, which stays while any mode but the default is on. The idle
 * hint of the default mode has neither (`? for shortcuts`). While Claude
 * works or a draft is typed the hint says other things, so the mode is kept.
 */
export function nextMode(s: ModeState, hint: HintRead, isBusy: boolean): ModeState {
  if (hint.mode) return { mode: s.mode, leaving: hint.mode }
  if (!hint.hasPill) return isBusy ? s : { mode: 'default', leaving: null }
  if (s.leaving) return { mode: CYCLE_ORDER[CYCLE_ORDER.indexOf(s.leaving) + 1] ?? 'unknown', leaving: null }
  return { mode: s.mode === 'default' ? 'unknown' : s.mode, leaving: null }
}

export const register: Register = on => {
  let poll: Timer | null = null

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'pixelbar-palette',
      description: 'Switch the pixelbar strip color palette (no name: the next one)',
      argumentHint: '[name | list]',
      immediate: true,
    })
    await $.command.register({
      name: 'pixelbar-sections',
      description: 'Show or hide pixelbar sections (no args: list them)',
      argumentHint: '[section ... | on <s> | off <s> | all | reset]',
      immediate: true,
    })
    const saved = await $.store.get('palette')
    if (typeof saved === 'string' && findPalette(saved)) await update($, paletteAtom, () => saved)
    await guessMode($)
    const hidden = await $.store.get('hidden')
    if (Array.isArray(hidden)) await update($, hiddenAtom, () => hidden.filter((h): h is string => typeof h === 'string'))

    mood.lastActive = await $.clock.now()
    scheduleSleep($)
    await safeRefresh($)
    // Catches branch switches and edits made outside Claude.
    poll?.cancel()
    poll = $.clock.every(15_000, () => void safeRefresh($))
    return started
  })

  // Each prompt's classic hook input names the mode it was sent in.
  on('classic.UserPromptSubmit', async ($, e, next) => {
    noteMode($, e.permission_mode)
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    mood.lastActive = await $.clock.now()
    mood.dozer?.cancel()
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      mood.isWorking = true
      mood.lastActive = await $.clock.now()
      mood.dozer?.cancel()
      animate($, 350)
    }
    return next(e)
  })

  // turn.step streams, so its hook is a generator that passes the chunks on.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined && e.effort !== undefined) {
      const effort = String(e.effort)
      if ((await read($, effortAtom)) !== effort) {
        await update($, effortAtom, () => effort)
        void safeRefresh($)
      }
    }
    return yield* next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      const now = await $.clock.now()
      mood.isWorking = false
      mood.lastActive = now
      mood.happyUntil = e.isAborted ? 0 : now + HAPPY_MS
      animate($, 350)
      scheduleSleep($)

      await update($, countersAtom, c => ({ ...(c ?? NO_COUNTS), lastTurnMs: e.durationMs }))
      const u = e.usage
      if (u) {
        const turn: Tokens = {
          input: u.input_tokens,
          output: u.output_tokens,
          cacheRead: u.cache_read_input_tokens,
          cacheWrite: u.cache_creation_input_tokens,
        }
        await update($, lastAtom, () => turn)
        await update($, totalAtom, t => ({
          input: (t ?? ZERO).input + turn.input,
          output: (t ?? ZERO).output + turn.output,
          cacheRead: (t ?? ZERO).cacheRead + turn.cacheRead,
          cacheWrite: (t ?? ZERO).cacheWrite + turn.cacheWrite,
        }))
        const spent = turn.input + turn.cacheRead + turn.cacheWrite + turn.output
        await update($, historyAtom, h => [...(h ?? []), spent].slice(-HISTORY_LEN))
      }
      await safeRefresh($)
    }
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const isEdit = EDIT_TOOLS.has(e.tool)
    await update($, countersAtom, c => {
      const was = c ?? NO_COUNTS
      return { ...was, tools: was.tools + 1, edits: was.edits + (isEdit ? 1 : 0) }
    })
    return next(e)
  })

  on('session.compact', async ($, e, next) => {
    const done = await next(e)
    await update($, countersAtom, c => ({ ...(c ?? NO_COUNTS), compacts: (c ?? NO_COUNTS).compacts + 1 }))
    return done
  })

  on('session.measure', async ($, e, next) => {
    await safeRefresh($)
    return next(e)
  })

  on('command.run', { command: 'pixelbar-palette' }, async ($, e) => {
    const arg = (e.args ?? '').trim()
    const current = (await read($, paletteAtom)) ?? 'gameboy'
    const at = Math.max(0, PALETTES.findIndex(p => p.id === current))
    const list = PALETTES.map((p, i) => `${i === at ? '>' : ' '} ${p.id.padEnd(11)} ${p.name}`).join('\n')

    if (arg === 'list') return { text: `Palettes (/pixelbar-palette <name> to pick, /pixelbar-palette for the next):\n${list}` }

    const chosen = arg ? findPalette(arg) : PALETTES[(at + 1) % PALETTES.length]
    if (!chosen) return { text: `No palette "${arg}". Pick one of:\n${list}` }

    await update($, paletteAtom, () => chosen.id)
    await $.store.set('palette', chosen.id)
    return { text: `palette ${chosen.name} (${PALETTES.indexOf(chosen) + 1}/${PALETTES.length})` }
  })

  on('command.run', { command: 'pixelbar-sections' }, async ($, e) => {
    const words = (e.args ?? '').trim().split(/[\s,]+/).filter(Boolean)
    let hidden = new Set((await read($, hiddenAtom)) ?? DEFAULT_HIDDEN)
    const unknown: string[] = []

    const verb = words[0]?.toLowerCase()
    if (verb === 'reset') {
      hidden = new Set(DEFAULT_HIDDEN)
    } else if (verb === 'all') {
      hidden = new Set()
    } else if (verb === 'on' || verb === 'off' || verb === 'show' || verb === 'hide') {
      for (const w of words.slice(1)) {
        const id = findSection(w)
        if (!id) unknown.push(w)
        else if (verb === 'off' || verb === 'hide') hidden.add(id)
        else hidden.delete(id)
      }
    } else {
      // Bare names toggle.
      for (const w of words) {
        const id = findSection(w)
        if (!id) unknown.push(w)
        else if (hidden.has(id)) hidden.delete(id)
        else hidden.add(id)
      }
    }

    if (words.length) {
      const list = [...hidden]
      await update($, hiddenAtom, () => list)
      await $.store.set('hidden', list)
    }

    const row = (line: number) =>
      SECTIONS.filter(s => s.line === line)
        .map(s => `  [${hidden.has(s.id) ? ' ' : 'x'}] ${s.id.padEnd(9)} ${s.about}`)
        .join('\n')
    const head = unknown.length ? `Unknown section: ${unknown.join(', ')}\n` : ''
    return {
      text:
        `${head}Project:\n${row(1)}\nClaude and session:\n${row(2)}\n` +
        'Toggle: /pixelbar-sections <name> ...   Force: on|off <name> ...   Everything: all   Defaults: reset',
    }
  })

  // The strip replaces the dim hint line under the prompt, the engine's
  // mode pill included, carrying the engine's hint text near its right end.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || !e.viewport) return next(e)
    const snap = await read($, snapAtom)
    if (!snap) return next(e)

    const hint = readHint(e.props.tail ? `${e.props.hint} ${e.props.tail}` : e.props.hint)
    ;({ mode, leaving } = nextMode({ mode, leaving }, hint, e.props.isWorking || e.props.isDraft))
    const now = await $.clock.now()
    const canvas = paint({
      snap,
      total: (await read($, totalAtom)) ?? ZERO,
      history: (await read($, historyAtom)) ?? [],
      counters: (await read($, countersAtom)) ?? NO_COUNTS,
      hint,
      mode,
      pose: poseAt(now, snap),
      columns: e.viewport.columns,
      now,
      palette: findPalette((await read($, paletteAtom)) ?? '') ?? PALETTES[0]!,
      hidden: (await read($, hiddenAtom)) ?? DEFAULT_HIDDEN,
    })
    const { Box, Raster } = $.ui.resolve(e)

    // The engine seats this site right of its pill and wraps the pill's
    // ` · ` onto a row of its own once the site's content fills the row. So
    // the site holds one cell, and the strip is drawn absolute from it,
    // reaching back over the pill to the row's left margin.
    return (
      <Box width={1} height={canvas.h}>
        <Box position="absolute" left={-pillOffset(mode)} top={0}>
          <Raster key="pixelbar" columns={canvas.w} rows={canvas.h} cells={canvas.base64()} />
        </Box>
      </Box>
    )
  })
}
