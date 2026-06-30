// The Anthropic model adapter — one implementation of the engine's ModelAdapter seam.
//
// The serve loop (src/serve.ts) is model-agnostic: it hands an adapter a model-neutral
// {system, user} request and gets text back. This adapter speaks that contract to the
// Anthropic Messages API via the official SDK. It is an EDGE (I/O, a network client, a
// dependency) — deliberately outside the pure core (P1), like the materialize/scan tools.
//
// The baseURL seam: an Anthropic-COMPATIBLE third-party endpoint (e.g. Z.ai) is driven by
// THIS adapter — pass that provider's baseURL + model id + key. Adaptive thinking is an
// Anthropic feature a compatible endpoint may not accept, so it is switchable (default on:
// it keeps the model's reasoning out of the final text on the 4.x family). Providers with a
// different wire format (Mistral, Gemini) get their OWN adapter file; ModelAdapter is the
// one shared contract, so adding one is a new file, not a change here.

import Anthropic from "@anthropic-ai/sdk";
import type { ModelAdapter } from "../src/index";

export interface AnthropicAdapterOptions {
  /** API key, sent as the `x-api-key` header. Defaults to ANTHROPIC_API_KEY from the
   *  environment (the SDK reads it). This is how the native Anthropic API authenticates. */
  readonly apiKey?: string;
  /** Bearer token, sent as `Authorization: Bearer`. Use this instead of apiKey for an
   *  Anthropic-compatible endpoint that authenticates by bearer token (e.g. Z.ai). */
  readonly authToken?: string;
  /** Model id. Defaults to Claude Opus 4.8. For a compatible endpoint, pass its model id. */
  readonly model?: string;
  /** Override the API base URL — the seam for an Anthropic-compatible endpoint (Z.ai). */
  readonly baseURL?: string;
  /** Output cap. 16k keeps a non-streaming request under the SDK's HTTP timeout. */
  readonly maxTokens?: number;
  /** Send `thinking: {type: "adaptive"}` (default true). Turn off for a compatible endpoint
   *  that rejects the Anthropic thinking parameter. */
  readonly adaptiveThinking?: boolean;
}

const DEFAULT_MODEL = "claude-opus-4-8";
const DEFAULT_MAX_TOKENS = 16000;

/** Build a ModelAdapter backed by the Anthropic Messages API (or an Anthropic-compatible
 *  endpoint via baseURL). The governed prompt becomes the system prompt; the task is the
 *  single user message; the reply is the concatenated text blocks (reasoning, when adaptive
 *  thinking is on, lands in separate thinking blocks and is dropped here). */
export function anthropicAdapter(options: AnthropicAdapterOptions = {}): ModelAdapter {
  const model = options.model ?? DEFAULT_MODEL;
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  const adaptiveThinking = options.adaptiveThinking ?? true;
  const client = new Anthropic({
    ...(options.apiKey !== undefined ? { apiKey: options.apiKey } : {}),
    ...(options.authToken !== undefined ? { authToken: options.authToken } : {}),
    ...(options.baseURL !== undefined ? { baseURL: options.baseURL } : {}),
  });

  return {
    id: `anthropic:${model}`,
    async complete(request) {
      const message = await client.messages.create({
        model,
        max_tokens: maxTokens,
        ...(adaptiveThinking ? { thinking: { type: "adaptive" as const } } : {}),
        system: request.system,
        messages: [{ role: "user", content: request.user }],
      });
      return message.content
        .map((block) => (block.type === "text" ? block.text : ""))
        .join("")
        .trim();
    },
  };
}
