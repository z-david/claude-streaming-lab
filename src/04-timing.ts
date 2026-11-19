/**
 * 04 — Timing the stream
 *
 * Why stream at all? Because users see output long before the full response
 * is done. This demo measures the milestones that matter for perceived latency:
 *
 *   request sent
 *     -> message_start            server accepted the request, prompt processed
 *     -> content_block_start: thinking   (if Claude decides to reason first)
 *     -> content_block_start: text
 *     -> first visible text       "time to first token" (TTFT) for the user
 *     -> message_stop             total time
 *
 *   npm run timing
 */
import { baseParams, c, client, promptFromArgs } from "./client.js";

const prompt = promptFromArgs("Write a 150-word short story about a lighthouse keeper.");

const marks: Record<string, number> = {};
const mark = (name: string) => (marks[name] ??= performance.now());

const t0 = performance.now();
const stream = client.beta.messages.stream({
  ...baseParams,
  output_config: { effort: "low" },
  messages: [{ role: "user", content: prompt }],
});

for await (const event of stream) {
  switch (event.type) {
    case "message_start":
      mark("message_start");
      break;
    case "content_block_start":
      // Mark when each *kind* of block first opens. With adaptive thinking you
      // will often see a `thinking` block open well before the `text` block —
      // that gap is time the model spends reasoning before it answers.
      mark(`content_block_start: ${event.content_block.type}`);
      break;
    case "content_block_delta":
      if (event.delta.type === "text_delta") {
        mark("first text_delta (TTFT)");
        process.stdout.write(event.delta.text);
      }
      break;
    case "message_stop":
      mark("message_stop");
      break;
  }
}

const final = await stream.finalMessage();
const total = (marks["message_stop"] ?? performance.now()) - t0;

console.log(c.bold("\n\nMilestone                      ms after request   "));
for (const [name, at] of Object.entries(marks)) {
  const ms = at - t0;
  const bar = "█".repeat(Math.max(1, Math.round((ms / total) * 40)));
  console.log(`${name.padEnd(30)} ${String(Math.round(ms)).padStart(8)}   ${c.cyan(bar)}`);
}

const ttft = marks["first text_delta (TTFT)"];
const thinkingStart = marks["content_block_start: thinking"];
if (thinkingStart !== undefined && ttft !== undefined) {
  console.log(c.dim(`\n~${Math.round(ttft - thinkingStart)}ms was spent in a thinking block before any answer text.`));
}
if (ttft !== undefined) {
  console.log(c.dim(`Without streaming the user would wait ${Math.round(total)}ms to see anything; with it, ${Math.round(ttft - t0)}ms.`));
}
console.log(c.dim(`output_tokens=${final.usage.output_tokens} (includes any thinking tokens)`));
