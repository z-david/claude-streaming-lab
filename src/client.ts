import Anthropic from "@anthropic-ai/sdk";

// Reads ANTHROPIC_API_KEY from the environment (or .env via `--env-file-if-exists`).
export const client = new Anthropic();

export const MODEL = "claude-opus-5-5";

/**
 * Options shared by every demo.
 *
 * We use the beta endpoint (`client.beta.messages.stream`) so we can opt into
 * server-side refusal fallbacks: if the model declines a request, the API
 * re-runs it on a fallback model inside the same stream. When that happens you
 * will see an extra content block of type "fallback" — one more thing to watch
 * for in `content_block_start`.
 */
export const baseParams = {
  model: MODEL,
  max_tokens: 64000,
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default" as const,
};

/** Prompt from the command line, or a default. `npm run events -- "your prompt"` */
export function promptFromArgs(fallback: string): string {
  const arg = process.argv.slice(2).join(" ").trim();
  return arg.length > 0 ? arg : fallback;
}

/** Tiny ANSI color helpers so the terminal output is easy to scan in a demo. */
export const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  magenta: (s: string) => `\x1b[35m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
};

/** Milliseconds since `t0`, padded for aligned columns. */
export function since(t0: number): string {
  return `${String(Math.round(performance.now() - t0)).padStart(6)}ms`;
}
