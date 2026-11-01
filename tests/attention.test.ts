import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const MINUTE = 60_000
// Noon local time, so the day key doesn't roll over mid-test.
const NOON = new Date(2026, 9, 31, 12, 0, 0).getTime()

// Stands in for the engine beneath the mod: records sounds, pushes and the store.
function world(on: On) {
  const clock = mock.clock(on, { now: NOON })
  const sounds: string[] = []
  const pushes: string[] = []
  const store = new Map<string, unknown>()
  on('process.run', (_, e) => {
    sounds.push(/needs-you/.test(e.argv.join(' ')) ? 'needs-you' : 'done')
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('ui.notify', () => ({ value: { isSent: false, reason: 'no-channel' } }))
  on('http.fetch', (_, e) => {
    pushes.push(`${e.url} ${e.init?.headers?.Title}: ${e.init?.body}`)
    return { value: { status: 200, ok: true, headers: {}, text: '' } }
  })
  on('ui.status', () => ({ value: undefined }))
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => (store.set(e.key, e.value), { value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))
  on('turn.complete', () => ({ text: '' }))
  on('classic.Notification', () => ({}))
  return { clock, sounds, pushes, store }
}

const turn = (durationMs: number) =>
  ({ answer: 'ok', durationMs, isAborted: false, turnId: 't1', reason: 'completed' }) as never

test('a permission prompt while away tings, pushes, reminds, and tallies the wait',
  { options: { ntfyTopic: 'my-topic' } }, async ($, on) => {
    const w = world(on)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await w.clock.advance(5 * MINUTE) // no typing for 5 min: away

    await $.classic.Notification({ message: 'Claude needs your permission to use Bash', notification_type: 'permission_prompt' })
    await w.clock.settle()
    expect(w.sounds).toEqual(['needs-you'])
    expect(w.pushes).toEqual(['https://ntfy.sh/my-topic Claude needs you: Claude needs your permission to use Bash'])

    await w.clock.advance(2 * MINUTE) // still unanswered: reminder
    expect(w.sounds).toEqual(['needs-you', 'needs-you'])
    expect(w.pushes[1]).toMatch(/Claude is still waiting/)

    await w.clock.advance(1 * MINUTE)
    await $.tool.call({ tool: 'Bash', command: 'ls' }) // answered
    expect(w.store.get('waited:2026-10-31')).toBe(3 * MINUTE)
  })

test('at the keyboard: done ting, no phone push; away: push too',
  { options: { ntfyTopic: 'my-topic' } }, async ($, on) => {
    const w = world(on)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

    await $.turn.complete(turn(4000))
    expect(w.sounds).toEqual(['done'])
    expect(w.pushes).toEqual([])

    await w.clock.advance(10 * MINUTE)
    await $.turn.complete(turn(600_000))
    expect(w.sounds).toEqual(['done', 'done'])
    expect(w.pushes).toEqual(['https://ntfy.sh/my-topic Claude is done: Finished after 10 min'])
  })

test('turns shorter than minTurnSeconds stay quiet', { options: { minTurnSeconds: 20 } }, async ($, on) => {
  const w = world(on)
  await $.turn.complete(turn(5000))
  expect(w.sounds).toEqual([])
  await $.turn.complete(turn(25_000))
  expect(w.sounds).toEqual(['done'])
})
