import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageCircleQuestion, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { txQuery } from "@/components/app/data";
import { Overview } from "@/components/app/Overview";
import { Transactions } from "@/components/app/Transactions";
import { Upload } from "@/components/app/Upload";
import { Chat } from "@/components/app/Chat";
import { CategoryManager } from "@/components/app/CategoryManager";
import { BankConnections } from "@/components/app/BankConnections";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DEFAULT_TRANSACTION_VIEW,
  applyTransactionViewPatch,
  type TransactionView,
  type TransactionViewPatch,
} from "@/lib/transaction-view";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/app")({
  validateSearch: (search: Record<string, unknown>): { tab?: string; bank?: string } => ({
    ...(typeof search["tab"] === "string" ? { tab: search["tab"] } : {}),
    ...(typeof search["bank"] === "string" ? { bank: search["bank"] } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Моите финанси – Джоб" },
      { name: "description", content: "Табло с разходите и доходите ви по категории." },
      { property: "og:title", content: "Моите финанси – Джоб" },
      { property: "og:description", content: "Табло с разходите и доходите ви по категории." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AppPage,
});

function AppPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [tab, setTab] = useState(
    ["overview", "tx", "upload", "banking", "settings"].includes(search.tab ?? "")
      ? search.tab!
      : "overview",
  );
  const [chatOpen, setChatOpen] = useState(false);
  const [txView, setTxView] = useState<TransactionView>({ ...DEFAULT_TRANSACTION_VIEW, hiddenCategories: [] });

  const applyAssistantView = useCallback((patch: TransactionViewPatch) => {
    setTxView((current) => applyTransactionViewPatch(current, patch));
    setTab("tx");
  }, []);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);
  useEffect(() => {
    if (search.bank === "connected")
      toast.success("Банката е свързана. Започва първото синхронизиране.");
    if (search.bank === "cancelled")
      toast.message("Свързването е отказано. Не е записано разрешение.");
    if (search.bank === "error") toast.error("Свързването не завърши. Опитайте отново.");
  }, [search.bank]);
  useEffect(() => {
    if (!chatOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setChatOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [chatOpen]);

  if (!user) return <div className="p-10 text-muted-foreground">Зареждане…</div>;
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link to="/" className="font-display text-2xl font-bold text-primary">
          Джоб
        </Link>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="hidden sm:inline">{user.email}</span>
          <Button variant="ghost" size="sm" onClick={() => supabase.auth.signOut()}>
            Изход
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 pb-24">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-6 flex-wrap">
            <TabsTrigger value="overview">Табло</TabsTrigger>
            <TabsTrigger value="tx">Транзакции</TabsTrigger>
            <TabsTrigger value="upload">Качи извлечение</TabsTrigger>
            <TabsTrigger value="banking">Свържи банка</TabsTrigger>
            <TabsTrigger value="settings">Настройки</TabsTrigger>
          </TabsList>
          <Data setTab={setTab} txView={txView} onTxViewChange={setTxView} />
        </Tabs>
      </main>

      <div
        role="dialog"
        aria-modal="false"
        aria-label="Финансов асистент"
        className={
          chatOpen
            ? "fixed inset-x-3 bottom-24 top-20 z-50 flex flex-col overflow-hidden rounded-3xl border bg-card shadow-2xl sm:inset-auto sm:bottom-24 sm:right-6 sm:h-[min(640px,calc(100dvh-8rem))] sm:w-[400px]"
            : "hidden"
        }
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="font-display text-lg font-bold">Вашият асистент</h2>
            <p className="text-xs text-muted-foreground">Смята от реалните ви записи</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setChatOpen(false)}
            aria-label="Затвори асистента"
          >
            <X />
          </Button>
        </div>
        <div className="min-h-0 flex-1">
          <Chat active={chatOpen} onTransactionView={applyAssistantView} />
        </div>
      </div>

      {!chatOpen && (
        <Button
          size="lg"
          onClick={() => setChatOpen(true)}
          aria-expanded={chatOpen}
          className="fixed bottom-5 right-5 z-50 h-14 rounded-full px-5 shadow-xl"
        >
          <MessageCircleQuestion />
          Асистент
        </Button>
      )}
    </div>
  );
}

function Data({
  setTab,
  txView,
  onTxViewChange,
}: {
  setTab: (t: string) => void;
  txView: TransactionView;
  onTxViewChange: (view: TransactionView) => void;
}) {
  const { data: txs = [], isLoading } = useQuery(txQuery);
  const empty = !isLoading && txs.length === 0;
  const Empty = (
    <div className="rounded-2xl border bg-card p-10 text-center">
      <p className="font-display text-2xl font-bold">Още няма данни</p>
      <p className="mt-2 text-muted-foreground">
        Качете първото си банково извлечение, за да видите къде отиват парите.
      </p>
      <Button className="mt-4" onClick={() => setTab("upload")}>
        Качи извлечение
      </Button>
    </div>
  );
  return (
    <>
      <TabsContent value="overview">{empty ? Empty : <Overview txs={txs} />}</TabsContent>
      <TabsContent value="tx">
        {empty ? Empty : <Transactions txs={txs} view={txView} onViewChange={onTxViewChange} />}
      </TabsContent>
      <TabsContent value="upload">
        <Upload onDone={() => setTab("overview")} />
      </TabsContent>
      <TabsContent value="banking">
        <BankConnections />
      </TabsContent>
      <TabsContent value="settings" className="space-y-6">
        <CategoryManager />
        <Settings />
      </TabsContent>
    </>
  );
}

function Settings() {
  const qc = useQueryClient();
  async function wipe() {
    for (const t of [
      "transactions",
      "bank_connection_attempts",
      "bank_connections",
      "statements",
      "merchant_rules",
      "category_rules",
      "custom_categories",
    ] as const) {
      const { error } = await supabase.from(t).delete().not("id", "is", null);
      if (error) {
        toast.error(error.message);
        return;
      }
    }
    await qc.invalidateQueries();
    toast.success("Всичките ви данни са изтрити.");
  }
  return (
    <div className="max-w-xl space-y-4 rounded-2xl border bg-card p-6">
      <h2 className="font-display text-xl font-bold">Вашите данни</h2>
      <p className="text-sm text-muted-foreground">
        Само вие виждате плащанията си. Асистентът може само да ги чете.{" "}
        <Link to="/privacy" className="underline">
          Политика за поверителност
        </Link>
      </p>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive">Изтрий всичките ми данни</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Сигурни ли сте?</AlertDialogTitle>
            <AlertDialogDescription>
              Ще изтрием всички плащания, извлечения, категории и правила. Това не може да се върне.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отказ</AlertDialogCancel>
            <AlertDialogAction onClick={wipe}>Изтрий всичко</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
