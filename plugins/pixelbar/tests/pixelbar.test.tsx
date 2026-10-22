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
  test('paints two full-width rows of project and session facts', async ($, on) => {
    fakeSession(on)
    await $.session.start({ cwd: '/Users/zeckon/workspace/claude-plugins', surface: 'terminal', isInteractive: true })

    const ui = await $.ui.mount(HINT(180))
    const raster = await ui.find({ type: 'Raster' })
    const [top, bottom] = decode(raster as never)
    console.log(`\n${top}\n${bottom}`)

    expect((raster as never as { props: { columns: number; rows: number } }).props.rows).toBe(2)
    expect((raster as never as { props: { columns: number } }).props.columns).toBe(180)
    for (const words of ['claude-plugins', 'feat/pixelbar *2 ^2', 'OPUS 5.5', '███░░ HIGH', '7 TURNS $1.23']) {
      expect(top).toContain(words)
    }
    for (const words of ['CTX', '42% 84K/200K', '5H', '37%', '? for shortcuts']) {
      expect(bottom).toContain(words)
    }
    await ui.unmount()
  })

  test('fits a narrow terminal, keeping folder and context', async ($, on) => {
    fakeSession(on)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

    const ui = await $.ui.mount(HINT(70, 'esc to interrupt'))
    const [top, bottom] = decode((await ui.find({ type: 'Raster' })) as never)
    console.log(`\n${top}\n${bottom}`)

    expect(top).toContain('claude-plugins')
    expect(top).not.toContain('SESSION')
    expect(bottom).toContain('42%')
    expect(bottom).toContain('esc to interrupt')
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
