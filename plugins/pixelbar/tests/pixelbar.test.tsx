import { describe, expect, mock, test } from 'claude-code/testing'

const NOW = 1_760_000_000_000

const HINT = (columns: number, hint = '? for shortcuts', isWorking = false) =>
  ({
    plugin: 'pixelbar',
    component: 'PromptHint',
    surface: 'terminal',
    viewport: { columns, rows: 40 },
    props: { isDraft: false, isWorking, hint },
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

async function paintStrip(
  $: Parameters<Parameters<typeof test>[1]>[0],
  columns: number,
  hint?: string,
  isWorking = false,
): Promise<Painted> {
  const ui = await $.ui.mount(HINT(columns, hint, isWorking))
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
  test('one row over the pill line: walker, mode, Claude and session sections; project at the right end', async ($, on) => {
    fakeSession(on)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

    const { rows, columns } = await paintStrip($, 320)
    const [row] = rows as [string]
    console.log(`\n${row}`)

    expect(rows.length).toBe(1)
    expect(columns).toBe(316)
    expect(row.slice(1, 3)).toBe('▛▜')
    const order = ['MODE DEFAULT', 'OPUS 5.5', '▁▂▃▄▅', 'CTX', '42% 84K/200K', '5H', '37%', 'SESSION 1h12m 7T $1.23',
      '░░░', 'DIR claude-plugins', 'GIT feat/pixelbar *2 ^2', 'DIFF +124 -37', 'STASH 1']
    let at = 0
    for (const w of order) {
      const found = row.indexOf(w, at)
      expect(found).toBeGreaterThan(-1)
      at = found
    }
    expect(row.trimEnd().endsWith('STASH 1 ▌')).toBe(true)
    expect(row.trimEnd().length).toBe(columns) // packed against the right edge
    expect(row).not.toContain('│') // no divider
    // Hidden until switched on.
    for (const w of ['COMMIT', '7D', '? for shortcuts']) expect(row).not.toContain(w)
  })

  test('the MODE tile follows shift+tab through the modes', async ($, on) => {
    fakeSession(on)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.command.run({ command: 'pixelbar-sections', args: 'on hint' })
    const modeAfter = async (...hints: string[]) => {
      let painted: Painted | null = null
      for (const h of hints) painted = await paintStrip($, 200, h, h === 'esc to interrupt')
      expect(painted!.columns).toBe(196)
      expect(painted!.rows[0]).not.toContain('shift+tab')
      return /MODE ([A-Z' ]+?) ▌/.exec(painted!.rows[0]!)?.[1]
    }

    expect(await modeAfter('? for shortcuts')).toBe('DEFAULT')
    // Each step's first hint names the mode it leaves.
    expect(await modeAfter('manual mode on · ? for shortcuts', '(shift+tab to cycle)')).toBe('ACCEPT EDITS')
    expect(await modeAfter('accept edits on (shift+tab to cycle)', '(shift+tab to cycle)')).toBe('PLAN')
    expect(await modeAfter('plan mode on (shift+tab to cycle)', '(shift+tab to cycle)')).toBe('AUTO')
    expect(await modeAfter('esc to interrupt')).toBe('AUTO') // a working hint keeps it
    expect(await modeAfter('auto mode on (shift+tab to cycle)', '? for shortcuts')).toBe('DEFAULT')
  })

  test('a pill shown with no mode known yet reads MODE ON, until a prompt names the mode', async ($, on) => {
    fakeSession(on)
    on('classic.UserPromptSubmit', () => ({}))
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

    expect((await paintStrip($, 200, '(shift+tab to cycle)')).rows[0]).toContain('MODE ON')
    await $.classic.UserPromptSubmit({ prompt: 'hi', permission_mode: 'bypassPermissions' })
    expect((await paintStrip($, 200, '(shift+tab to cycle)')).rows[0]).toContain('MODE BYPASS')
  })

  test('fits a narrow terminal, keeping folder, mode and context', async ($, on) => {
    fakeSession(on)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

    const { rows } = await paintStrip($, 100, 'esc to interrupt')
    const [row] = rows as [string]
    console.log(`\n${row}`)
    expect(row).toContain('claude-plugins')
    expect(row).toContain('MODE DEFAULT')
    expect(row).toContain('42%')
    expect(row).not.toContain('SESSION')
    expect(row).not.toContain('STASH')
  })

  test('the walker panics in the alert color when context passes 80%', async ($, on) => {
    fakeSession(on, 85)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

    const { cell } = await paintStrip($, 200)
    expect(cell(1, 0).fg).toBe(0xff5050)
  })

  test('the walker falls asleep after 5 quiet minutes', async ($, on) => {
    const clock = fakeSession(on)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

    expect((await paintStrip($, 200)).rows[0]!.slice(1, 4)).toBe('▛▜ ')
    await clock.advance(6 * 60_000)
    const asleep = (await paintStrip($, 200)).rows[0]!.slice(1, 4)
    console.log(`\n${asleep}`)
    expect(asleep).toMatch(/^▄▄[zZ]$/)
  })

  test('/pixelbar-sections toggles, forces, shows all and resets to defaults', async ($, on) => {
    fakeSession(on)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    const run = (args: string) => $.command.run({ command: 'pixelbar-sections', args })
    const row = async () => (await paintStrip($, 320)).rows.join('\n')

    const listed = (await run('')).text ?? ''
    expect(listed).toContain('Project:')
    expect(listed).toContain('Claude and session:')
    expect(listed).toContain('[ ] commit')
    expect(listed).toContain('[x] diff')

    expect(listed).toContain('[ ] hint')

    expect((await run('commit diff')).text).toContain('[x] commit')
    expect(await row()).toContain('COMMIT 5m feat(pixelbar): two lines')
    expect(await row()).not.toContain('DIFF')

    await run('on hint')
    expect(await row()).toContain('? for shortcuts')
    await run('off hint model')
    expect(await row()).not.toContain('? for shortcuts')
    expect(await row()).not.toContain('OPUS')

    await run('on model')
    expect(await row()).toContain('OPUS')

    expect((await run('nope')).text).toContain('Unknown section: nope')

    await run('reset')
    expect(await row()).not.toContain('COMMIT')
    expect(await row()).toContain('DIFF')
    expect(await row()).not.toContain('? for shortcuts')

    await run('all')
    expect(await row()).toContain('COMMIT')
    expect(await row()).toContain('7D')
    expect(await row()).toContain('? for shortcuts')
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
