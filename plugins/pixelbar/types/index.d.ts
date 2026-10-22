export type Git = {
  /** Branch name, or `@<short sha>` when HEAD is detached. */
  branch: string
  /** Changed or untracked paths in the working tree. */
  dirty: number
  ahead: number
  behind: number
}

/** Everything the band shows about the project and session, refreshed on events. */
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
  /** Five-hour rate-limit window used, 0-100, when on a subscription. */
  limit5h: number | null
}

export type Tokens = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
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
    }
  }
}
