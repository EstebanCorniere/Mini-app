export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface SseParseResult {
  /** The complete `data:` payloads of every finished SSE block. */
  events: string[];
  /** The unfinished tail, to prepend to the next chunk. */
  rest: string;
}

/** Splits complete SSE blocks off the front of `buffer`; the partial tail stays for the next chunk. */
export const parseSse = (buffer: string): SseParseResult => {
  const events: string[] = [];
  let rest = buffer;

  for (;;) {
    const end = rest.indexOf("\n\n");
    if (end === -1) break;
    const block = rest.slice(0, end);
    rest = rest.slice(end + 2);
    for (const line of block.split("\n")) {
      if (line.startsWith("data:")) {
        events.push(line.slice(5).trimStart());
      }
    }
  }

  return { events, rest };
};

const errorMessage = async (res: Response): Promise<string> => {
  try {
    const body: unknown = await res.json();
    if (body !== null && typeof body === "object" && "detail" in body && typeof body.detail === "string") {
      return body.detail;
    }
  } catch {
    // Not JSON: fall through to the status line.
  }
  return `Erreur ${res.status} : ${res.statusText}`;
};

/** POSTs the history to `/api/chat` and calls `onDelta` for each streamed token chunk, until `[DONE]`. */
export const streamChat = async (messages: ChatMessage[], onDelta: (text: string) => void): Promise<void> => {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });

  if (!res.ok || !res.body) {
    throw new Error(await errorMessage(res));
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parsed = parseSse(buffer);
    buffer = parsed.rest;
    for (const event of parsed.events) {
      if (event === "[DONE]") return;
      const data = JSON.parse(event) as { text?: unknown };
      if (typeof data.text === "string") {
        onDelta(data.text);
      }
    }
  }
};
