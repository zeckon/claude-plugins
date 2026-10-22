import { describe, expect, test } from 'claude-code/testing'

const BAND = (bodyColumns: number) =>
  ({
    plugin: 'pixelbar',
    component: 'AbovePrompt',
    surface: 'terminal',
    props: {
      hasSurvey: false,
      isWorking: false,
      maxRows: 20,
      bodyColumns,
      scroll: { offset: 0, bodyRows: 20 },
      view: {},
    },
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

describe('pixelbar band', () => {
  test('shows folder, branch, model, effort, context and session on a wide terminal', async ($, on) => {
    fakeSession(on)
    await $.session.start({ cwd: '/Users/zeckon/workspace/claude-plugins', surface: 'terminal', isInteractive: true })

    const ui = await $.ui.mount(BAND(200))
    for (const words of [/claude-plugins/, /feat\/pixelbar/, / \*2/, / \^2/, /OPUS 5\.5/, / HIGH/, / 42%/, /84K\/200K/, /7 TURNS/, /\$1\.23/, /37%/]) {
      expect(await ui.find({ type: 'Text', text: words })).toBeDefined()
    }
    await ui.unmount()
  })

  test('drops the least important tiles when narrow, keeping the folder', async ($, on) => {
    fakeSession(on)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

    const ui = await $.ui.mount({ ...BAND(60), props: { ...BAND(60).props, maxRows: 3 } })
    expect(await ui.find({ type: 'Text', text: /claude-plugins/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /37%/ })).toBeUndefined()
    await ui.unmount()
  })

  test('steps aside for a survey', async ($, on) => {
    fakeSession(on)
    on('ui.render', ($, e) => {
      const { Text } = $.ui.resolve(e)
      return <Text>engine</Text>
    })
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

    const ui = await $.ui.mount({ ...BAND(200), props: { ...BAND(200).props, hasSurvey: true } })
    expect(await ui.find({ type: 'Text', text: /claude-plugins/ })).toBeUndefined()
    await ui.unmount()
  })
})
