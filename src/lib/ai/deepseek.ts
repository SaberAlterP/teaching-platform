import "server-only";

// DeepSeek Chat Completions（OpenAI 兼容格式）的流式调用。
// 思考模式下带 tools 的请求，之前每一轮的 reasoning_content 都要原样传回，否则接口报 400。

export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

export type ApiMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; reasoning_content?: string; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type ToolDef = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export type Usage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
};

export type StreamResult = {
  content: string;
  reasoning: string;
  toolCalls: ToolCall[];
  finishReason: string;
  usage: Usage;
};

export type StreamHandlers = {
  onReasoning?: (delta: string) => void;
  onContent?: (delta: string) => void;
  onToolDelta?: (name: string, argChars: number) => void;
};

export class AiError extends Error {
  constructor(message: string, public retry = false) {
    super(message);
  }
}

export async function streamChat(
  opts: {
    baseUrl: string;
    apiKey: string;
    model: string;
    thinking: boolean;
    messages: ApiMessage[];
    tools?: ToolDef[];
    maxTokens?: number;
    signal?: AbortSignal;
  },
  h: StreamHandlers = {},
): Promise<StreamResult> {
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: opts.maxTokens ?? 65536,
    thinking: { type: opts.thinking ? "enabled" : "disabled" },
  };
  if (opts.thinking) body.reasoning_effort = "high";
  if (opts.tools?.length) body.tools = opts.tools;

  let res: Response;
  try {
    res = await fetch(`${opts.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (e) {
    if (opts.signal?.aborted) throw e;
    throw new AiError(`连接 DeepSeek 失败：${(e as Error).message}`, true);
  }
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    let msg = text.slice(0, 300);
    try {
      msg = JSON.parse(text)?.error?.message ?? msg;
    } catch {}
    if (res.status === 401) throw new AiError("DeepSeek 密钥无效，请在“设置”里重新填写");
    if (res.status === 402) throw new AiError("DeepSeek 账户余额不足，请先充值");
    if (res.status === 429) throw new AiError("DeepSeek 请求太频繁，稍后重试", true);
    if (res.status >= 500) throw new AiError(`DeepSeek 服务暂时出错（${res.status}）`, true);
    throw new AiError(`DeepSeek 返回错误（${res.status}）：${msg}`);
  }

  const out: StreamResult = { content: "", reasoning: "", toolCalls: [], finishReason: "", usage: {} };
  const decoder = new TextDecoder();
  const reader = res.body.getReader();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      let chunk: {
        choices?: {
          delta?: {
            content?: string | null;
            reasoning_content?: string | null;
            tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[];
          };
          finish_reason?: string | null;
        }[];
        usage?: Usage;
      };
      try {
        chunk = JSON.parse(data);
      } catch {
        continue;
      }
      if (chunk.usage) out.usage = chunk.usage;
      const c = chunk.choices?.[0];
      if (!c) continue;
      const d = c.delta ?? {};
      if (d.reasoning_content) {
        out.reasoning += d.reasoning_content;
        h.onReasoning?.(d.reasoning_content);
      }
      if (d.content) {
        out.content += d.content;
        h.onContent?.(d.content);
      }
      for (const tc of d.tool_calls ?? []) {
        const cur = (out.toolCalls[tc.index] ??= { id: "", type: "function", function: { name: "", arguments: "" } });
        if (tc.id) cur.id = tc.id;
        if (tc.function?.name) cur.function.name += tc.function.name;
        if (tc.function?.arguments) cur.function.arguments += tc.function.arguments;
        h.onToolDelta?.(cur.function.name, cur.function.arguments.length);
      }
      if (c.finish_reason) out.finishReason = c.finish_reason;
    }
  }
  out.toolCalls = out.toolCalls.filter(Boolean).map((t, i) => ({ ...t, id: t.id || `call_${Date.now()}_${i}` }));
  return out;
}
