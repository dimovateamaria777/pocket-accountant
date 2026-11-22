import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Landmark, Loader2, PlugZap, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { InfoPayConnection } from "@/components/app/InfoPayConnection";
import { syncInfoPay } from "@/lib/infopay.functions";
import {
  disconnectBank,
  getBankConnections,
  listBanks,
  startBankConnection,
  syncBankConnection,
} from "@/lib/banking.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const COUNTRIES = [
  ["BG", "България"],
  ["LT", "Литва (Revolut)"],
  ["DE", "Германия"],
  ["FR", "Франция"],
  ["IT", "Италия"],
  ["ES", "Испания"],
  ["RO", "Румъния"],
  ["GR", "Гърция"],
  ["AT", "Австрия"],
  ["BE", "Белгия"],
  ["NL", "Нидерландия"],
  ["FI", "Финландия"],
  ["SE", "Швеция"],
  ["PL", "Полша"],
] as const;

export function BankConnections() {
  const qc = useQueryClient();
  const [country, setCountry] = useState("BG");
  const [search, setSearch] = useState("");
  const [connecting, setConnecting] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [callbackUrl, setCallbackUrl] = useState("");
  const autoSynced = useRef(new Set<string>());
  const fetchBanks = useServerFn(listBanks);
  const fetchConnections = useServerFn(getBankConnections);
  const beginConnection = useServerFn(startBankConnection);
  const runSync = useServerFn(syncBankConnection);
  const runInfoPaySync = useServerFn(syncInfoPay);
  const runDisconnect = useServerFn(disconnectBank);

  const banks = useQuery({
    queryKey: ["enable-banking-banks", country],
    queryFn: () => fetchBanks({ data: { country } }),
    retry: false,
  });
  const connections = useQuery({
    queryKey: ["bank-connections"],
    queryFn: () => fetchConnections(),
  });

  useEffect(() => {
    setCallbackUrl(`${window.location.origin}/api/public/banking/callback`);
  }, []);

  const sync = useCallback(
    async (connectionId: string, automatic = false) => {
      setSyncing(connectionId);
      try {
        const connection = connections.data?.find((item) => item.id === connectionId);
        const result =
          connection?.provider === "infopay"
            ? await runInfoPaySync({ data: { connectionId } })
            : await runSync({ data: { connectionId } });
        await Promise.all([
          qc.invalidateQueries({ queryKey: ["transactions"] }),
          qc.invalidateQueries({ queryKey: ["bank-connections"] }),
        ]);
        const message = `${result.added} нови плащания; ${result.alreadyKnown} вече записани${result.skipped ? `; ${result.skipped} пропуснати за проверка` : ""}.`;
        if (automatic) toast.message(`Автоматична синхронизация: ${message}`);
        else toast.success(message);
        return result;
      } finally {
        setSyncing(null);
      }
    },
    [connections.data, qc, runInfoPaySync, runSync],
  );

  useEffect(() => {
    const pending = (connections.data ?? []).filter(
      (connection) => !autoSynced.current.has(connection.id),
    );
    if (!pending.length) return;
    for (const connection of pending) autoSynced.current.add(connection.id);
    void (async () => {
      for (const connection of pending) {
        try {
          await sync(connection.id, true);
        } catch (error) {
          toast.error(
            `Автоматичната синхронизация на ${connection.bank_name} не успя: ${(error as Error).message}`,
          );
        }
      }
    })();
  }, [connections.data, sync]);

  async function connect(bankName: string, maximumConsentValidity: number | null) {
    setConnecting(bankName);
    try {
      const result = await beginConnection({
        data: { bankName, bankCountry: country, maximumConsentValidity },
      });
      window.location.assign(result.url);
    } catch (error) {
      toast.error((error as Error).message);
      setConnecting(null);
    }
  }

  async function disconnect(connectionId: string, bankName: string) {
    if (!window.confirm(`Премахване на връзката с ${bankName}? Вече записаните плащания остават.`))
      return;
    try {
      await runDisconnect({ data: { connectionId } });
      await qc.invalidateQueries({ queryKey: ["bank-connections"] });
      toast.success("Банковата връзка е премахната.");
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  const filteredBanks = (banks.data ?? []).filter((bank) =>
    bank.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <InfoPayConnection />
      <section className="rounded-2xl border bg-card p-6">
        <div className="flex items-start gap-3">
          <PlugZap className="mt-1 text-accent" />
          <div>
            <h2 className="font-display text-2xl font-bold">Друга банка чрез Enable Banking</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Разрешението се дава на сайта на банката чрез Enable Banking. Джоб получава само
              четене на сметки и плащания — без банкова парола и без право да нарежда плащания.
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Select
            value={country}
            onValueChange={(value) => {
              setCountry(value);
              setSearch("");
            }}
          >
            <SelectTrigger aria-label="Държава на банката">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COUNTRIES.map(([code, label]) => (
                <SelectItem key={code} value={code}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Търсете Revolut или друга банка…"
            aria-label="Търсене на банка"
          />
        </div>
        {banks.isLoading && (
          <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="animate-spin" /> Зареждане на банките…
          </p>
        )}
        {banks.error && (
          <div className="mt-5 rounded-xl bg-muted p-4 text-sm">
            <p className="font-semibold">Връзката изисква настройка на Enable Banking</p>
            <p className="mt-1 text-muted-foreground">{(banks.error as Error).message}</p>
            <p className="mt-2 text-muted-foreground">
              След добавяне на идентификатора и частния ключ на приложението, списъкът и свързването
              ще се активират тук.
            </p>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-muted-foreground">
              <li>
                Регистрирайте се в{" "}
                <a
                  href="https://enablebanking.com/sign-in/"
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  Enable Banking
                </a>{" "}
                и създайте приложение първо в Sandbox среда.
              </li>
              <li>
                Добавете този разрешен адрес за връщане в приложението на Enable Banking:
                <Input
                  className="mt-2 bg-card font-mono text-xs"
                  value={callbackUrl}
                  readOnly
                  aria-label="Адрес за връщане от Enable Banking"
                  onFocus={(event) => event.target.select()}
                />
              </li>
              <li>
                Изтеглете .pem файла с частния ключ. Ключът се пази само в защитените настройки на
                Джоб и никога не се показва в браузъра.
              </li>
              <li>
                Добавете идентификатора на приложението и ключа в защитените настройки, след което
                се върнете тук.
              </li>
            </ol>
          </div>
        )}
        {!banks.isLoading && !banks.error && (
          <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {filteredBanks.map((bank) => (
              <Button
                key={`${bank.country}-${bank.name}`}
                variant="outline"
                className="h-auto justify-start whitespace-normal px-4 py-3 text-left"
                disabled={!!connecting}
                onClick={() => connect(bank.name, bank.maximumConsentValidity)}
              >
                {connecting === bank.name ? <Loader2 className="animate-spin" /> : <Landmark />}
                <span>{bank.name}</span>
              </Button>
            ))}
            {!filteredBanks.length && (
              <p className="text-sm text-muted-foreground">Няма банка, отговаряща на търсенето.</p>
            )}
          </div>
        )}
      </section>

      <section className="rounded-2xl border bg-card p-6">
        <h2 className="font-display text-xl font-bold">Свързани сметки</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          InfoPay се опреснява и веднъж часово. Всички връзки се синхронизират при отваряне на
          раздела и с бутона за синхронизиране.
        </p>
        <div className="mt-4 space-y-3">
          {(connections.data ?? []).map((connection) => (
            <div
              key={connection.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted p-4"
            >
              <div className="flex items-center gap-3">
                <Building2 className="text-primary" />
                <div>
                  <p className="font-semibold">
                    {connection.bank_name} · {connection.bank_country}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {Array.isArray(connection.accounts) ? connection.accounts.length : 0} сметки
                    {connection.last_synced_at
                      ? ` · последно: ${new Date(connection.last_synced_at).toLocaleString("bg-BG")}`
                      : " · още не е синхронизирано"}
                    {connection.access_valid_until
                      ? ` · достъп до ${new Date(connection.access_valid_until).toLocaleDateString("bg-BG")}`
                      : ""}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={syncing === connection.id}
                  onClick={() =>
                    sync(connection.id).catch((error) => toast.error((error as Error).message))
                  }
                >
                  {syncing === connection.id ? <Loader2 className="animate-spin" /> : <RefreshCw />}{" "}
                  Синхронизирай
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Премахни връзката с ${connection.bank_name}`}
                  onClick={() => disconnect(connection.id, connection.bank_name)}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          ))}
          {!connections.isLoading && !connections.data?.length && (
            <p className="text-sm text-muted-foreground">Още няма свързана банка.</p>
          )}
          {connections.error && (
            <p className="text-sm text-destructive">{(connections.error as Error).message}</p>
          )}
        </div>
      </section>
    </div>
  );
}
