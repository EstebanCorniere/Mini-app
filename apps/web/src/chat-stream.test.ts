import { describe, expect, it, mock } from "bun:test";

import { parseSse, streamChat } from "./chat-stream";

describe("parseSse", () => {
  it("returns only complete blocks and keeps the partial tail", () => {
    const { events, rest } = parseSse('data: {"text":"a"}\n\ndata: {"te');

    expect(events).toEqual(['{"text":"a"}']);
    expect(rest).toBe('data: {"te');
  });

  it("reads every data line of one block", () => {
    const { events, rest } = parseSse("data: x\ndata: y\n\n");

    expect(events).toEqual(["x", "y"]);
    expect(rest).toBe("");
  });
});

describe("streamChat", () => {
  const withFetch = async (impl: () => Promise<Response>, run: () => Promise<void>): Promise<void> => {
    const original = globalThis.fetch;
    globalThis.fetch = mock(impl) as unknown as typeof fetch;
    try {
      await run();
    } finally {
      globalThis.fetch = original;
    }
  };

  it("streams deltas until [DONE]", async () => {
    const payload = 'data: {"text":"Bonjour"}\n\ndata: {"text":" !"}\n\ndata: [DONE]\n\n';
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(payload));
        controller.close();
      },
    });

    const deltas: string[] = [];
    await withFetch(
      async () => new Response(stream, { status: 200 }),
      () => streamChat([{ role: "user", content: "salut" }], (delta) => deltas.push(delta)),
    );

    expect(deltas).toEqual(["Bonjour", " !"]);
  });

  it("rejects with the server's detail message on error", async () => {
    await withFetch(
      async () =>
        new Response(JSON.stringify({ detail: "aucune clé configurée" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }),
      async () => {
        await expect(streamChat([{ role: "user", content: "x" }], () => {})).rejects.toThrow(
          "aucune clé configurée",
        );
      },
    );
  });
});
