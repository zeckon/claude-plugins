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
const hiddenAtom = atom({ plugin: 'pixelbar', key: 'hidden' } as const, [])

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
let C2 = 0 // tile ground, separator
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
  { id: 'mode', line: 2, about: 'MODE DEFAULT tile' },
  { id: 'model', line: 2, about: 'model' },
  { id: 'effort', line: 2, about: 'reasoning effort' },
  { id: 'ctx', line: 2, about: 'context window gauge' },
  { id: 'cache', line: 2, about: 'cache hit rate' },
  { id: 'tok', line: 2, about: 'tokens-per-turn sparkline' },
  { id: '5h', line: 2, about: 'five-hour usage limit' },
  { id: '7d', line: 2, about: 'seven-day usage limit' },
  { id: 'session', line: 2, about: 'turns, tokens, cost' },
  { id: 'time', line: 2, about: 'session clock' },
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

const ROWS = 3 // project line, separator, Claude line

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

// ── The character: 8×6 pixels in half blocks, spanning all three rows ────
// b body · e eye (light) · c closed eye (dark) · . empty

export type Mood = 'idle' | 'walk' | 'happy' | 'panic' | 'sleep'
export type Pose = { mood: Mood; frame: number; isFlashing: boolean }

const FRAMES: Record<Mood, readonly (readonly string[])[]> = {
  idle: [['..b..b..', '.bbbbbb.', 'bbebbebb', 'bbbbbbbb', '.b.bb.b.', 'b......b']],
  walk: [
    ['..b..b..', '.bbbbbb.', 'bbebbebb', 'bbbbbbbb', '.b.bb.b.', 'b......b'],
    ['..b..b..', '.bbbbbb.', 'bbebbebb', 'bbbbbbbb', '.b.bb.b.', '.b....b.'],
  ],
  // Arms up, then a hop.
  happy: [
    ['b......b', 'b.bbbb.b', 'bbebbebb', '.bbbbbb.', '..b..b..', '.b....b.'],
    ['..b..b..', '.bbbbbb.', 'bbebbebb', 'bbbbbbbb', '.b.bb.b.', 'b......b'],
  ],
  // Wide eyes, flailing legs; drawn shaking left and right.
  panic: [
    ['b.b..b.b', '.bbbbbb.', 'beebbeeb', 'bbbbbbbb', 'b.b..b.b', '.b....b.'],
    ['.b.bb.b.', '.bbbbbb.', 'beebbeeb', 'bbbbbbbb', '.b.bb.b.', 'b......b'],
  ],
  // Antennae down, eyes shut, sitting.
  sleep: [['........', '.bbbbbb.', 'bbcbbcbb', 'bbbbbbbb', 'bbbbbbbb', '.b....b.']],
}

const CHAR_X = 1
const CHAR_W = 8
const CONTENT_X = CHAR_X + CHAR_W + 3 // two columns for the sleeping z's, then a gap

function bodyColor(mood: Mood): number {
  return mood === 'panic' ? ALERT : mood === 'walk' || mood === 'happy' ? ACCENT : mood === 'sleep' ? C3 : C4
}

function drawCharacter(c: Canvas, pose: Pose): void {
  const frames = FRAMES[pose.mood]
  const grid = frames[pose.frame % frames.length] ?? frames[0]!
  const body = bodyColor(pose.mood)
  const colorOf = (ch: string | undefined) =>
    ch === 'b' ? body : ch === 'e' ? LIGHT : ch === 'c' ? C2 : null
  const shake = pose.mood === 'panic' && pose.frame % 2 ? 1 : 0
  for (let row = 0; row < ROWS; row++) {
    for (let x = 0; x < CHAR_W; x++) {
      const top = colorOf(grid[row * 2]?.[x])
      const bottom = colorOf(grid[row * 2 + 1]?.[x])
      const at = CHAR_X + x + shake
      if (top !== null && bottom !== null) c.put(at, row, top === bottom ? '█' : '▀', top, bottom)
      else if (top !== null) c.put(at, row, '▀', top)
      else if (bottom !== null) c.put(at, row, '▄', bottom)
    }
  }
  if (pose.mood === 'happy') {
    // Sparkles around the raised arms.
    const on = pose.frame % 2 === 0
    c.put(CHAR_X + CHAR_W, 0, on ? '*' : '+', LIGHT)
    c.put(CHAR_X + CHAR_W + 1, 1, on ? '+' : '*', ACCENT)
  }
  if (pose.mood === 'sleep') {
    // z's drift up beside the head.
    const step = pose.frame % 3
    c.put(CHAR_X + CHAR_W, 1, 'z', step >= 0 ? C4 : BASE)
    if (step >= 1) c.put(CHAR_X + CHAR_W + 1, 0, 'Z', C4)
  }
}

// ── Items: what a line is made of, laid out left to right ────────────────

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

function effortValue(effort: string | null): string {
  if (effort === null) return 'AUTO'
  const level = EFFORTS.indexOf(effort)
  const word = effort.toUpperCase()
  return level < 0 ? word : `${'█'.repeat(level + 1)}${'░'.repeat(EFFORTS.length - level - 1)} ${word}`
}

