// Provider-neutral chat types (OpenAI chat-completions shape, which most providers speak).

export type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

export type ChatMessage =
  | { role: 'system' | 'user'; content: string | ContentPart[] }
  | { role: 'assistant'; content: string | null; tool_calls?: RawToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface RawToolCall { id: string; type: 'function'; function: { name: string; arguments: string } }

export interface ToolCall { id: string; name: string; arguments: string }

export interface ToolSpec {
  type: 'function';
  function: { name: string; description: string; parameters: object };
}

export interface ChatRequest {
  messages: ChatMessage[];
  tools: ToolSpec[];
  signal: AbortSignal;
  /** Ends the stream early without an error; the reply keeps the tool calls already emitted. */
  stop?: AbortSignal;
  /** Fires as soon as each tool call has fully streamed, before the response ends. */
  onToolCall?: (call: ToolCall) => void;
  /** Fires before a failed request is retried. */
  onRetry?: (reason: string, waitMs: number) => void;
}

export interface Usage { input: number; output: number; cached: number }

export interface ChatResponse {
  content: string;
  toolCalls: ToolCall[];
  firstTokenMs: number;
  /** Token counts, when the provider reports them. Missing when the stream was stopped early. */
  usage?: Usage;
  /** `stop` cut the stream short. */
  stopped?: boolean;
}

export interface LLMProvider {
  chat(req: ChatRequest): Promise<ChatResponse>;
}
