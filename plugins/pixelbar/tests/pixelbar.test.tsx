import { describe, expect, mock, test } from 'claude-code/testing'

const NOW = 1_760_000_000_000

const HINT = (columns: number, hint = '? for shortcuts') =>
  ({
    plugin: 'pixelbar',
    component: 'PromptHint',
    surface: 'terminal',
    viewport: { columns, rows: 40 },
    props: { isDraft: false, isWorking: false, hint },
  }) as const

const GIT: Record<string, string> = {
  status: [
    '# branch.oid 1234567890abcdef',
    '# branch.head feat/pixelbar',
    '# branch.upstream origin/feat/pixelbar',
    '# branch.ab +2 -0',
    '1 .M N... 100644 100644 100644 aaa bbb hooks/register.tsx',
    '? tests/new.txt',
    '',
  ].join('\n'),
  diff: ' 2 files changed, 124 insertions(+), 37 deletions(-)\n',
  log: `${(NOW - 5 * 60_000) / 1000}\tfeat(pixelbar): two lines\n`,
  'rev-list': '1\n',
}

type On = Parameters<Parameters<typeof test>[1]>[1]

// Stand-ins for the engine beneath the plugin: each `$` call answers `{ value }`.
function fakeSession(on: On, ctxPercent = 42) {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/Users/zeckon/workspace/claude-plugins' }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.turns', () => ({ value: 7 }))
  on('session.usage', () => ({
    value: {
      startedAt: NOW - 72 * 60_000,
      context: { tokens: 84_000, window: 200_000, percent: ctxPercent },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 37 },
        { kind: 'seven_day', percentUsed: 12 },
      ],
      cost: { usd: 1.234 },
    },
  }))
  on('process.run', (_, e) => {
    const sub = (e as unknown as { argv: string[] }).argv[1] ?? ''
    return {
      value: { exitCode: 0, stdout: GIT[sub] ?? '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
    }
  })
  on('agent.list', () => ({ value: [] }))
  on('settings.read', () => ({ value: { effortLevel: 'high' } }))
  on('env.get', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('command.register', () => ({ value: {} }))
  mock.store(on)
  return mock.clock(on, { now: NOW })
}

type Painted = { rows: string[]; columns: number; cell: (x: number, y: number) => { ch: string; fg: number; bg: number } }

async function paintStrip($: Parameters<Parameters<typeof test>[1]>[0], columns: number, hint?: string): Promise<Painted> {
  const ui = await $.ui.mount(HINT(columns, hint))
  const raster = (await ui.find({ type: 'Raster' })) as never as { props: { columns: number; rows: number; cells: string } }
  await ui.unmount()
  const { columns: w, rows: h, cells } = raster.props
  const words = new Uint32Array(Uint8Array.from(atob(cells), ch => ch.charCodeAt(0)).buffer)
  const cell = (x: number, y: number) => {
    const i = (y * w + x) * 3
    return { ch: String.fromCodePoint(words[i]!), fg: words[i + 1]!, bg: words[i + 2]! }
  }
  const rows: string[] = []
  for (let y = 0; y < h; y++) {
    let line = ''
    for (let x = 0; x < w; x++) line += cell(x, y).ch
    rows.push(line)
  }
  return { rows, columns: w, cell }
}

describe('pixelbar strip', () => {
  test('project on line 1, a separator, Claude on line 2, the character across all three', async ($, on) => {
    fakeSession(on)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

    const { rows, columns } = await paintStrip($, 260)
    console.log(`\n${rows.join('\n')}`)

    expect(rows.length).toBe(3)
    expect(columns).toBe(259)
    const [project, rule, claude] = rows as [string, string, string]
    for (const w of ['DIR claude-plugins', 'GIT feat/pixelbar *2 ^2', 'DIFF +124 -37', 'COMMIT 5m feat(pixelbar): two lines', 'STASH 1']) {
      expect(project).toContain(w)
    }
    expect(rule).toContain('╶────')
    for (const w of ['MODE DEFAULT', 'OPUS 5.5', '███░░ HIGH', 'CTX', '42% 84K/200K', '5H', '37%', '7D', '12%', 'SESSION 7T $1.23', 'TIME 1h12m', '? for shortcuts']) {
      expect(claude).toContain(w)
    }
    // The character fills the first columns of every row.
    for (const row of rows) expect(row.slice(1, 9).trim().length).toBeGreaterThan(0)
  })

  test('another mode: leaves room for the engine pill and draws no MODE tile', async ($, on) => {
    fakeSession(on)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

    const first = await paintStrip($, 200, 'auto mode on (shift+tab to cycle)')
    expect(first.columns).toBe(200 - 'auto mode on'.length - 4 - 1)

    const settled = await paintStrip($, 200, '(shift+tab to cycle)')
    expect(settled.columns).toBe(183)
    expect(settled.rows[2]).not.toContain('MODE DEFAULT')
    expect(settled.rows[2]).not.toContain('shift+tab')

    const back = await paintStrip($, 200, 'manual mode on · ? for shortcuts')
    expect(back.rows[2]).toContain('MODE DEFAULT')
  })

  test('fits a narrow terminal, keeping folder, branch and context', async ($, on) => {
    fakeSession(on)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

    const { rows } = await paintStrip($, 90, 'esc to interrupt')
    console.log(`\n${rows.join('\n')}`)
    expect(rows[0]).toContain('claude-plugins')
    expect(rows[0]).toContain('feat/pixelbar')
    expect(rows[0]).not.toContain('COMMIT')
    expect(rows[2]).toContain('42%')
    expect(rows[2]).not.toContain('SESSION')
  })

  test('the character panics in the alert color when context passes 80%', async ($, on) => {
    fakeSession(on, 85)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

    const { cell } = await paintStrip($, 200)
    // Row 1, first body column: two body pixels, one full block.
    expect(cell(1, 1).ch).toBe('█')
    expect(cell(1, 1).fg).toBe(0xff5050)
  })

  test('the character falls asleep after 5 quiet minutes', async ($, on) => {
    const clock = fakeSession(on)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

    expect((await paintStrip($, 200)).cell(9, 1).ch).not.toBe('z')
    await clock.advance(6 * 60_000)
    const { rows, cell } = await paintStrip($, 200)
    console.log(`\n${rows.map(r => r.slice(0, 40)).join('\n')}`)
    expect(cell(9, 1).ch).toBe('z')
  })

  test('/pixelbar-sections toggles, forces and resets sections', async ($, on) => {
    fakeSession(on)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    const run = (args: string) => $.command.run({ command: 'pixelbar-sections', args })

    const listed = (await run('')).text ?? ''
    expect(listed).toContain('Line 1 (project):')
    expect(listed).toContain('[x] commit')

    const toggled = (await run('commit diff')).text ?? ''
    expect(toggled).toContain('[ ] commit')
    let { rows } = await paintStrip($, 260)
    expect(rows[0]).not.toContain('COMMIT')
    expect(rows[0]).not.toContain('DIFF')

    await run('on commit')
    ;({ rows } = await paintStrip($, 260))
    expect(rows[0]).toContain('COMMIT')
    expect(rows[0]).not.toContain('DIFF')

    await run('off hint model')
    ;({ rows } = await paintStrip($, 260))
    expect(rows[2]).not.toContain('? for shortcuts')
    expect(rows[2]).not.toContain('OPUS')

    expect((await run('nope')).text).toContain('Unknown section: nope')

    await run('reset')
    ;({ rows } = await paintStrip($, 260))
    expect(rows[0]).toContain('DIFF')
    expect(rows[2]).toContain('OPUS')
  })

  test('/pixelbar-palette cycles, picks by name, lists, and wraps around', async ($, on) => {
    fakeSession(on)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    const run = (args: string) => $.command.run({ command: 'pixelbar-palette', args })
    const ground = async () => (await paintStrip($, 120)).cell(0, 0).bg

    expect(await ground()).toBe(0x0f380f) // Game Boy by default
    expect((await run('')).text).toBe('palette Green phosphor (2/12)')
    expect(await ground()).toBe(0x0b120c)
    expect((await run('Virtual Boy')).text).toContain('Virtual Boy (11/12)')
    expect(await ground()).toBe(0x0a0000)
    expect((await run('list')).text).toContain('> virtualboy')
    expect((await run('nope')).text).toContain('No palette "nope"')
    await run('matrix')
    expect(await ground()).toBe(0x000000)
    await run('')
    expect(await ground()).toBe(0x0f380f)
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
