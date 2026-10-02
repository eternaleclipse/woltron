/**
 * Minimal OpenRouter chat-completions client with JSON-mode + robust JSON extraction.
 */
import { FALLBACK_MODEL } from './config.js';
import { HttpError } from './errors.js';

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  json?: boolean;
  timeoutMs?: number;
  maxTokens?: number;
  temperature?: number;
  fetchImpl?: typeof fetch;
}

export interface ChatResult {
  content: string;
  model: string;
  /** finish_reason was "length" (reasoning models can burn the budget before answering) */
  truncated?: boolean;
}

/** Pull the first JSON object/array out of an LLM reply (handles ```json fences and chatter). */
export function extractJson<T = unknown>(text: string): T {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    /* fall through */
  }
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    try {
      return JSON.parse(fence[1]!.trim()) as T;
    } catch {
      /* fall through */
    }
  }
  // Scan for a balanced {...} or [...] block.
  for (let start = 0; start < trimmed.length; start++) {
    const ch = trimmed[start];
    if (ch !== '{' && ch !== '[') continue;
    const close = ch === '{' ? '}' : ']';
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < trimmed.length; i++) {
      const c = trimmed[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === ch) depth++;
      else if (c === close && --depth === 0) {
        try {
          return JSON.parse(trimmed.slice(start, i + 1)) as T;
        } catch {
          break;
        }
      }
    }
  }
  throw new Error('LLM reply did not contain valid JSON');
}

async function callOnce(opts: ChatOptions, model: string): Promise<ChatResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 30_000);
  try {
    const res = await (opts.fetchImpl ?? fetch)(OPENROUTER_URL, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/woltron/woltron',
        'X-Title': 'Woltron',
      },
      body: JSON.stringify({
        model,
        messages: opts.messages,
        temperature: opts.temperature ?? 0.2,
        max_tokens: opts.maxTokens ?? 1500,
        ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      let msg = text.slice(0, 300);
      try {
        msg = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? msg;
      } catch {
        /* keep raw */
      }
      const code = res.status === 401 || res.status === 403 ? 'llm_unauthorized' : res.status === 429 ? 'llm_rate_limited' : 'llm_error';
      throw new HttpError(res.status === 401 || res.status === 403 ? 401 : 502, code, `OpenRouter: ${msg}`);
    }
    const body = JSON.parse(text) as {
      model?: string;
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
      error?: { message?: string };
    };
    if (body.error) throw new HttpError(502, 'llm_error', `OpenRouter: ${body.error.message}`);
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new HttpError(502, 'llm_error', 'OpenRouter returned an empty reply');
    return { content, model: body.model ?? model, truncated: body.choices?.[0]?.finish_reason === 'length' };
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new HttpError(504, 'llm_timeout', `The LLM took longer than ${Math.round((opts.timeoutMs ?? 30_000) / 1000)}s`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Chat completion; retries once with a fallback model if the configured one is rejected. */
export async function chat(opts: ChatOptions): Promise<ChatResult> {
  try {
    return await callOnce(opts, opts.model);
  } catch (e) {
    const bad = e instanceof HttpError && e.code === 'llm_error' && /model|not a valid|not found|no endpoints/i.test(e.message);
    if (bad && opts.model !== FALLBACK_MODEL) return callOnce(opts, FALLBACK_MODEL);
    throw e;
  }
}

export async function chatJson<T>(opts: ChatOptions): Promise<{ data: T; model: string }> {
  const r = await chat({ ...opts, json: true });
  try {
    return { data: extractJson<T>(r.content), model: r.model };
  } catch (e) {
    if (!r.truncated) throw e;
    // Ran out of tokens (often hidden reasoning) — retry once with a much bigger budget.
    const again = await chat({ ...opts, json: true, maxTokens: (opts.maxTokens ?? 1500) * 3 });
    return { data: extractJson<T>(again.content), model: again.model };
  }
}
