import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Условия за ползване – Personal Accountant" },
      {
        name: "description",
        content: "Чернова на условията за ползване на личния AI счетоводител Personal Accountant.",
      },
      { property: "og:title", content: "Условия за ползване – Personal Accountant" },
      {
        property: "og:description",
        content: "Правила за ползване на банковите справки и AI асистента в Personal Accountant.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Terms,
});

function Terms() {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-2xl px-6 py-16">
        <Link to="/" className="font-display text-2xl font-bold text-primary">
          Personal Accountant
        </Link>
        <h1 className="mt-8 font-display text-4xl font-bold">Условия за ползване</h1>
        <p className="mt-3 text-sm text-muted-foreground">Работна чернова · 22 ноември 2026 г.</p>

        <aside className="mt-8 rounded-2xl border border-accent/40 bg-accent/5 p-5">
          <h2 className="font-semibold">Данни за оператора — за попълване</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Преди публикуване на окончателната версия трябва да се добавят: [пълно наименование
            на оператора], [ЕИК/друг идентификатор], [адрес], [имейл за контакт] и [държава и
            приложимо право].
          </p>
        </aside>

        <div className="mt-10 space-y-8">
          <section>
            <h2 className="font-display text-xl font-semibold">1. Приемане и предназначение</h2>
            <p className="mt-2 leading-relaxed text-muted-foreground">
              Създавайки профил или ползвайки „Personal Accountant“, приемате тези условия. Приложението е личен
              помощник за преглед и категоризиране на дигитални банкови плащания; то не е банка,
              счетоводна кантора или доставчик на инвестиционни, данъчни или правни съвети.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold">2. Как работи услугата</h2>
            <p className="mt-2 leading-relaxed text-muted-foreground">
              Можете да качите PDF или CSV извлечение и да потвърдите импорта след преглед или да
              разрешите четене на движения чрез Enable Banking или InfoPay. „Personal Accountant“ показва справки,
              категории и отговори на асистента. Сумите и броят се изчисляват от програмата върху
              записаните транзакции; AI помага за разпознаване, категоризиране и обяснения, но не
              преценява суми и не извършва плащания.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold">3. Вашият профил и данни</h2>
            <p className="mt-2 leading-relaxed text-muted-foreground">
              Пазете достъпа до профила си и качвайте само извлечения, които имате право да
              обработвате. Вие носите отговорност за проверката на разпознатите суми, категории и
              вътрешни преводи. Банковото разрешение е само за четене; достъпът и срокът му зависят
              и от съответната банка или доставчик.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold">4. Точност и наличност</h2>
            <p className="mt-2 leading-relaxed text-muted-foreground">
              Автоматичното разпознаване и категоризиране може да допусне грешка или да пропусне
              ред. Проверявайте важните данни по оригиналното извлечение, преди да вземете решение.
              Не обещаваме непрекъсната наличност или непрекъсната връзка с банки и външни услуги.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold">5. Изтриване и прекратяване</h2>
            <p className="mt-2 leading-relaxed text-muted-foreground">
              Можете да спрете да ползвате услугата по всяко време и да изтриете данните си от
              „Настройки“. Изтриването в „Personal Accountant“ е окончателно. Ако искате да оттеглите и съгласието
              при банката или външния доставчик, направете го и при него. Повече за обработката на
              данни има в <Link to="/privacy" className="text-primary underline underline-offset-4">Политиката за поверителност</Link>.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold">6. Доставчици и техническо съхранение</h2>
            <p className="mt-2 leading-relaxed text-muted-foreground">
              Профилът и данните се обработват чрез Lovable Cloud, а AI функциите — чрез Lovable AI.
              При активирана банкова връзка участват Enable Banking или InfoPay и вашата банка.
              Браузърът пази техническа информация за сесията, избраната тема и състоянието на
              страничното меню, включително чрез локално съхранение и техническа бисквитка.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold">7. Статистика на посещенията</h2>
            <p className="mt-2 leading-relaxed text-muted-foreground">
              Lovable събира тези данни за нас. <a href="https://lovable.dev/privacy" target="_blank" rel="noreferrer" className="text-primary underline underline-offset-4">Политиката за поверителност на Lovable</a> обяснява
              как ги обработва. Статистиката не използва бисквитки, не съхранява нищо на устройството
              на посетителя, не пази IP адреси и не идентифицира посетителите.
            </p>
            <p className="mt-2 leading-relaxed text-muted-foreground">
              За всеки посетител се записват кликове върху бутони и връзки, посетените страници,
              източникът на посещението, държавата, браузърът, операционната система, типът
              устройство, времето на страница, скоростта на зареждане и грешките — без бисквитки и
              без идентифициране. Подробните данни се пазят 90 дни, а дневните обобщения — една година.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold">8. Промени и контакт</h2>
            <p className="mt-2 leading-relaxed text-muted-foreground">
              Можем да обновим условията при промяна на функциите или изискванията към услугата и ще
              публикуваме актуалната версия на тази страница. Въпроси се изпращат на [имейл за контакт].
              Приложимото право и компетентният съд ще бъдат посочени след попълване на данните за оператора.
            </p>
          </section>
        </div>

        <div className="mt-12 border-t pt-6 text-sm text-muted-foreground">
          <Link to="/" className="text-primary underline underline-offset-4">Към началната страница</Link>
        </div>
      </main>
    </div>
  );
}
