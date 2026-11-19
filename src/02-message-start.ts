/**
 * 02 — Deep dive: message_start
 *
 * `message_start` is the first event of every stream. It carries a Message
 * object whose `content` is still empty — think of it as the "envelope" that
 * the rest of the stream fills in.
 *
 * Useful things you get *before* any text arrives:
 *   - message.id            -> log/correlate this request
 *   - message.model         -> which model is actually serving it
 *   - usage.input_tokens    -> the prompt cost is already known
 *   - usage.cache_*_tokens  -> whether prompt caching hit
 *
 * Things that are NOT final yet (they arrive in message_delta at the end):
 *   - stop_reason / stop_sequence  (null here)
 *   - usage.output_tokens          (a small placeholder here)
 *
 *   npm run message-start
 */
import { baseParams, c, client, promptFromArgs } from "./client.js";

const prompt = promptFromArgs("Name three planets and one fact about each.");

const stream = client.beta.messages.stream({
  ...baseParams,
  output_config: { effort: "low" },
  messages: [{ role: "user", content: prompt }],
});

let startUsage: { input: number; output: number } | undefined;

for await (const event of stream) {
  if (event.type === "message_start") {
    const m = event.message;
    startUsage = { input: m.usage.input_tokens, output: m.usage.output_tokens };

    console.log(c.bold(c.cyan("message_start received\n")));
    const rows: Array<[string, unknown, string]> = [
      ["id", m.id, "unique message id — log it for support/debugging"],
      ["type", m.type, "always 'message'"],
      ["role", m.role, "always 'assistant'"],
      ["model", m.model, "model that is serving this request"],
      ["content", m.content, "empty: blocks arrive via content_block_start"],
      ["stop_reason", m.stop_reason, "null until message_delta"],
      ["usage.input_tokens", m.usage.input_tokens, "final — prompt size is known up front"],
      ["usage.output_tokens", m.usage.output_tokens, "placeholder — final value comes in message_delta"],
      ["usage.cache_read_input_tokens", m.usage.cache_read_input_tokens, "prompt-cache hits"],
      ["usage.cache_creation_input_tokens", m.usage.cache_creation_input_tokens, "prompt-cache writes"],
    ];
    for (const [field, value, note] of rows) {
      console.log(`  ${field.padEnd(36)} ${c.yellow(JSON.stringify(value)).padEnd(40)} ${c.dim(note)}`);
    }
    console.log(c.bold("\nStreaming response:\n"));
  }

  if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
    process.stdout.write(event.delta.text);
  }

  if (event.type === "message_delta") {
    console.log(c.bold(c.yellow("\n\nmessage_delta (end of stream) fills in the rest:")));
    console.log(`  stop_reason           ${event.delta.stop_reason}`);
    console.log(`  usage.output_tokens   ${startUsage?.output} -> ${event.usage.output_tokens}`);
  }
}

// The SDK also accumulates everything into a complete Message for you.
const final = await stream.finalMessage();
console.log(c.dim(`\nfinalMessage(): id=${final.id} input=${final.usage.input_tokens} output=${final.usage.output_tokens}`));
