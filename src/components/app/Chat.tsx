import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Calculator, Send } from "lucide-react";
import { authHeaders } from "@/hooks/use-auth";
import { RuleCard } from "./RuleCard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Proposal = { pattern: string; category: string; is_new_category: boolean; matching_count: number };

const SUGGESTIONS = ["Колко похарчих за храна този месец?", "За какво харча най-много?", "Колко съм дал в Lidl общо?"];

export function Chat() {
  const [input, setInput] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat", headers: authHeaders }),
  });
  const busy = status === "submitted" || status === "streaming";
  useEffect(() => { if (!busy) ref.current?.focus(); }, [busy]);

  function send(text: string) {
    if (!text.trim() || busy) return;
    sendMessage({ text });
    setInput("");
  }

  return (
    <div className="flex h-[70vh] flex-col rounded-2xl border bg-card">
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {messages.length === 0 && (
          <div className="text-center text-muted-foreground">
            <Calculator className="mx-auto h-8 w-8 text-accent" />
            <p className="mt-2">Питайте за парите си. Сумите се смятат точно от вашите плащания.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => <Button key={s} variant="outline" size="sm" onClick={() => send(s)}>{s}</Button>)}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
            <div className={m.role === "user" ? "max-w-[80%] rounded-2xl bg-primary px-4 py-2 text-primary-foreground" : "max-w-[90%] whitespace-pre-wrap"}>
              {m.parts.map((p, i) => {
                if (p.type === "text") return <span key={i}>{p.text}</span>;
                if (p.type === "tool-propose_rule" && "state" in p && p.state === "output-available")
                  return <RuleCard key={i} proposal={(p as unknown as { output: Proposal }).output} />;
                if (p.type.startsWith("tool-")) return <div key={i} className="my-1 text-xs text-muted-foreground">🧮 Пресмятам от записите…</div>;
                return null;
              })}
            </div>
          </div>
        ))}
        {status === "submitted" && <p className="text-sm text-muted-foreground">Мисля…</p>}
        {error && <p className="text-sm text-destructive">{error.message}</p>}
      </div>
      <form className="flex gap-2 border-t p-3" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <Textarea ref={ref} autoFocus rows={1} value={input} placeholder="Напр. колко похарчих за транспорт през октомври?"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
          className="min-h-10 resize-none" />
        <Button type="submit" size="icon" disabled={busy} aria-label="Изпрати"><Send /></Button>
      </form>
    </div>
  );
}
