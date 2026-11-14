import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import { streamChat } from "./chat-stream";
import type { ChatMessage } from "./chat-stream";

export const Chat = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;

    const history: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    setError(null);

    try {
      await streamChat(history, (delta) => {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last === undefined) return prev;
          return [...prev.slice(0, -1), { ...last, content: last.content + delta }];
        });
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "La requête a échoué.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-dvh w-full items-center justify-center p-4 sm:p-8">
      <div className="flex h-[88dvh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white/95 shadow-2xl ring-1 ring-black/10 backdrop-blur">
        <header className="border-b-4 border-rouge bg-turquoise px-6 py-4">
          <h1 className="text-2xl font-bold text-white drop-shadow-sm">Mini-app</h1>
          <p className="text-sm text-teal-50">Agent conversationnel Mistral — discutez ci-dessous.</p>
        </header>

        <section className="flex flex-1 flex-col gap-4 overflow-y-auto bg-red-50/50 px-4 py-6 sm:px-6">
          {messages.length === 0 && (
            <p className="my-auto rounded-2xl bg-white/80 px-6 py-4 text-center text-sm text-gray-500 shadow-sm">
              Envoyez un message pour démarrer la conversation.
            </p>
          )}
          {messages.map((message, index) => (
            <div key={index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm shadow-sm ${
                  message.role === "user"
                    ? "bg-turquoise-fonce text-white"
                    : "bg-white text-gray-900 ring-1 ring-rouge/25"
                }`}
              >
                {message.content || (message.role === "assistant" && busy ? "…" : "")}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </section>

        {error && (
          <p
            className="mx-4 mt-2 rounded-lg bg-rouge/10 px-4 py-2 text-sm font-medium text-rouge-fonce ring-1 ring-rouge/30"
            role="alert"
          >
            {error}
          </p>
        )}

        <form onSubmit={send} className="flex gap-2 border-t border-turquoise/40 bg-white px-4 py-4">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Votre message…"
            aria-label="Votre message"
            className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm outline-none focus:border-turquoise-fonce focus:ring-2 focus:ring-turquoise"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="rounded-xl bg-rouge px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rouge-fonce disabled:opacity-40"
          >
            {busy ? "Envoi…" : "Envoyer"}
          </button>
        </form>
      </div>
    </main>
  );
};