function projectItems(snap: Snapshot, now: number): Item[] {
  const out: Item[] = [tile('dir', 'DIR', clip(snap.dir, 24), 1)]
  const g = snap.git
  if (!g) return out
  let branch = clip(g.branch, 28)
  if (g.dirty) branch += ` *${g.dirty}`
  if (g.ahead) branch += ` ^${g.ahead}`
  if (g.behind) branch += ` v${g.behind}`
  out.push(tile('git', 'GIT', branch, 1))
  if (g.added || g.removed) out.push(tile('diff', 'DIFF', `+${g.added} -${g.removed}`, 2))
  if (g.commitAt !== null) {
    out.push(tile('commit', 'COMMIT', `${duration(now - g.commitAt)} ${clip(g.commitSubject, 36)}`, 3))
  }
  if (g.stashes) out.push(tile('stash', 'STASH', `${g.stashes}`, 4))
  return out
}

function claudeItems(
  snap: Snapshot,
  total: Tokens,
  history: number[],
  counters: Counters,
  pill: string | null,
  columns: number,
  now: number,
): Item[] {
  const out: (Item | null)[] = [
    pill ? null : tile('mode', 'MODE', 'DEFAULT', 1),
    tile('model', 'MODEL', clip(modelName(snap.model), 18), 2),
    tile('effort', 'EFFORT', effortValue(snap.effort), 2),
    gaugeItem('ctx', 'CTX', snap.ctxPercent ?? 0, Math.min(20, Math.max(6, Math.floor(columns * 0.08))), 80, 1,
      ` ${compact(snap.ctxTokens ?? 0)}/${compact(snap.ctxWindow)}`),
  ]
  const cacheBase = total.input + total.cacheRead + total.cacheWrite
  if (cacheBase) out.push(tile('cache', 'CACHE', `${Math.round((total.cacheRead / cacheBase) * 100)}%`, 4))
  out.push(sparkItem(history))
  if (snap.limit5h !== null) out.push(gaugeItem('5h', '5H', snap.limit5h, 6, 90, 4))
  if (snap.limit7d !== null) out.push(gaugeItem('7d', '7D', snap.limit7d, 6, 90, 5))

  let session = `${snap.turns}T`
  if (total.input + total.output) session += ` ${compact(total.input + total.output)}`
  if (snap.costUsd !== null) session += ` $${snap.costUsd.toFixed(2)}`
  out.push(tile('session', 'SESSION', session, 3))
  if (snap.startedAt) out.push(tile('time', 'TIME', duration(now - snap.startedAt), 3))
  if (counters.lastTurnMs !== null) out.push(tile('last', 'LAST', duration(counters.lastTurnMs), 4))
  if (snap.agents) out.push(tile('agents', 'AGENTS', `${snap.agents}`, 3, ACCENT))
  if (counters.tools) out.push(tile('tools', 'TOOLS', `${counters.tools}`, 5))
  if (counters.edits) out.push(tile('edits', 'EDITS', `${counters.edits}`, 4))
  if (counters.compacts) out.push(tile('compacts', 'CMP', `${counters.compacts}`, 5))
  return out.filter((i): i is Item => i !== null)
}

/**
 * Lays out one line from `x0`: drops the least important items (the rightmost
 * of the lowest rank) until the rest and `right` fit, draws them, puts `right`
 * at the right edge, and fills the gap with a faint pixel trail.
 */
function drawLine(c: Canvas, y: number, x0: number, all: Item[], right: Item | null): void {
  let list = right ? [...all, right] : all
  const width = (l: Item[]) => l.reduce((n, i) => n + i.width + 1, x0)
  while (list.length > 1 && width(list) > c.w) {
    const worst = list.reduce((a, b) => (b.priority >= a.priority ? b : a))
    list = list.filter(i => i !== worst)
  }
  let x = x0
  for (const item of list) {
    if (item === right) continue
    item.draw(c, x, y)
    x += item.width + 1
  }
  const shown = right && list.includes(right) ? right : null
  const end = shown ? c.w - shown.width - 1 : c.w
  for (let i = x; i < end; i++) c.put(i, y, '░', C1)
  shown?.draw(c, c.w - shown.width, y)
}

/** The rule between the lines: thin, with stepped ends; it flashes after a long turn. */
function drawSeparator(c: Canvas, y: number, x0: number, pose: Pose): void {
  const color = pose.isFlashing && pose.frame % 2 === 0 ? ACCENT : C2
  for (let x = x0; x < c.w; x++) c.put(x, y, '─', color)
  c.put(x0, y, '╶', color)
  c.put(c.w - 1, y, '╴', color)
}

// ── Mode: the engine's own mode pill ─────────────────────────────────────
//
// Outside the default mode the engine draws a pill (`⏵⏵ auto mode on`) at
// the left of the hint row, outside this site; the site's `hint` is only the
// rest (`(shift+tab to cycle)`). The pill's phrase reaches the hint for a
// moment as the mode changes, so it is remembered from there. While a pill
// shows, the strip leaves it room and draws no MODE tile of its own.

