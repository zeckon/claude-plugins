export type Git = {
  /** Branch name, or `@<short sha>` when HEAD is detached. */
  branch: string
  /** Changed or untracked paths in the working tree. */
  dirty: number
  ahead: number
  behind: number
  /** Lines added / removed against HEAD (`git diff --shortstat HEAD`). */
  added: number
  removed: number
  /** The last commit: epoch milliseconds and subject; null before the first commit. */
  commitAt: number | null
  commitSubject: string
  stashes: number
}

/** Everything the strip shows about the project and session, refreshed on events. */
export type Snapshot = {
  /** Last folder of the session's working directory. */
  dir: string
  git: Git | null
  model: string
  effort: string | null
  ctxTokens: number | null
  ctxWindow: number
  ctxPercent: number | null
  costUsd: number | null
  turns: number
  /** When the session began, epoch milliseconds. */
  startedAt: number
  /** Rate-limit windows used, 0-100, when on a subscription. */
  limit5h: number | null
  limit7d: number | null
  /** Subagents pending, running or waiting. */
  agents: number
}

export type Tokens = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

/** Counts the mod keeps itself, since the plugin loaded in this session. */
export type Counters = {
  tools: number
  edits: number
  compacts: number
  /** Wall-clock length of the last main-loop turn, ms; null before the first. */
  lastTurnMs: number | null
}

declare module 'claude-code' {
  interface PluginState {
    pixelbar: {
      snap: Snapshot | null
      /** Effort the last main-loop request was sent with. */
      effort: string | null
      /** Token counts of the last main-loop turn. */
      last: Tokens | null
      /** Token counts summed over this session's main-loop turns. */
      total: Tokens
      /** Tokens (input + output) of the last main-loop turns, oldest first, for the sparkline. */
      history: number[]
      /** Id of the palette the strip paints in; also kept in `$.store` across sessions. */
      palette: string
      counters: Counters
      /** Ids of the sections switched off with /pixelbar-sections; also kept in `$.store`. */
      hidden: string[]
    }
  }
}
