/**
 * 03 — Deep dive: content_block_start
 *
 * A response is a list of content blocks (message.content[]). Each block is
 * announced by content_block_start with:
 *   - index          its position in message.content
 *   - content_block  its initial shape; `content_block.type` tells you how to
 *                    interpret the deltas that follow for that index:
 *
 *     block type   delta type          what to append
 *     ----------   ------------------  ------------------------------
 *     thinking     thinking_delta      delta.thinking (reasoning summary)
 *                  signature_delta     delta.signature (opaque, keep it)
 *     text         text_delta          delta.text
 *     tool_use     input_json_delta    delta.partial_json (JSON fragments)
 *     fallback     (none)              a model declined; another took over
 *
 * This demo asks a question that makes Claude think, write text, AND call a
 * tool, so you can watch several block types open in one stream. We build our
 * own per-index buffers to show what the SDK's finalMessage() does internally.
 *
 * Note: we only *observe* the tool call here; we never execute it.
 *
 *   npm run blocks
 */
import { baseParams, c, client, promptFromArgs, since } from "./client.js";

const prompt = promptFromArgs(
  "I can picnic in either Seattle or Portland tomorrow. Think about what makes picnic weather good " +
    "(rain, wind, temperature), tell me briefly what you'll compare, then look up the weather for both cities.",
);

const t0 = performance.now();
const stream = client.beta.messages.stream({
  ...baseParams,
  // Show a readable summary of Claude's reasoning (default is "omitted": empty text).
  thinking: { type: "adaptive", display: "summarized" },
  // Adaptive thinking means Claude decides whether to think. Higher effort
  // makes a thinking block more likely, so you can see it in the stream.
  output_config: { effort: "high" },
  tools: [
    {
      name: "get_weather",
      description: "Get the weather forecast for a city.",
      input_schema: {
        type: "object",
        properties: {
          city: { type: "string", description: "City name, e.g. Seattle" },
          day: { type: "string", enum: ["today", "tomorrow"] },
        },
        required: ["city", "day"],
      },
      // Stream tool input as it is generated instead of in one burst at the end.
      eager_input_streaming: true,
    },
  ],
  messages: [{ role: "user", content: prompt }],
});

type Tracked = { type: string; startedAt: string; deltas: number; buffer: string };
const blocks = new Map<number, Tracked>();
const color: Record<string, (s: string) => string> = {
  thinking: c.magenta,
  text: c.green,
  tool_use: c.yellow,
  fallback: c.red,
};

for await (const event of stream) {
  if (event.type === "content_block_start") {
    const b = event.content_block;
    blocks.set(event.index, { type: b.type, startedAt: since(t0), deltas: 0, buffer: "" });
    const paint = color[b.type] ?? c.cyan;

    let detail = "";
    if (b.type === "tool_use") detail = ` name=${b.name} id=${b.id}`;
    console.log(paint(c.bold(`\n\n┌─ content_block_start  index=${event.index}  type=${b.type}${detail}`)));
    if (b.type === "fallback") console.log(c.red(`│ ${JSON.stringify(b)}`));
  }

  if (event.type === "content_block_delta") {
    const t = blocks.get(event.index)!;
    t.deltas++;
    const d = event.delta;
    let piece = "";
    if (d.type === "text_delta") piece = d.text;
    else if (d.type === "thinking_delta") piece = d.thinking;
    else if (d.type === "input_json_delta") piece = d.partial_json;
    // signature_delta and others: nothing human-readable to print
    t.buffer += piece;
    process.stdout.write((color[t.type] ?? c.cyan)(piece));
  }

  if (event.type === "content_block_stop") {
    const t = blocks.get(event.index)!;
    console.log((color[t.type] ?? c.cyan)(`\n└─ content_block_stop   index=${event.index}  (${t.deltas} deltas)`));
  }
}

const final = await stream.finalMessage();

console.log(c.bold("\n\nSummary of content blocks"));
console.log(c.dim("index  type        started   deltas  chars"));
for (const [i, t] of blocks) {
  console.log(`${String(i).padEnd(7)}${t.type.padEnd(12)}${t.startedAt}  ${String(t.deltas).padStart(6)}  ${String(t.buffer.length).padStart(5)}`);
}

// Our hand-built buffers line up with what the SDK accumulated:
for (const block of final.content) {
  if (block.type === "tool_use") {
    console.log(c.yellow(`\nParsed tool input (from finalMessage): ${JSON.stringify(block.input)}`));
  }
}
console.log(c.dim(`stop_reason=${final.stop_reason}  (tool_use means Claude is waiting for us to run the tool)`));
