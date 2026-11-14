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
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col p-4 sm:p-8">
      <header className="border-b border-gray-200 pb-4">
        <h1 className="text-2xl font-semibold">Mini-app</h1>
        <p className="text-sm text-gray-500">Agent conversationnel Mistral — discutez ci-dessous.</p>
      </header>

      <section className="flex flex-1 flex-col gap-4 overflow-y-auto py-6">
        {messages.length === 0 && (
          <p className="my-auto text-center text-sm text-gray-400">
            Envoyez un message pour démarrer la conversation.
          </p>
        )}
        {messages.map((message, index) => (
          <div key={index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${
                message.role === "user" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-900"
              }`}
            >
              {message.content || (message.role === "assistant" && busy ? "…" : "")}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </section>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      <form onSubmit={send} className="flex gap-2 border-t border-gray-200 pt-4">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Votre message…"
          aria-label="Votre message"
          className="flex-1 rounded-xl border border-gray-300 px-4 py-2 text-sm outline-none focus:border-gray-500"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {busy ? "Envoi…" : "Envoyer"}
        </button>
      </form>
    </main>
  );
};
