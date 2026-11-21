import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { FileUp, PieChart, MessageCircleQuestion, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Джоб – личен AI счетоводител за вашите банкови извлечения" },
      { name: "description", content: "Качете извлечение от Revolut, ДСК или друга банка и вижте ясно колко и за какво харчите." },
      { property: "og:title", content: "Джоб – личен AI счетоводител" },
      { property: "og:description", content: "Ясна картина на разходите ви, без финансово образование." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const steps = [
  { icon: FileUp, title: "Качвате извлечение", text: "PDF или CSV от Revolut, ДСК, ОББ и др." },
  { icon: PieChart, title: "Виждате къде отиват парите", text: "Автоматични категории и ясни графики." },
  { icon: MessageCircleQuestion, title: "Питате асистента", text: "„Колко похарчих за храна през октомври?“" },
  { icon: ShieldCheck, title: "Вие контролирате данните", text: "Само вие ги виждате и можете да изтриете всичко." },
];

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="font-display text-2xl font-bold text-primary">Джоб</span>
        <Button asChild variant="ghost"><Link to="/auth">Вход</Link></Button>
      </header>
      <main className="mx-auto max-w-6xl px-6 pb-20 pt-10">
        <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-accent">Личен AI счетоводител</p>
        <h1 className="max-w-3xl font-display text-5xl font-bold leading-tight text-foreground md:text-7xl">
          Знайте точно къде отиват парите ви.
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          Качете банково извлечение и Джоб подрежда всяко плащане по категории. Без таблици и без финансово образование.
        </p>
        <div className="mt-8 flex gap-3">
          <Button asChild size="lg"><Link to="/auth">Започнете безплатно</Link></Button>
          <Button asChild size="lg" variant="outline"><Link to="/privacy">Как пазим данните</Link></Button>
        </div>
        <div className="mt-20 grid gap-4 md:grid-cols-4">
          {steps.map((s, i) => (
            <div key={s.title} className="rounded-2xl border bg-card p-6">
              <span className="font-display text-sm text-muted-foreground">0{i + 1}</span>
              <s.icon className="my-3 h-6 w-6 text-accent" />
              <h3 className="font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