const PILL = /(auto mode|plan mode|accept edits|bypass permissions|don'?t ask(?: mode)?|manual mode) on/i
const CYCLE = /\(shift\+tab to cycle\)/i

export type HintRead = {
  /** The pill's phrase while one shows (`auto mode on`), else null: default mode. */
  pill: string | null
  /** A phrase this hint named, to remember for the next one. */
  seen: string | null
  /** The hint with the pill's words taken out. */
  rest: string
}

export function readHint(hint: string, remembered: string | null): HintRead {
  const text = ascii(hint)
  const named = PILL.exec(text)?.[0].toLowerCase() ?? null
  const seen = named?.startsWith('manual') ? null : named
  const pill = CYCLE.test(text) ? (seen ?? remembered ?? 'mode on') : null
  const rest = text
    .replace(PILL, ' ')
    .replace(CYCLE, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s|·-]+|[\s|·-]+$/g, '')
  return { pill, seen: named ? seen : remembered, rest }
}

/** Columns the engine's pill takes at the row's left: `⏵⏵ ` and a gap. */
export const pillWidth = (pill: string | null) => (pill ? pill.length + 4 : 0)

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
  pose: Pose
  columns: number
  now: number
  palette?: Palette
  hidden?: readonly string[]
}

/**
 * Paints the strip: the character on the left across all three rows; the
 * project line, a separator and the Claude line to its right. It fills what
 * the engine's pill leaves of `columns`, less the terminal's last column
 * (writing there can wrap the row).
 */
export function paint(p: PaintInput): Canvas {
  usePalette(p.palette ?? PALETTES[0]!)
  const c = new Canvas(Math.max(30, Math.min(512, p.columns - pillWidth(p.hint.pill) - 1)))
  const hidden = new Set(p.hidden ?? [])
  const visible = (items: Item[]) => items.filter(i => !hidden.has(i.id))

  drawCharacter(c, p.pose)

  const rest = p.hint.rest
  const hintItem: Item | null =
    rest && !hidden.has('hint')
      ? { id: 'hint', width: rest.length, priority: 2.5, draw: (cv, x, y) => cv.text(x, y, rest, C3) }
      : null

  drawLine(c, 0, CONTENT_X, visible(projectItems(p.snap, p.now)), null)
  drawSeparator(c, 1, CONTENT_X, p.pose)
  drawLine(c, 2, CONTENT_X, visible(claudeItems(p.snap, p.total, p.history, p.counters, p.hint.pill, c.w, p.now)), hintItem)
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
const FLASH_AFTER_TURN_MS = 60_000

const mood = {
  isWorking: false,
  happyUntil: 0,
  flashUntil: 0,
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
  if (!mood.isWorking && now > mood.happyUntil && now > mood.flashUntil && !isAsleep) {
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
  return { mood: m, frame: mood.frame, isFlashing: now < mood.flashUntil }
}

// ── Hooks ────────────────────────────────────────────────────────────────

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

export const register: Register = on => {
  let poll: Timer | null = null
  let pillPhrase: string | null = null

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
      argumentHint: '[section ... | on <s> | off <s> | reset]',
      immediate: true,
    })
    const saved = await $.store.get('palette')
    if (typeof saved === 'string' && findPalette(saved)) await update($, paletteAtom, () => saved)
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
      if (e.durationMs >= FLASH_AFTER_TURN_MS) mood.flashUntil = now + HAPPY_MS
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
    let hidden = new Set((await read($, hiddenAtom)) ?? [])
    const unknown: string[] = []

    const verb = words[0]?.toLowerCase()
    if (verb === 'reset' || verb === 'all') {
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
        `${head}Line 1 (project):\n${row(1)}\nLine 2 (Claude):\n${row(2)}\n` +
        'Toggle: /pixelbar-sections <name> ...   Force: on|off <name> ...   Show all: reset',
    }
  })

  // The strip replaces the dim hint line under the prompt, carrying the
  // engine's hint text at the right end of its second line.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || !e.viewport) return next(e)
    const snap = await read($, snapAtom)
    if (!snap) return next(e)

    const hint = readHint(e.props.tail ? `${e.props.hint} ${e.props.tail}` : e.props.hint, pillPhrase)
    pillPhrase = hint.seen
    const now = await $.clock.now()
    const canvas = paint({
      snap,
      total: (await read($, totalAtom)) ?? ZERO,
      history: (await read($, historyAtom)) ?? [],
      counters: (await read($, countersAtom)) ?? NO_COUNTS,
      hint,
      pose: poseAt(now, snap),
      columns: e.viewport.columns,
      now,
      palette: findPalette((await read($, paletteAtom)) ?? '') ?? PALETTES[0]!,
      hidden: (await read($, hiddenAtom)) ?? [],
    })
    const { Raster } = $.ui.resolve(e)

    return <Raster key="pixelbar" columns={canvas.w} rows={canvas.h} cells={canvas.base64()} />
  })
}
