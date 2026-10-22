import { describe, expect, test } from 'claude-code/testing'

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

describe('pixelbar strip', () => {
  test('paints one full-width row of project and session facts', async ($, on) => {
    fakeSession(on)
    await $.session.start({ cwd: '/Users/zeckon/workspace/claude-plugins', surface: 'terminal', isInteractive: true })

    const ui = await $.ui.mount(HINT(200, '\u23F5\u23F5 auto mode on (shift+tab to cycle) \u00B7 ? for shortcuts'))
    const raster = (await ui.find({ type: 'Raster' })) as never as { props: { columns: number; rows: number } }
    const [row] = decode(raster as never)
    console.log(`\n${row}`)

    expect(raster.props.rows).toBe(1)
    expect(raster.props.columns).toBe(200)
    for (const words of ['\u259B\u259C', 'MODE AUTO', 'claude-plugins', 'feat/pixelbar *2 ^2', 'OPUS 5.5', '\u2588\u2588\u2588\u2591\u2591 HIGH', 'CTX', '42% 84K/200K', '5H', '37%', '7T $1.23', '? for shortcuts']) {
      expect(row).toContain(words)
    }
    expect(row).not.toContain('shift+tab')
    await ui.unmount()
  })

  test('reads plan mode and the default mode off the hint', async ($, on) => {
    fakeSession(on)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

    const plan = await $.ui.mount(HINT(200, '\u23F8 plan mode on (shift+tab to cycle)'))
    expect(decode((await plan.find({ type: 'Raster' })) as never)[0]).toContain('MODE PLAN')
    await plan.unmount()

    const plain = await $.ui.mount(HINT(200))
    expect(decode((await plain.find({ type: 'Raster' })) as never)[0]).toContain('MODE DEFAULT')
    await plain.unmount()
  })

  test('fits a narrow terminal, keeping mode, folder and context', async ($, on) => {
    fakeSession(on)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

    const ui = await $.ui.mount(HINT(90, 'esc to interrupt'))
    const [row] = decode((await ui.find({ type: 'Raster' })) as never)
    console.log(`\n${row}`)

    expect(row).toContain('MODE DEFAULT')
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
