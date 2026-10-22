import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Git, Snapshot, Tokens } from '../types'

// ── State ────────────────────────────────────────────────────────────────

const ZERO: Tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

const snapAtom = atom({ plugin: 'pixelbar', key: 'snap' } as const, null)
const effortAtom = atom({ plugin: 'pixelbar', key: 'effort' } as const, null)
const lastAtom = atom({ plugin: 'pixelbar', key: 'last' } as const, null)
const totalAtom = atom({ plugin: 'pixelbar', key: 'total' } as const, ZERO)

// ── Palette (PICO-8) ─────────────────────────────────────────────────────

const NAVY = '#1D2B53'
const CREAM = '#FFF1E8'
const BLUE = '#29ADFF'
const GREEN = '#00E436'
const PINK = '#FF77A8'
const ORANGE = '#FFA300'
const YELLOW = '#FFEC27'
const RED = '#FF004D'
const GREY = '#C2C3C7'
const PEACH = '#FFCCAA'
const LAVENDER = '#83769C'

const LABEL_BG = NAVY
const LABEL_INK = CREAM
const INK = NAVY

/** The same hue, darker: the bottom bevel of each pixel tile. */
function shade(hex: string, factor = 0.55): string {
  const n = Number.parseInt(hex.slice(1), 16)
  const ch = (shift: number) =>
    Math.round(((n >> shift) & 0xff) * factor)
      .toString(16)
      .padStart(2, '0')
  return `#${ch(16)}${ch(8)}${ch(0)}`
}

// ── Sprite: an 8×6 invader drawn with half blocks, two frames ────────────
// One terminal cell holds two vertical pixels: '▀' painted in the top
// pixel's color over a background of the bottom pixel's.

const SPRITE_W = 8
const FRAMES = [
  ['..b..b..', '.bbbbbb.', 'bbwbbwbb', 'bbbbbbbb', '.b.bb.b.', 'b......b'],
  ['..b..b..', '.bbbbbb.', 'bbwbbwbb', 'bbbbbbbb', '.b.bb.b.', '.b....b.'],
] as const

// ── Cells and rows ───────────────────────────────────────────────────────

type Cell = { text: string; color?: string; bg?: string; bold?: boolean }
type Row = Cell[]

function pixelCell(top: string | null, bottom: string | null): Cell {
  if (top && bottom) {
    return top === bottom ? { text: '█', color: top } : { text: '▀', color: top, bg: bottom }
  }
  if (top) return { text: '▀', color: top }
  if (bottom) return { text: '▄', color: bottom }
  return { text: ' ' }
}

function spriteRows(frame: number, body: string): Row[] {
  const grid = FRAMES[frame % FRAMES.length] ?? FRAMES[0]
  const colorOf = (ch: string | undefined) =>
    ch === 'b' ? body : ch === 'w' ? CREAM : null
  const rows: Row[] = []
  for (let y = 0; y < grid.length; y += 2) {
    const row: Row = []
    for (let x = 0; x < SPRITE_W; x++) {
      row.push(pixelCell(colorOf(grid[y]?.[x]), colorOf(grid[y + 1]?.[x])))
    }
    rows.push(row)
  }
  return rows
}

/** Joins neighbouring cells of the same style so the tree stays small. */
function merge(row: Row): Row {
  const out: Row = []
  for (const cell of row) {
    const prev = out[out.length - 1]
    if (prev && prev.color === cell.color && prev.bg === cell.bg && prev.bold === cell.bold) {
      prev.text += cell.text
    } else {
      out.push({ ...cell })
    }
  }
  return out
}

// ── Segments: one pixel tile each ────────────────────────────────────────

type Run = { text: string; color?: string; bold?: boolean }
type Seg = {
  label: string
  runs: Run[]
  bg: string
  ink?: string
  /** 1 is kept longest when the terminal is narrow. */
  priority: number
}

