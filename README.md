# Claude Streaming Lab (TypeScript)

A small, hands-on lab for understanding **how the Claude Messages API streams a response**, with a
focus on the two events that frame everything else: `message_start` and `content_block_start`.

Each script is runnable on its own and prints a colorized, annotated view of the live event stream.

## The event lifecycle

```
message_start                  ← the Message "envelope": id, model, input token usage. content = []
│
├─ content_block_start [0]     ← a new block opens; its `type` says how to read the deltas
│    content_block_delta [0]   ← many small pieces (text_delta, thinking_delta, input_json_delta…)
│  content_block_stop  [0]
│
├─ content_block_start [1]
│    content_block_delta [1]
│  content_block_stop  [1]
│
message_delta                  ← stop_reason + final output_tokens
message_stop
```

| Event | What it tells you |
|---|---|
| `message_start` | Request accepted. Message `id`, `model`, and `usage.input_tokens` are already known; `content` is empty and `stop_reason` is `null`. |
| `content_block_start` | Block `index` is opening, with an initial `content_block` whose `type` is `thinking`, `text`, `tool_use` (with `name` and `id`), or `fallback`. |
| `content_block_delta` | Append to block `index`. The delta type matches the block type. |
| `content_block_stop` | Block `index` is complete. A `tool_use` block's JSON can now be parsed. |
| `message_delta` | Final `stop_reason` (`end_turn`, `tool_use`, `max_tokens`, `refusal`, …) and `usage.output_tokens`. |
| `message_stop` | Stream complete. |

## The scripts

| Command | What you'll see |
|---|---|
| `npm run events` | **Raw event log.** Every event with a timestamp, including the full `message_start` payload. Start here. |
| `npm run message-start` | **`message_start` deep dive.** Each field explained: what's final up front and what gets filled in by `message_delta`. |
| `npm run blocks` | **`content_block_start` deep dive.** One prompt that typically produces a `text` block and two parallel `tool_use` blocks (plus a `thinking` block when Claude decides to reason first), each color-coded, plus a per-block summary table. |
| `npm run timing` | **Why streaming matters.** Time to `message_start`, to the first block, to the first visible token, and total. |

Every script takes an optional prompt:

```bash
npm run events -- "Explain recursion in two sentences"
```

## Setup

Requires Node.js 22+.

```bash
npm install
cp .env.example .env    # then add your ANTHROPIC_API_KEY (or export it in your shell)
npm run events
```

## Implementation notes

- Uses the official [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) and `client.beta.messages.stream()`, with a `for await` loop over the typed event union. TypeScript narrows each `event.type`, so `event.content_block.type` and `event.delta.type` are fully typed.
- `stream.finalMessage()` returns the fully assembled `Message`. Script 03 also builds its own per-`index` buffers to show what the SDK is doing internally.
- **Model:** `claude-opus-5-5` with adaptive thinking. Script 03 sets `display: "summarized"` so the thinking block contains readable text (by default it streams empty).
- **Refusal fallbacks** are on (`fallbacks: "default"`). If the model declines a request, the API continues on a fallback model in the same stream. You can see this as a `fallback` content block.
- **Eager tool input streaming** (`eager_input_streaming: true`) on the demo tool, so `input_json_delta` fragments arrive as they're generated. The tool is only observed, never executed.

## Project layout

```
src/
  client.ts            shared client, model, params, and terminal helpers
  01-event-log.ts      every raw event, timestamped
  02-message-start.ts  message_start field-by-field
  03-content-blocks.ts content_block_start for thinking / text / tool_use
  04-timing.ts         latency milestones
```
