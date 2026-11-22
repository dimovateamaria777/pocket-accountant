import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Landmark, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { connectInfoPayAccount } from "@/lib/infopay.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function InfoPayConnection() {
  const qc = useQueryClient();
  const connect = useServerFn(connectInfoPayAccount);
  const [uniqueId, setUniqueId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [connecting, setConnecting] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setConnecting(true);
    try {
      const result = await connect({ data: { uniqueId: uniqueId.trim(), accessToken: accessToken.trim() } });
      setUniqueId("");
      setAccessToken("");
      await qc.invalidateQueries({ queryKey: ["bank-connections"] });
      toast.success(`InfoPay е свързан: ${result.accounts} сметки. Започва първото четене на движенията.`);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setConnecting(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-6">
      <div className="flex items-start gap-3">
        <Landmark className="mt-1 text-accent" />
        <div>
          <h2 className="font-display text-2xl font-bold">InfoPay от Борика</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Движенията по сметките с активно съгласие се четат автоматично, без качване на файл.
            Джоб използва само права за достъп, баланси и движения — не и за преводи.
          </p>
        </div>
      </div>

      <ol className="mt-5 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
        <li>
          Регистрирайте се в{" "}
          <a href="https://www.infopay.bg/" target="_blank" rel="noreferrer" className="underline">
            InfoPay
          </a>{" "}
          чрез видеоидентификация, електронен подпис или в офис на Борика.
        </li>
        <li>Изберете „Добави ново съгласие“ и го потвърдете в онлайн банкирането на банката си.</li>
        <li>
          Отворете „Административен панел“ → „ERP интеграция“ → „Нова ERP интеграция“. Дайте права
          „Достъп“, „Баланси“ и „Движения“, без „Преводи“.
        </li>
        <li>Поставете показаните Unique ID и AccessToken по-долу.</li>
      </ol>
      <p className="mt-4 rounded-xl bg-muted p-3 text-xs text-muted-foreground">
        ERP достъпът е отделна услуга на Борика и може да изисква бизнес профил и допълнително
        таксуване. Ако не виждате менюто в личния си профил, поискайте достъп от Борика.
      </p>

      <form className="mt-5 grid gap-3 sm:grid-cols-2" onSubmit={submit}>
        <Input
          value={uniqueId}
          onChange={(event) => setUniqueId(event.target.value)}
          placeholder="Unique ID"
          aria-label="InfoPay Unique ID"
          autoComplete="off"
          required
        />
        <Input
          value={accessToken}
          onChange={(event) => setAccessToken(event.target.value)}
          placeholder="AccessToken"
          aria-label="InfoPay AccessToken"
          type="password"
          autoComplete="off"
          required
        />
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={connecting || !uniqueId.trim() || !accessToken.trim()}>
            {connecting ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
            {connecting ? "Свързване…" : "Свържи InfoPay"}
          </Button>
          <span className="text-xs text-muted-foreground">
            Двете стойности се пазят шифровани и не се показват отново.
          </span>
        </div>
      </form>
    </section>
  );
}
