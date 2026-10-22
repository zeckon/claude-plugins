import { describe, expect, mock, test } from 'claude-code/testing'

const HINT = (columns: number, hint = '? for shortcuts') =>
  ({
    plugin: 'pixelbar',
    component: 'PromptHint',
    surface: 'terminal',
    viewport: { columns, rows: 40 },
    props: { isDraft: false, isWorking: false, hint },
  }) as const

const GIT_STATUS = [
  '# branch.oid 1234567890abcdef',
  '# branch.head feat/pixelbar',
  '# branch.upstream origin/feat/pixelbar',
  '# branch.ab +2 -0',
  '1 .M N... 100644 100644 100644 aaa bbb hooks/register.tsx',
  '? tests/new.txt',
  '',
].join('\n')

// Stand-ins for the engine beneath the plugin: each `$` call answers `{ value }`.
function fakeSession(on: Parameters<Parameters<typeof test>[1]>[1]) {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/Users/zeckon/workspace/claude-plugins' }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.turns', () => ({ value: 7 }))
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { tokens: 84_000, window: 200_000, percent: 42 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 37 }],
      cost: { usd: 1.234 },
    },
  }))
  on('process.run', () => ({
    value: { exitCode: 0, stdout: GIT_STATUS, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('settings.read', () => ({ value: { effortLevel: 'high' } }))
  on('env.get', () => ({ value: undefined }))
  on('clock.every', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'pixelbar-palette' } }))
  mock.store(on)
}

/** The Raster's cells back as text rows, to read what was painted. */
function decode(raster: { props: Record<string, unknown> } | undefined): string[] {
  const { columns, rows, cells } = raster?.props as { columns: number; rows: number; cells: string }
  const bin = atob(cells)
  const words = new Uint32Array(Uint8Array.from(bin, ch => ch.charCodeAt(0)).buffer)
  const out: string[] = []
  for (let y = 0; y < rows; y++) {
    let line = ''
    for (let x = 0; x < columns; x++) line += String.fromCodePoint(words[(y * columns + x) * 3]!)
    out.push(line)
  }
  return out
}

type Mounted = { props: { columns: number; rows: number } }

// The hints below are what the engine handed the site in a real session.
/** The background color of the strip's first cell: the palette's ground. */
function ground(raster: { props: Record<string, unknown> } | undefined): number {
  const bin = atob((raster?.props as { cells: string }).cells)
  return new Uint32Array(Uint8Array.from(bin, ch => ch.charCodeAt(0)).buffer)[2]!
}

describe('pixelbar strip', () => {
  test('/pixelbar-palette cycles, picks by name, lists, and wraps around', async ($, on) => {
    fakeSession(on)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

    const strip = async () => {
      const ui = await $.ui.mount(HINT(120))
      const g = ground((await ui.find({ type: 'Raster' })) as never)
      await ui.unmount()
      return g
    }
    expect(await strip()).toBe(0x0f380f) // Game Boy by default

    expect((await $.command.run({ command: 'pixelbar-palette', args: '' })).text).toBe('palette Green phosphor (2/12)')
    expect(await strip()).toBe(0x0b120c)

    expect((await $.command.run({ command: 'pixelbar-palette', args: 'Virtual Boy' })).text).toContain('Virtual Boy (11/12)')
    expect(await strip()).toBe(0x0a0000)

    expect((await $.command.run({ command: 'pixelbar-palette', args: 'list' })).text).toContain('> virtualboy')
    expect((await $.command.run({ command: 'pixelbar-palette', args: 'nope' })).text).toContain('No palette "nope"')

    // The last palette wraps around to the first.
    await $.command.run({ command: 'pixelbar-palette', args: 'matrix' })
    expect(await strip()).toBe(0x000000)
    await $.command.run({ command: 'pixelbar-palette', args: '' })
    expect(await strip()).toBe(0x0f380f)
  })

  test('default mode: a MODE tile, the full width less the last column', async ($, on) => {
    fakeSession(on)
    await $.session.start({ cwd: '/Users/zeckon/workspace/claude-plugins', surface: 'terminal', isInteractive: true })

    const ui = await $.ui.mount(HINT(240, '? for shortcuts'))
    const raster = (await ui.find({ type: 'Raster' })) as never as Mounted
    const [row] = decode(raster as never)
    console.log(`\n${row}`)

    expect(raster.props.rows).toBe(1)
    expect(raster.props.columns).toBe(239)
    for (const words of ['\u259B\u259C', 'MODE DEFAULT', 'claude-plugins', 'feat/pixelbar *2 ^2', 'OPUS 5.5', '\u2588\u2588\u2588\u2591\u2591 HIGH', 'CTX', '42% 84K/200K', '5H', '37%', '7T $1.23', '? for shortcuts']) {
      expect(row).toContain(words)
    }
    await ui.unmount()
  })

  test('another mode: leaves room for the engine pill and draws no MODE tile', async ($, on) => {
    fakeSession(on)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

    // The phrase shows in the hint for a moment as the mode changes...
    const changing = await $.ui.mount(HINT(200, 'auto mode on (shift+tab to cycle)'))
    const first = (await changing.find({ type: 'Raster' })) as never as Mounted
    expect(first.props.columns).toBe(200 - 'auto mode on'.length - 4 - 1)
    await changing.unmount()

    // ...then the hint keeps only the rest, and the width is remembered.
    const settled = await $.ui.mount(HINT(200, '(shift+tab to cycle)'))
    const raster = (await settled.find({ type: 'Raster' })) as never as Mounted
    const [row] = decode(raster as never)
    console.log(`\n${' '.repeat(16)}${row}`)
    expect(raster.props.columns).toBe(183)
    expect(row).not.toContain('MODE DEFAULT')
    expect(row).not.toContain('shift+tab')
    await settled.unmount()

    // Back to default: no pill, so the tile and the width return.
    const back = await $.ui.mount(HINT(200, 'manual mode on \u00B7 ? for shortcuts'))
    const [backRow] = decode((await back.find({ type: 'Raster' })) as never)
    expect(backRow).toContain('MODE DEFAULT')
    expect(backRow).not.toContain('manual')
    await back.unmount()
  })

  test('fits a narrow terminal, keeping folder and context', async ($, on) => {
    fakeSession(on)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

    const ui = await $.ui.mount(HINT(90, '(shift+tab to cycle) \u00B7 esc to interrupt'))
    const [row] = decode((await ui.find({ type: 'Raster' })) as never)
    console.log(`\n${row}`)

    expect(row).toContain('claude-plugins')
    expect(row).toContain('42%')
    expect(row).not.toContain('SESSION')
    await ui.unmount()
  })

  test('keeps the engine hint off non-terminal surfaces', async ($, on) => {
    fakeSession(on)
    on('ui.render', ($, e) => {
      const { Text } = $.ui.resolve(e)
      return <Text>engine</Text>
    })
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

    const ui = await $.ui.mount({ ...HINT(120), surface: 'desktop' })
    expect(await ui.find({ type: 'Text', text: /engine/ })).toBeDefined()
    await ui.unmount()
  })
})
