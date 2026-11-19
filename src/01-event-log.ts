/**
 * 01 — The raw event log
 *
 * Prints every server-sent event exactly as the SDK hands it to us, with a
 * timestamp. Run this first: it shows the full lifecycle of a streamed message.
 *
 *   message_start                 (once)
 *     content_block_start  [0]    (once per block)
 *       content_block_delta [0]   (many)
 *     content_block_stop   [0]
 *     content_block_start  [1]    ...
 *   message_delta                 (stop_reason + final output token count)
 *   message_stop                  (once)
 *
 *   npm run events
 *   npm run events -- "Explain recursion in two sentences"
 */
import { baseParams, c, client, promptFromArgs, since } from "./client.js";

const prompt = promptFromArgs("Write a haiku about streaming data.");
console.log(c.bold(`Prompt: ${prompt}\n`));

const t0 = performance.now();
const stream = client.beta.messages.stream({
  ...baseParams,
  output_config: { effort: "low" },
  messages: [{ role: "user", content: prompt }],
});

let deltaCount = 0;
const shorten = (s: string, max = 120) => (s.length > max ? `${s.slice(0, max)}… (${s.length} chars)` : s);
const indent = (s: string) => s.replace(/^/gm, "         ");

/**
 * Serialize a value to JSON, then parse it back to prove it is valid JSON.
 * Returns pretty-printed JSON for display; long strings (like the thinking
 * `signature`) are shortened in the display only, after validation.
 */
function toValidatedJson(value: unknown): string {
  const json = JSON.stringify(value);
  if (json === undefined) throw new Error("value cannot be serialized to JSON");
  const parsed = JSON.parse(json); // throws SyntaxError if the JSON is not valid

  // Log just the "content" part. A Message has `content` (its array of blocks);
  // a single block has `text`, `thinking`, or `input` (tool_use) instead.
  const content = parsed?.content ?? parsed?.text ?? parsed?.thinking ?? parsed?.input;
  console.log(`THE CONTENT------ ${c.bold("content_block_stop.content")} ${c.dim(shorten(JSON.stringify(content[0]['text']) ?? "undefined", 200))}`);

  return JSON.stringify(
    parsed,
    (_key, v) => (typeof v === "string" ? shorten(v, 80) : v),
    2,
  );
}

for await (const event of stream) {
  const ts = c.dim(since(t0));
  
  switch (event.type) {
    case "message_start":
      // The whole (empty) Message object arrives here: id, model, role,
      // content: [], stop_reason: null, and usage with the INPUT token count.
      console.log(`${ts} ${c.cyan("message_start")}`);
      console.log(c.dim(JSON.stringify(event.message, null, 2)));
      break;

    case "content_block_start":
      // A new block is opening at position `index` in message.content.
      // `content_block` is the block's initial (empty) shape — its `type` tells
      // you which kind of deltas are about to arrive.
      console.log(
        `${ts} ${c.green("content_block_start")} index=${event.index} ` +
          c.dim(JSON.stringify(event.content_block)),
      );
      break;

    case "content_block_delta":
      deltaCount++;
      // Print deltas compactly; there can be hundreds of them. Long values
      // (e.g. the opaque thinking `signature`) are shortened for readability.
      console.log(`${ts} ${c.dim("content_block_delta")} index=${event.index} ${c.dim(shorten(JSON.stringify(event.delta)))}`);
      break;

    case "content_block_stop": {
      console.log(`${ts} ${c.green("content_block_stop")}  index=${event.index}`);
      // The SDK has been folding every delta into a snapshot of the message.
      // At this point, block `index` in that snapshot is complete.
      const block = stream.currentMessage?.content[event.index];
      console.log(c.green(`         completed block ${event.index}:`));
      console.log(c.green(indent(toValidatedJson(block))));
      break;
    }

    case "message_delta":
      console.log(`${ts} ${c.yellow("message_delta")} ${JSON.stringify(event.delta)} usage=${JSON.stringify(event.usage)}`);
      break;

    case "message_stop":
      console.log(`${ts} ${c.yellow("message_stop")}`);
      break;
  }
}

const final = await stream.finalMessage();
console.log(c.bold(`\n${deltaCount} deltas, stop_reason=${final.stop_reason}`));

// The complete, assembled response, validated as JSON.
console.log(c.bold(c.cyan("\nFinal message (valid JSON):")));
console.log(toValidatedJson(final));
