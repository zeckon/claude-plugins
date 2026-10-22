import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Git, Snapshot, Tokens } from '../types'

// ── State ────────────────────────────────────────────────────────────────

const ZERO: Tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
const HISTORY_LEN = 24

const snapAtom = atom({ plugin: 'pixelbar', key: 'snap' } as const, null)
const effortAtom = atom({ plugin: 'pixelbar', key: 'effort' } as const, null)
const lastAtom = atom({ plugin: 'pixelbar', key: 'last' } as const, null)
const totalAtom = atom({ plugin: 'pixelbar', key: 'total' } as const, ZERO)
const historyAtom = atom({ plugin: 'pixelbar', key: 'history' } as const, [])
const paletteAtom = atom({ plugin: 'pixelbar', key: 'palette' } as const, 'gameboy')

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

/** The palette named by id or name, loosely: `game boy`, `GameBoy`, `matrix`. */
export function findPalette(query: string): Palette | undefined {
  const key = query.toLowerCase().replace(/[^a-z0-9]/g, '')
  return (
    PALETTES.find(p => p.id === key || p.name.toLowerCase().replace(/[^a-z0-9]/g, '') === key) ??
    PALETTES.find(p => p.id.startsWith(key))
  )
}

// The colors drawing reads; `usePalette` sets them before each paint.
let BASE = 0 // the strip's ground
let C1 = 0 // empty gauge cells, trail
let C2 = 0 // tile ground
let C3 = 0 // quiet text
let C4 = 0 // labels
let ACCENT = 0 // the walker, filled gauges
let LIGHT = 0 // values
let ALERT = 0 // context past 80%

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

// ── Canvas: one Raster row's cells ───────────────────────────────────────

/**
 * A Raster cell holds one printable width-1 character; anything else refuses
 * the whole tree. Text from outside (paths, branches, the engine's hint) is
 * cut down to printable ASCII.
 */
function ascii(s: string): string {
  return s.replace(/[^\x20-\x7e]+/g, ' ').replace(/\s+/g, ' ').trim()
}

class Canvas {
  readonly cells: Uint32Array
  readonly h = 1

  constructor(readonly w: number) {
    this.cells = new Uint32Array(w * 3)
    for (let i = 0; i < w; i++) this.cells.set([0x20, LIGHT, BASE], i * 3)
  }

  put(x: number, ch: string, fg: number, bg = BASE): void {
    if (x < 0 || x >= this.w) return
    this.cells.set([ch.codePointAt(0) ?? 0x20, fg, bg], x * 3)
  }

