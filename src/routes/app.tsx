import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { txQuery } from "@/components/app/data";
import { Overview } from "@/components/app/Overview";
import { Transactions } from "@/components/app/Transactions";
import { Upload } from "@/components/app/Upload";
import { Chat } from "@/components/app/Chat";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/app")({
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
  const [tab, setTab] = useState("overview");
  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);
  if (!user) return <div className="p-10 text-muted-foreground">Зареждане…</div>;
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link to="/" className="font-display text-2xl font-bold text-primary">Джоб</Link>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="hidden sm:inline">{user.email}</span>
          <Button variant="ghost" size="sm" onClick={() => supabase.auth.signOut()}>Изход</Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 pb-16">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-6 flex-wrap">
            <TabsTrigger value="overview">Табло</TabsTrigger>
            <TabsTrigger value="tx">Транзакции</TabsTrigger>
            <TabsTrigger value="chat">Асистент</TabsTrigger>
            <TabsTrigger value="upload">Качи извлечение</TabsTrigger>
            <TabsTrigger value="settings">Настройки</TabsTrigger>
          </TabsList>
          <Data tab={tab} setTab={setTab} />
        </Tabs>
      </main>
    </div>
  );
}

function Data({ setTab }: { tab: string; setTab: (t: string) => void }) {
  const { data: txs = [], isLoading } = useQuery(txQuery);
  const empty = !isLoading && txs.length === 0;
  const Empty = (
    <div className="rounded-2xl border bg-card p-10 text-center">
      <p className="font-display text-2xl font-bold">Още няма данни</p>
      <p className="mt-2 text-muted-foreground">Качете първото си банково извлечение, за да видите къде отиват парите.</p>
      <Button className="mt-4" onClick={() => setTab("upload")}>Качи извлечение</Button>
    </div>
  );
  return (
    <>
      <TabsContent value="overview">{empty ? Empty : <Overview txs={txs} />}</TabsContent>
      <TabsContent value="tx">{empty ? Empty : <Transactions txs={txs} />}</TabsContent>
      <TabsContent value="chat"><Chat /></TabsContent>
      <TabsContent value="upload"><Upload onDone={() => setTab("overview")} /></TabsContent>
      <TabsContent value="settings"><Settings /></TabsContent>
    </>
  );
}

function Settings() {
  const qc = useQueryClient();
  async function wipe() {
    for (const t of ["transactions", "statements", "merchant_rules"] as const) {
      const { error } = await supabase.from(t).delete().not("id", "is", null);
      if (error) { toast.error(error.message); return; }
    }
    await qc.invalidateQueries();
    toast.success("Всичките ви данни са изтрити.");
  }
  return (
    <div className="max-w-xl space-y-4 rounded-2xl border bg-card p-6">
      <h2 className="font-display text-xl font-bold">Вашите данни</h2>
      <p className="text-sm text-muted-foreground">Само вие виждате плащанията си. Асистентът може само да ги чете. <Link to="/privacy" className="underline">Политика за поверителност</Link></p>
      <AlertDialog>
        <AlertDialogTrigger asChild><Button variant="destructive">Изтрий всичките ми данни</Button></AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Сигурни ли сте?</AlertDialogTitle>
            <AlertDialogDescription>Ще изтрием всички плащания, извлечения и запомнени категории. Това не може да се върне.</AlertDialogDescription>
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
