import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Calculator, ListFilter, Send } from "lucide-react";
import { authHeaders } from "@/hooks/use-auth";
import { RuleCard } from "./RuleCard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { TransactionViewPatch } from "@/lib/transaction-view";

type AnswerList = { from: string | null; to: string | null; category: string | null; merchant: string | null; scope: "spending" | "income" };
type Proposal = { pattern: string; category: string; is_new_category: boolean; matching_count: number };

const SUGGESTIONS = [
  "Колко похарчих за храна този месец?",
  "Скрий категория Инвестиции от списъка",
  "Подреди разходите по големина на сумата",
];

export function Chat({
  active = true,
  onTransactionView,
}: {
  active?: boolean;
  onTransactionView: (patch: TransactionViewPatch) => void;
}) {
  const [input, setInput] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const appliedViewTool = useRef<string | null>(null);
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat", headers: authHeaders }),
  });
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (active && !busy) ref.current?.focus();
  }, [active, busy]);

  useEffect(() => {
    const viewTools = messages.flatMap((message) =>
      message.parts.map((part, index) => ({ message, part, key: `${message.id}:${index}` })),
    ).filter(({ part }) =>
      part.type === "tool-set_transaction_view" && "state" in part && part.state === "output-available",
    );
    const latest = viewTools.at(-1);
    if (!latest || appliedViewTool.current === latest.key) return;
    appliedViewTool.current = latest.key;
    const output = (latest.part as unknown as { output: TransactionViewPatch }).output;
    onTransactionView(output);
  }, [messages, onTransactionView]);

  function send(text: string) {
    if (!text.trim() || busy) return;
    sendMessage({ text });
    setInput("");
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="py-6 text-center text-muted-foreground">
            <Calculator className="mx-auto h-8 w-8 text-accent" />
            <p className="mt-3 text-sm">Питайте за парите си. Сумите се смятат точно от вашите плащания.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => <Button key={s} variant="outline" size="sm" onClick={() => send(s)}>{s}</Button>)}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
            <div className={m.role === "user" ? "max-w-[85%] rounded-2xl bg-primary px-4 py-2 text-primary-foreground" : "max-w-[95%] whitespace-pre-wrap text-sm"}>
              {m.parts.map((p, i) => {
                if (p.type === "text") return <span key={i}>{p.text.split(/\*\*(.+?)\*\*/g).map((seg, j) => (j % 2 ? <b key={j}>{seg}</b> : seg))}</span>;
                if (p.type === "tool-propose_rule" && "state" in p && p.state === "output-available")
                  return <RuleCard key={i} proposal={(p as unknown as { output: Proposal }).output} />;
                if (p.type === "tool-set_transaction_view") {
                  const done = "state" in p && p.state === "output-available";
                  return (
                    <div key={i} className="my-2 flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-xs">
                      <ListFilter className="h-4 w-4 shrink-0 text-accent" />
                      {done ? "Изгледът в „Транзакции“ е обновен. Записите не са променени." : "Настройвам изгледа…"}
                    </div>
                  );
                }
                if ((p.type === "tool-spending" || p.type === "tool-income") && "state" in p && p.state === "output-available") {
                  const out = (p as unknown as { output: { count: number; list: AnswerList } }).output;
                  return (
                    <Button
                      key={i}
                      variant="outline"
                      size="sm"
                      className="my-2"
                      onClick={() => onTransactionView({ set_filter: true, ...out.list })}
                    >
                      <ListFilter className="h-4 w-4" /> Покажи записите зад отговора ({out.count})
                    </Button>
                  );
                }
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
        <Textarea ref={ref} rows={1} value={input} placeholder="Напр. колко похарчих за транспорт?"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
          className="min-h-10 resize-none" />
        <Button type="submit" size="icon" disabled={busy} aria-label="Изпрати"><Send /></Button>
      </form>
    </div>
  );
}
