# oven-ding

An attention kit for Claude Code, so Claude never sits idle waiting for you unnoticed.

- **Done:** a bright oven-timer *ting* when Claude finishes a reply.
- **Needs you:** a double *ting* when Claude is waiting for a permission approval or has asked you a question.
- **Reminder:** if Claude is still waiting after 2 minutes, it tings again and notifies you.
- **Away mode:** if you haven't typed for 3 minutes, you also get a push notification on your phone.
- **Wait tally:** the status line shows how long Claude waited for you today, e.g. `⏲ Claude waited 14 min for you today`.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install oven-ding --marketplace anityagan9urde/claude-oven-ding
```

Answer `y` to add the marketplace, then pick the **user** scope so it works in every session.

From a shell:

```
claude plugin install oven-ding --marketplace anityagan9urde/claude-oven-ding
```

In the desktop app: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `anityagan9urde/claude-oven-ding`, then **Add plugin**.

## Phone notifications (optional)

Uses [ntfy](https://ntfy.sh), a free push service. No account is needed.

1. Install the **ntfy** app on your phone (Android or iOS).
2. Subscribe to a topic with a long random name, like `claude-7f3k9q2xw`. Anyone who knows the name can read it.
3. In Claude Code run `/config` and set **Phone push: ntfy topic** to that name.

Notifications only say things like "Claude is done: finished after 4 min". They never include your code or conversation.

## Settings (`/config`)

| Setting | Default | |
|---|---|---|
| Phone push: ntfy topic | empty | Empty turns phone push off |
| Phone push: ntfy server | `https://ntfy.sh` | Point it at a self-hosted ntfy server if you run one |
| Away after (minutes) | 3 | How long without typing counts as away |
| Remind after (minutes) | 2 | When to nudge again if Claude is still waiting |
| Ding only after turns longer than (seconds) | 0 | Raise this to keep quick replies silent |

## Platforms

Sounds play on Windows (through PowerShell) and macOS. Linux terminals have no player the plugin can use, so there are no sounds there, but notifications still work.
