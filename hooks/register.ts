import type { Register, EngineInterface } from 'claude-code'

type Options = {
  ntfyTopic?: string
  ntfyServer?: string
  awayAfterMinutes?: number
  remindAfterMinutes?: number
  minTurnSeconds?: number
}

const MINUTE = 60_000

// Set from options in register; module variables start over on each reload.
const cfg = { awayMs: 3 * MINUTE, remindMs: 2 * MINUTE, minTurnMs: 0, topic: '', server: 'https://ntfy.sh' }
let lastActivity = 0
let waitingSince: number | undefined
let reminder: { cancel(): void } | undefined

function dayKey(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `waited:${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.round(s / 60)
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`
}

// $.audio.play has no player in a Windows terminal, so try PowerShell's SoundPlayer first.
function play($: EngineInterface, sound: 'done' | 'needs-you') {
  const asset = `sounds/${sound}.wav`
  void $.process
    .run(['powershell', '-NoProfile', '-NonInteractive', '-Command',
      `(New-Object Media.SoundPlayer '${$.plugin.root}/${asset}').PlaySync()`])
    .catch(() => $.audio.play({ asset }))
    .catch(() => {})
}

// Desktop notification through the person's own channel, plus ntfy to their phone if configured.
// Messages carry no conversation content: an ntfy topic is readable by anyone who guesses it.
function push($: EngineInterface, title: string, text: string) {
  void $.ui.notify(text, { title }).catch(() => {})
  if (!cfg.topic) return
  void $.http
    .fetch(`${cfg.server}/${encodeURIComponent(cfg.topic)}`, {
      method: 'POST',
      headers: { Title: title, Tags: 'bell' },
      body: text,
    })
    .catch((err) => $.ui.toast(`oven-ding: phone push failed (${String(err)})`))
}

async function showTally($: EngineInterface) {
  const total = Number((await $.store.get(dayKey(await $.clock.now()))) ?? 0)
  $.ui.status(total >= 1000 ? `⏲ Claude waited ${formatDuration(total)} for you today` : undefined)
}

async function startWait($: EngineInterface, why: string) {
  if (waitingSince !== undefined) return
  const now = await $.clock.now()
  waitingSince = now
  play($, 'needs-you')
  if (now - lastActivity >= cfg.awayMs) push($, 'Claude needs you', why)
  reminder = $.clock.after(cfg.remindMs, () => {
    if (waitingSince !== now) return
    play($, 'needs-you')
    push($, 'Claude is still waiting', `${why} (waiting ${formatDuration(cfg.remindMs)})`)
  })
}

async function endWait($: EngineInterface) {
  if (waitingSince === undefined) return
  const now = await $.clock.now()
  const waited = now - waitingSince
  waitingSince = undefined
  reminder?.cancel()
  reminder = undefined
  lastActivity = now
  const key = dayKey(now)
  await $.store.set(key, Number((await $.store.get(key)) ?? 0) + waited)
  await showTally($)
}

export const register: Register = (on, options) => {
  const opts = options as Options
  cfg.awayMs = (opts.awayAfterMinutes ?? 3) * MINUTE
  cfg.remindMs = (opts.remindAfterMinutes ?? 2) * MINUTE
  cfg.minTurnMs = (opts.minTurnSeconds ?? 0) * 1000
  cfg.topic = (opts.ntfyTopic ?? '').trim()
  cfg.server = (opts.ntfyServer || 'https://ntfy.sh').replace(/\/+$/, '')

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    lastActivity = await $.clock.now()
    await showTally($)
    return started
  })

  // Typing or sending a prompt means you're at the keyboard.
  on('prompt.change', async ($, e, next) => {
    lastActivity = await $.clock.now()
    return next(e)
  })
  on('prompt.submit', async ($, e, next) => {
    lastActivity = await $.clock.now()
    await endWait($)
    return next(e)
  })

  // A permission prompt or an MCP input request is on screen.
  on('classic.Notification', async ($, e, next) => {
    if (e.notification_type === 'permission_prompt' || e.notification_type === 'elicitation_dialog') {
      await startWait($, e.message || 'Claude is waiting for your approval')
    }
    return next(e)
  })

  // A question to you counts as waiting; any tool call resolving means the prompt was answered.
  on('tool.call', async ($, e, next) => {
    if (e.tool === 'AskUserQuestion') await startWait($, 'Claude has a question for you')
    try {
      return await next(e)
    } finally {
      await endWait($)
    }
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    await endWait($)
    if (e.agentId !== undefined || e.isAborted || e.durationMs < cfg.minTurnMs) return result
    play($, 'done')
    if ((await $.clock.now()) - lastActivity >= cfg.awayMs) {
      push($, 'Claude is done', `Finished after ${formatDuration(e.durationMs)}`)
    }
    return result
  })
}