const labelWidth = (s: Seg) => s.label.length + 2
const valueWidth = (s: Seg) => s.runs.reduce((n, r) => n + r.text.length, 0) + 2
const segWidth = (s: Seg) => labelWidth(s) + valueWidth(s)

/** The three rows of one tile: lit top edge, face, shaded bottom edge. */
function tile(s: Seg): [Row, Row, Row] {
  const lw = labelWidth(s)
  const vw = valueWidth(s)
  const ink = s.ink ?? INK
  const top: Row = [
    { text: '▄'.repeat(lw), color: LABEL_BG },
    { text: '▄'.repeat(vw), color: s.bg },
  ]
  const face: Row = [
    { text: ` ${s.label} `, color: LABEL_INK, bg: LABEL_BG, bold: true },
    { text: ' ', bg: s.bg },
    ...s.runs.map(r => ({ text: r.text, color: r.color ?? ink, bg: s.bg, bold: r.bold ?? true })),
    { text: ' ', bg: s.bg },
  ]
  const bottom: Row = [
    { text: '▀'.repeat(lw), color: shade(LABEL_BG, 0.5) },
    { text: '▀'.repeat(vw), color: shade(s.bg) },
  ]
  return [top, face, bottom]
}

// ── Formatting ───────────────────────────────────────────────────────────

function compact(n: number): string {
  if (n < 1000) return `${n}`
  const [div, unit] = n < 1e6 ? [1e3, 'K'] : [1e6, 'M']
  const v = n / div
  return `${(v < 10 ? v.toFixed(1) : v.toFixed(0)).replace(/\.0$/, '')}${unit}`
}

