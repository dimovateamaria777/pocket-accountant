import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { FileUp, PieChart, MessageCircleQuestion, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Personal Accountant – личен AI счетоводител за вашите банкови извлечения" },
      { name: "description", content: "Качете извлечение от Revolut, ДСК или друга банка и вижте ясно колко и за какво харчите." },
      { property: "og:title", content: "Personal Accountant – личен AI счетоводител" },
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
    <div className="min-h-screen overflow-hidden bg-background">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <span className="font-display text-2xl font-bold text-primary">Personal Accountant</span>
        <Button asChild variant="ghost"><Link to="/auth">Вход</Link></Button>
      </header>
      <main className="mx-auto max-w-7xl px-6 pb-20">
        <section className="pt-8 lg:pt-14">
          <div className="relative z-10 max-w-3xl">
            <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-accent">Личен AI счетоводител</p>
            <h1 className="font-display text-5xl font-bold leading-[1.08] text-foreground md:text-6xl xl:text-7xl">
              Всичките ви пари. Една ясна картина.
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground lg:mx-0">
              От банковото извлечение до разбираем отговор — Personal Accountant подрежда цифровите ви плащания и показва какво има значение.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3 lg:justify-start">
              <Button asChild size="lg"><Link to="/auth">Започнете безплатно</Link></Button>
              <Button asChild size="lg" variant="outline"><Link to="/privacy">Как пазим данните</Link></Button>
            </div>
            <p className="mt-6 text-sm text-muted-foreground">Сигурно. Разбираемо. Винаги под ваш контрол.</p>
          </div>
        </section>

        <section className="mt-20 grid gap-4 md:grid-cols-4">
          {steps.map((s, i) => (
            <div key={s.title} className="rounded-2xl border bg-card p-6 shadow-sm">
              <span className="font-display text-sm text-muted-foreground">0{i + 1}</span>
              <s.icon className="my-3 h-6 w-6 text-accent" />
              <h3 className="font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
            </div>
          ))}
        </section>
      </main>
      <footer className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 border-t px-6 py-6 text-sm text-muted-foreground">
        <span>Personal Accountant — личен AI счетоводител</span>
        <nav className="flex gap-5" aria-label="Правна информация">
          <Link to="/privacy" className="transition-colors hover:text-foreground">Поверителност</Link>
          <Link to="/terms" className="transition-colors hover:text-foreground">Условия за ползване</Link>
        </nav>
      </footer>
    </div>
  );
}