  /** Writes `s` from `x`, clipped at the edge; returns the column after it. */
  text(x: number, s: string, fg: number, bg = BASE): number {
    for (const ch of s) this.put(x++, ch, fg, bg)
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

// ── Items: what the row is made of, laid out left to right ───────────────

type Item = { width: number; priority: number; draw: (c: Canvas, x: number) => void }

/** The walker: 2 cells, 4×2 pixels in quarter blocks, legs out / legs in. */
const WALK = ['▛▜', '▜▛'] as const

function walker(frame: number, working: boolean): Item {
  const pose = WALK[working ? frame % WALK.length : 0] ?? WALK[0]
  return { width: 2, priority: 0, draw: (c, x) => c.text(x, pose, working ? ACCENT : C4) }
}

/** `▐ LABEL value ▌`: half-block edges give the tile a stepped pixel outline. */
function tile(label: string, value: string, priority: number, isStrong = false): Item {
  const bg = isStrong ? ACCENT : C2
  return {
    width: label.length + value.length + 5,
    priority,
    draw: (c, x) => {
      c.put(x++, '▐', bg)
      x = c.text(x, ` ${label} `, isStrong ? BASE : C4, bg)
      x = c.text(x, `${value} `, isStrong ? BASE : LIGHT, bg)
      c.put(x, '▌', bg)
    },
  }
}

function gauge(c: Canvas, x: number, width: number, pct: number, isHot: boolean): number {
  const filled = Math.round((Math.min(100, Math.max(0, pct)) / 100) * width)
  for (let i = 0; i < width; i++) {
    const t = i / Math.max(1, width - 1)
    c.put(x + i, '▆', i >= filled ? C1 : isHot ? ALERT : mix(C3, ACCENT, t))
  }
  return x + width
}

function contextItem(snap: Snapshot, columns: number): Item {
  const pct = snap.ctxPercent ?? 0
  const isHot = pct >= 80
  const text = ` ${pct}% ${compact(snap.ctxTokens ?? 0)}/${compact(snap.ctxWindow)}`
  const g = Math.min(24, Math.max(6, Math.floor(columns * 0.1)))
  return {
    width: 4 + g + text.length,
    priority: 1,
    draw: (c, x) => {
      x = c.text(x, 'CTX ', C4)
      x = gauge(c, x, g, pct, isHot)
      c.text(x, text, isHot ? ALERT : LIGHT)
    },
  }
}

const SPARKS = '▁▂▃▄▅▆▇█'

function sparkItem(history: number[]): Item | null {
  const spark = history.slice(-12)
  if (!spark.length) return null
  const max = Math.max(1, ...spark)
  return {
    width: 4 + spark.length,
    priority: 4,
    draw: (c, x) => {
      x = c.text(x, 'TOK ', C4)
      for (const v of spark) {
        const level = Math.min(SPARKS.length - 1, Math.floor((v / max) * (SPARKS.length - 1)))
        c.put(x++, SPARKS[level]!, mix(C3, LIGHT, level / (SPARKS.length - 1)))
      }
    },
  }
}

function limitItem(pct: number): Item {
  const text = ` ${Math.round(pct)}%`
  return {
    width: 3 + 6 + text.length,
    priority: 4,
    draw: (c, x) => {
      x = c.text(x, '5H ', C4)
      x = gauge(c, x, 6, pct, pct >= 90)
      c.text(x, text, LIGHT)
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

function items(snap: Snapshot, total: Tokens, history: number[], pill: string | null, frame: number, working: boolean, columns: number): Item[] {
  const out: (Item | null)[] = [
    walker(frame, working),
    pill ? null : tile('MODE', 'DEFAULT', 1),
    tile('DIR', clip(snap.dir, 24), 1),
  ]
  if (snap.git) {
    const g = snap.git
    let v = clip(g.branch, 28)
    if (g.dirty) v += ` *${g.dirty}`
    if (g.ahead) v += ` ^${g.ahead}`
    if (g.behind) v += ` v${g.behind}`
    out.push(tile('GIT', v, 1.5))
  }
  out.push(
    tile('MODEL', clip(modelName(snap.model), 18), 2),
    tile('EFFORT', effortValue(snap.effort), 2),
    contextItem(snap, columns),
    sparkItem(history),
    snap.limit5h !== null ? limitItem(snap.limit5h) : null,
  )
  let session = `${snap.turns}T`
  if (total.input + total.output) session += ` ${compact(total.input + total.output)}`
  if (snap.costUsd !== null) session += ` $${snap.costUsd.toFixed(2)}`
  out.push(tile('SESSION', session, 3))
  return out.filter((i): i is Item => i !== null)
}

// ── Formatting ───────────────────────────────────────────────────────────

function compact(n: number): string {
  if (n < 1000) return `${n}`
  const [div, unit] = n < 1e6 ? [1e3, 'K'] : [1e6, 'M']
  const v = n / div
  return `${(v < 10 ? v.toFixed(1) : v.toFixed(0)).replace(/\.0$/, '')}${unit}`
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

/**
 * Paints the whole strip: one row, filling what the pill leaves of `columns`,
 * less the terminal's last column (writing there can wrap the row).
 */
export function paint(
  snap: Snapshot,
  total: Tokens,
  history: number[],
  { pill, rest }: HintRead,
  frame: number,
  working: boolean,
  columns: number,
  palette: Palette = PALETTES[0]!,
): Canvas {
  usePalette(palette)
  const c = new Canvas(Math.max(20, Math.min(512, columns - pillWidth(pill) - 1)))

  // The engine's remaining hint is right-aligned; it competes for room like
  // any item, outranking the session tile and the small gauges.
  const hintItem: Item | null = rest
    ? { width: rest.length + 1, priority: 2.5, draw: c => c.text(c.w - rest.length - 1, rest, C3) }
    : null

  // Drop the least important items (the rightmost of the lowest rank) until the row fits.
  let list = items(snap, total, history, pill, frame, working, c.w)
  if (hintItem) list.push(hintItem)
  const width = (l: Item[]) => l.reduce((n, i) => n + i.width + 1, 1)
  while (list.length > 1 && width(list) > c.w) {
    const worst = list.reduce((a, b) => (b.priority >= a.priority ? b : a))
    list = list.filter(i => i !== worst)
  }

  let x = 1
  for (const item of list) {
    if (item === hintItem) continue
    item.draw(c, x)
    x += item.width + 1
  }

  // A faint pixel trail fills the gap before the hint.
  const shown = hintItem && list.includes(hintItem) ? hintItem : null
  const end = shown ? c.w - shown.width - 1 : c.w - 1
  for (let i = x; i < end; i++) c.put(i, '░', C1)
  shown?.draw(c, 0)
  return c
}

// ── Reading the session ──────────────────────────────────────────────────

async function readGit($: EngineInterface, cwd: string): Promise<Git | null> {
  try {
    const r = await $.process.run(['git', 'status', '--porcelain=v2', '--branch'], { cwd, timeoutMs: 5000 })
    if (r.exitCode !== 0) return null
    let head = ''
    let oid = ''
    let ahead = 0
    let behind = 0
    let dirty = 0
    for (const line of r.stdout.split('\n')) {
      if (line.startsWith('# branch.head ')) head = line.slice(14)
      else if (line.startsWith('# branch.oid ')) oid = line.slice(13)
      else if (line.startsWith('# branch.ab ')) {
        const m = /\+(\d+) -(\d+)/.exec(line)
        ahead = Number(m?.[1] ?? 0)
        behind = Number(m?.[2] ?? 0)
      } else if (line && !line.startsWith('#')) dirty++
    }
    return { branch: head === '(detached)' ? `@${oid.slice(0, 7)}` : head, dirty, ahead, behind }
  } catch {
    return null
  }
}

async function configuredEffort($: EngineInterface): Promise<string | null> {
  const fromSettings = await $.settings.read({ key: 'effortLevel' })
  if (typeof fromSettings === 'string') return fromSettings
  return (await $.env.get('CLAUDE_EFFORT')) ?? null
}

async function refresh($: EngineInterface): Promise<void> {
  const cwd = await $.session.cwd()
  const [model, usage, turns, git, seen] = await Promise.all([
    $.session.model(),
    $.session.usage(),
    $.session.turns(),
    readGit($, cwd),
    read($, effortAtom),
  ])
  const snap: Snapshot = {
    dir: cwd.split('/').filter(Boolean).pop() ?? cwd,
    git,
    model,
    effort: seen ?? (await configuredEffort($)),
    ctxTokens: usage.context.tokens ?? null,
    ctxWindow: usage.context.window,
    ctxPercent: usage.context.percent ?? null,
    costUsd: usage.cost?.usd ?? null,
    turns,
    limit5h: usage.rateLimits.find(l => l.kind === 'five_hour')?.percentUsed ?? null,
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

// ── Hooks ────────────────────────────────────────────────────────────────

export const register: Register = on => {
  let frame = 0
  let anim: Timer | null = null
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
    const saved = await $.store.get('palette')
    if (typeof saved === 'string' && findPalette(saved)) await update($, paletteAtom, () => saved)
    await safeRefresh($)
    // Catches branch switches and edits made outside Claude.
    poll?.cancel()
    poll = $.clock.every(15_000, () => void safeRefresh($))
    return started
  })

  on('turn.start', ($, e, next) => {
    if (e.agentId === undefined) {
      anim?.cancel()
      anim = $.clock.every(350, () => {
        frame += 1
        $.ui.invalidate('ui.render')
      })
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
      anim?.cancel()
      anim = null
      frame = 0
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

  on('command.run', { command: 'pixelbar-palette' }, async ($, e) => {
    const arg = (e.args ?? '').trim()
    const current = (await read($, paletteAtom)) ?? 'gameboy'
    const at = Math.max(0, PALETTES.findIndex(p => p.id === current))
    const list = PALETTES.map((p, i) => `${i === at ? '>' : ' '} ${p.id.padEnd(11)} ${p.name}`).join('\n')

    if (arg === 'list') return { text: `Palettes (/pixelbar-palette <name> to pick, /pixelbar-palette for the next):\n${list}` }

    const next = arg ? findPalette(arg) : PALETTES[(at + 1) % PALETTES.length]
    if (!next) return { text: `No palette "${arg}". Pick one of:\n${list}` }

    await update($, paletteAtom, () => next.id)
    await $.store.set('palette', next.id)
    const n = PALETTES.indexOf(next) + 1
    return { text: `palette ${next.name} (${n}/${PALETTES.length})` }
  })

  on('session.measure', async ($, e, next) => {
    await safeRefresh($)
    return next(e)
  })

  // The strip replaces the dim hint line under the prompt, carrying the
  // engine's hint text at its right end.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || !e.viewport) return next(e)
    const snap = await read($, snapAtom)
    if (!snap) return next(e)
    const total = (await read($, totalAtom)) ?? ZERO
    const history = (await read($, historyAtom)) ?? []

    const hint = readHint(e.props.tail ? `${e.props.hint} ${e.props.tail}` : e.props.hint, pillPhrase)
    pillPhrase = hint.seen
    const palette = findPalette((await read($, paletteAtom)) ?? '') ?? PALETTES[0]!
    const canvas = paint(snap, total, history, hint, frame, e.props.isWorking, e.viewport.columns, palette)
    const { Raster } = $.ui.resolve(e)

    return <Raster key="pixelbar" columns={canvas.w} rows={canvas.h} cells={canvas.base64()} />
  })
}