function clip(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}~`
}

function modelName(raw: string): string {
  return raw
    .replace(/^claude-/i, '')
    .replace(/\[1m\]$/i, ' 1M')
    .replace(/-(\d+)-(\d+)$/, ' $1.$2')
    .replace(/-/g, ' ')
    .toUpperCase()
}

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']

function effortRuns(effort: string | null): Run[] {
  if (effort === null) return [{ text: 'AUTO' }]
  const level = EFFORTS.indexOf(effort)
  if (level < 0) return [{ text: effort.toUpperCase() }]
  return [
    { text: '■'.repeat(level + 1), color: RED },
    { text: '□'.repeat(EFFORTS.length - level - 1) },
    { text: ` ${effort.toUpperCase()}` },
  ]
}

function contextRuns(snap: Snapshot): Run[] {
  const pct = snap.ctxPercent ?? 0
  const cells = 10
  const filled = Math.min(cells, Math.round((pct / 100) * cells))
  const hot = pct >= 80
  return [
    { text: '█'.repeat(filled), color: hot ? RED : INK },
    { text: '░'.repeat(cells - filled), color: INK },
    { text: ` ${pct}%` },
    { text: ` ${compact(snap.ctxTokens ?? 0)}/${compact(snap.ctxWindow)}`, bold: false },
  ]
}

function segments(snap: Snapshot, last: Tokens | null, total: Tokens): Seg[] {
  const segs: Seg[] = [{ label: 'DIR', runs: [{ text: clip(snap.dir, 28) }], bg: BLUE, priority: 1 }]

  if (snap.git) {
    const g = snap.git
    const runs: Run[] = [{ text: clip(g.branch, 28) }]
    if (g.dirty) runs.push({ text: ` *${g.dirty}`, color: RED })
    if (g.ahead) runs.push({ text: ` ^${g.ahead}` })
    if (g.behind) runs.push({ text: ` v${g.behind}` })
    segs.push({ label: 'GIT', runs, bg: GREEN, priority: 1 })
  }

  segs.push(
    { label: 'MODEL', runs: [{ text: clip(modelName(snap.model), 20) }], bg: PINK, priority: 1 },
    { label: 'EFFORT', runs: effortRuns(snap.effort), bg: ORANGE, priority: 2 },
    { label: 'CTX', runs: contextRuns(snap), bg: YELLOW, priority: 1 },
  )

  if (last) {
    segs.push({
      label: 'TOKENS',
      runs: [
        { text: `IN ${compact(last.input + last.cacheRead + last.cacheWrite)}` },
        { text: ` OUT ${compact(last.output)}` },
        { text: ` CACHE ${compact(last.cacheRead)}`, bold: false },
      ],
      bg: GREY,
      priority: 3,
    })
  }

  const session: Run[] = [{ text: `${snap.turns} TURNS` }]
  if (total.output) session.push({ text: ` OUT ${compact(total.output)}`, bold: false })
  if (snap.costUsd !== null) session.push({ text: ` $${snap.costUsd.toFixed(2)}` })
  segs.push({ label: 'SESSION', runs: session, bg: PEACH, priority: 2 })

  if (snap.limit5h !== null) {
    segs.push({
      label: '5H',
      runs: [{ text: `${Math.round(snap.limit5h)}%` }],
      bg: LAVENDER,
      ink: CREAM,
      priority: 4,
    })
  }

  return segs
}

/** Greedy line-fill: which segments go on which line of tiles. */
function pack(segs: Seg[], width: number): Seg[][] {
  const lines: Seg[][] = []
  let line: Seg[] = []
  let used = 0
  for (const s of segs) {
    const w = segWidth(s) + (line.length ? 1 : 0)
    if (line.length && used + w > width) {
      lines.push(line)
      line = []
      used = 0
    }
    used += segWidth(s) + (line.length ? 1 : 0)
    line.push(s)
  }
  if (line.length) lines.push(line)
  return lines
}

/** Drops the least important tiles until the rest fit in `maxLines` lines. */
function fit(all: Seg[], width: number, maxLines: number): Seg[][] {
  let segs = all
  let lines = pack(segs, width)
  while (lines.length > maxLines && segs.length > 1) {
    const worst = segs.reduce((a, b) => (b.priority >= a.priority ? b : a))
    segs = segs.filter(s => s !== worst)
    lines = pack(segs, width)
  }
  return lines
}

function layout(snap: Snapshot, last: Tokens | null, total: Tokens, frame: number, working: boolean, columns: number, maxRows: number): Row[] {
  const gutter = SPRITE_W + 1
  const maxLines = Math.max(1, Math.min(2, Math.floor(maxRows / 3)))
  const lines = fit(segments(snap, last, total), Math.max(10, columns - gutter), maxLines)
  const sprite = spriteRows(working ? frame : 0, working ? ORANGE : GREEN)

  const rows: Row[] = []
  lines.forEach((line, i) => {
    const out: [Row, Row, Row] = [[], [], []]
    for (let r = 0; r < 3; r++) {
      out[r]!.push(...(i === 0 ? sprite[r] ?? [] : [{ text: ' '.repeat(SPRITE_W) }]), { text: ' ' })
    }
    line.forEach((s, j) => {
      const t = tile(s)
      for (let r = 0; r < 3; r++) {
        if (j) out[r]!.push({ text: ' ' })
        out[r]!.push(...t[r]!)
      }
    })
    rows.push(...out.map(merge))
  })
  return rows
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
      }
      await safeRefresh($)
    }
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await safeRefresh($)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const snap = await read($, snapAtom)
    if (!snap) return next(e)
    const last = (await read($, lastAtom)) ?? null
    const total = (await read($, totalAtom)) ?? ZERO

    const rows = layout(snap, last, total, frame, e.props.isWorking, e.props.bodyColumns, e.props.maxRows)
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        {rows.map(row => (
          <Box flexDirection="row">
            {row.map(c => (
              <Text
                {...(c.color ? { color: c.color } : {})}
                {...(c.bg ? { backgroundColor: c.bg } : {})}
                {...(c.bold ? { bold: true } : {})}
                wrap="truncate-end"
              >
                {c.text}
              </Text>
            ))}
          </Box>
        ))}
      </Box>
    )
  })
}
