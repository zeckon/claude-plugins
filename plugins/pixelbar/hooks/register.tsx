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

// ── Palette (PICO-8), as 0xRRGGBB ────────────────────────────────────────

const BASE = 0x111a33 // the strip's ground
const NAVY = 0x1d2b53
const CREAM = 0xfff1e8
const BLUE = 0x29adff
const GREEN = 0x00e436
const PINK = 0xff77a8
const ORANGE = 0xffa300
const YELLOW = 0xffec27
const RED = 0xff004d
const PEACH = 0xffccaa
const LAVENDER = 0x83769c
const DIM = 0x3a4466 // empty gauge cells, dither
const MUTED = 0x8b93b0 // the engine's hint text

function shade(c: number, f: number): number {
  const ch = (s: number) => Math.round(((c >> s) & 0xff) * f) << s
  return ch(16) | ch(8) | ch(0)
}

function mix(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 0xff) * (1 - t) + ((b >> s) & 0xff) * t) << s
  return ch(16) | ch(8) | ch(0)
}

/** Green → yellow → red along a gauge. */
function heat(t: number): number {
  return t < 0.5 ? mix(GREEN, YELLOW, t * 2) : mix(YELLOW, RED, (t - 0.5) * 2)
}

// ── Canvas: one Raster's cells ───────────────────────────────────────────

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

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.cells = new Uint32Array(w * h * 3)
    for (let i = 0; i < w * h; i++) this.cells.set([0x20, CREAM, BASE], i * 3)
  }

  put(x: number, y: number, ch: string, fg: number, bg: number): void {
    if (x < 0 || x >= this.w || y < 0 || y >= this.h) return
    this.cells.set([ch.codePointAt(0) ?? 0x20, fg, bg], (y * this.w + x) * 3)
  }

  /** Writes `s` from `x`, clipped at `limit`; returns the column after it. */
  text(x: number, y: number, s: string, fg: number, bg: number, limit = this.w): number {
    for (const ch of s) {
      if (x >= limit) break
      this.put(x++, y, ch, fg, bg)
    }
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

// ── Sprite: a 7×4 invader in half blocks, two frames ─────────────────────

const SPRITE_W = 7
const FRAMES = [
  ['..bbb..', '.bwbwb.', 'bbbbbbb', 'b.b.b.b'],
  ['..bbb..', '.bwbwb.', 'bbbbbbb', '.b.b.b.'],
] as const

function drawSprite(c: Canvas, x0: number, frame: number, body: number): void {
  const grid = FRAMES[frame % FRAMES.length] ?? FRAMES[0]
  const colorOf = (ch: string | undefined) => (ch === 'b' ? body : ch === 'w' ? CREAM : null)
  for (let row = 0; row < 2; row++) {
    for (let x = 0; x < SPRITE_W; x++) {
      const top = colorOf(grid[row * 2]?.[x])
      const bottom = colorOf(grid[row * 2 + 1]?.[x])
      if (top !== null && bottom !== null) c.put(x0 + x, row, '▀', top, bottom)
      else if (top !== null) c.put(x0 + x, row, '▀', top, BASE)
      else if (bottom !== null) c.put(x0 + x, row, '▄', bottom, BASE)
    }
  }
}

// ── Row 1: pixel tiles ───────────────────────────────────────────────────

type Tile = { label: string; value: string; color: number; ink?: number; priority: number }

/** `▐ LABEL  value ▌`: half-block edges give each tile a stepped pixel outline. */
const tileWidth = (t: Tile) => t.label.length + t.value.length + 6

function drawTile(c: Canvas, x: number, t: Tile): number {
  const labelBg = shade(t.color, 0.45)
  c.put(x++, 0, '▐', labelBg, BASE)
  x = c.text(x, 0, ` ${t.label} `, CREAM, labelBg)
  x = c.text(x, 0, ` ${t.value} `, t.ink ?? NAVY, t.color)
  c.put(x++, 0, '▌', t.color, BASE)
  return x
}

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']

function effortValue(effort: string | null): string {
  if (effort === null) return 'AUTO'
  const level = EFFORTS.indexOf(effort)
  const word = effort.toUpperCase()
  return level < 0 ? word : `${'█'.repeat(level + 1)}${'░'.repeat(EFFORTS.length - level - 1)} ${word}`
}

function tiles(snap: Snapshot, total: Tokens): Tile[] {
  const out: Tile[] = [{ label: 'DIR', value: clip(snap.dir, 24), color: BLUE, priority: 1 }]
  if (snap.git) {
    const g = snap.git
    let v = clip(g.branch, 28)
    if (g.dirty) v += ` *${g.dirty}`
    if (g.ahead) v += ` ^${g.ahead}`
    if (g.behind) v += ` v${g.behind}`
    out.push({ label: 'GIT', value: v, color: GREEN, priority: 1 })
  }
  out.push(
    { label: 'MODEL', value: clip(modelName(snap.model), 18), color: PINK, priority: 1 },
    { label: 'EFFORT', value: effortValue(snap.effort), color: ORANGE, priority: 2 },
  )
  let session = `${snap.turns} TURNS`
  if (total.input + total.output) session += ` ${compact(total.input + total.output)} TOK`
  if (snap.costUsd !== null) session += ` $${snap.costUsd.toFixed(2)}`
  out.push({ label: 'SESSION', value: session, color: PEACH, priority: 3 })
  return out
}

function drawTiles(c: Canvas, x0: number, all: Tile[]): void {
  // Drop the least important tiles until the rest fit.
  let list = all
  const width = (l: Tile[]) => l.reduce((n, t) => n + tileWidth(t) + 1, 0)
  while (list.length > 1 && x0 + width(list) > c.w) {
    const worst = list.reduce((a, b) => (b.priority >= a.priority ? b : a))
    list = list.filter(t => t !== worst)
  }
  let x = x0
  for (const t of list) x = drawTile(c, x, t) + 1
  // A dithered pixel trail fades out across the rest of the row.
  const DITHER = '▓▒░'
  for (let i = x; i < c.w; i++) {
    const t = (i - x) / Math.max(1, c.w - x - 1)
    c.put(i, 0, DITHER[Math.min(2, Math.floor(t * 3))]!, mix(DIM, BASE, t * 0.85), BASE)
  }
}

// ── Row 2: gauges and the engine's hint ──────────────────────────────────

const SPARKS = '▁▂▃▄▅▆▇█'

function drawGauge(c: Canvas, x: number, width: number, pct: number, colorAt: (t: number) => number): number {
  const filled = Math.round((Math.min(100, Math.max(0, pct)) / 100) * width)
  for (let i = 0; i < width; i++) {
    c.put(x + i, 1, '▆', i < filled ? colorAt(i / Math.max(1, width - 1)) : DIM, BASE)
  }
  return x + width
}

function drawRow2(c: Canvas, x0: number, snap: Snapshot, history: number[], hint: string): void {
  const hintText = ascii(hint)
  const ctxText = ` ${snap.ctxPercent ?? 0}% ${compact(snap.ctxTokens ?? 0)}/${compact(snap.ctxWindow)}`
  const avail = c.w - x0 - (hintText ? hintText.length + 2 : 0)

  // What fits, most important first: context gauge, sparkline, 5h gauge.
  const spark = history.slice(-Math.min(HISTORY_LEN, 16))
  const sparkW = spark.length ? 5 + spark.length + 1 : 0
  const limitW = snap.limit5h !== null ? 4 + 8 + 6 : 0
  const ctxFixed = 4 + ctxText.length + 2
  let gauge = Math.min(48, Math.max(8, Math.floor(avail * 0.4)))
  const showSpark = spark.length > 0 && ctxFixed + gauge + sparkW <= avail
  const showLimit = limitW > 0 && ctxFixed + gauge + sparkW + limitW <= avail
  gauge = Math.max(4, Math.min(gauge, avail - ctxFixed - (showSpark ? sparkW : 0) - (showLimit ? limitW : 0)))

  let x = c.text(x0, 1, 'CTX ', YELLOW, BASE)
  x = drawGauge(c, x, gauge, snap.ctxPercent ?? 0, heat)
  x = c.text(x, 1, ctxText, (snap.ctxPercent ?? 0) >= 80 ? RED : CREAM, BASE) + 2

  if (showSpark) {
    x = c.text(x, 1, 'TOK ', PINK, BASE)
    const max = Math.max(1, ...spark)
    for (const v of spark) {
      const level = Math.min(SPARKS.length - 1, Math.floor((v / max) * (SPARKS.length - 1)))
      c.put(x++, 1, SPARKS[level]!, mix(LAVENDER, PINK, level / (SPARKS.length - 1)), BASE)
    }
    x += 2
  }

  if (showLimit && snap.limit5h !== null) {
    x = c.text(x, 1, '5H ', LAVENDER, BASE)
    x = drawGauge(c, x, 8, snap.limit5h, () => LAVENDER)
    c.text(x, 1, ` ${Math.round(snap.limit5h)}%`, CREAM, BASE)
  }

  if (hintText) c.text(Math.max(x0, c.w - hintText.length - 1), 1, hintText, MUTED, BASE)
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

export function paint(
  snap: Snapshot,
  total: Tokens,
  history: number[],
  hint: string,
  frame: number,
  working: boolean,
  columns: number,
): Canvas {
  const c = new Canvas(Math.max(20, Math.min(512, columns)), 2)
  drawSprite(c, 1, working ? frame : 0, working ? ORANGE : GREEN)
  const x0 = SPRITE_W + 2
  drawTiles(c, x0, tiles(snap, total))
  drawRow2(c, x0, snap, history, hint)
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

  on('session.start', async ($, e, next) => {
    const started = await next(e)
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

    const hint = e.props.tail ? `${e.props.hint} ${e.props.tail}` : e.props.hint
    const canvas = paint(snap, total, history, hint, frame, e.props.isWorking, e.viewport.columns)
    const { Raster } = $.ui.resolve(e)

    return <Raster key="pixelbar" columns={canvas.w} rows={canvas.h} cells={canvas.base64()} />
  })
}
