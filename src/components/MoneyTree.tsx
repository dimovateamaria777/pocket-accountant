import { useState } from "react";
import { Sprout } from "lucide-react";
import { cn } from "@/lib/utils";

const categories = [
  { id: "food", name: "Храна", x: 17, y: 17, description: "Хранителни магазини, ресторанти, кафенета и доставка на храна." },
  { id: "home", name: "Дом и сметки", x: 48, y: 9, description: "Наем, ток, вода, отопление, интернет и всичко за дома." },
  { id: "transport", name: "Транспорт", x: 79, y: 18, description: "Гориво, градски транспорт, таксита, влакове и самолетни билети." },
  { id: "health", name: "Здраве", x: 87, y: 40, description: "Аптеки, лекарски прегледи, изследвания и грижа за здравето." },
  { id: "leisure", name: "Свободно време", x: 55, y: 34, description: "Кино, спорт, абонаменти, пътувания и лични удоволствия." },
  { id: "investments", name: "Инвестиции", x: 20, y: 41, description: "Покупки на акции, криптовалути и други инвестиционни активи." },
] as const;

const branchPaths: Record<(typeof categories)[number]["id"], string> = {
  food: "M500 590 C470 475 340 350 170 145",
  home: "M500 590 C510 430 500 255 480 85",
  transport: "M500 590 C545 450 665 310 790 150",
  health: "M500 590 C610 500 745 430 870 330",
  leisure: "M500 590 C520 500 535 395 550 280",
  investments: "M500 590 C420 505 310 435 200 340",
};

const roots = [
  { name: "Revolut", x: 12, y: 88 },
  { name: "ДСК", x: 37, y: 92 },
  { name: "ОББ", x: 64, y: 92 },
  { name: "Друга банка", x: 88, y: 88 },
];

export function MoneyTree() {
  const [selected, setSelected] = useState<(typeof categories)[number]["id"]>("food");
  const active = categories.find((category) => category.id === selected) ?? categories[0];

  return (
    <div className="w-full">
      <div className="relative mx-auto aspect-[4/5] w-full max-w-[640px] sm:aspect-[5/4]">
        <svg viewBox="0 0 1000 800" className="absolute inset-0 h-full w-full" aria-hidden="true">
          <path
            d="M110 310 C60 170 210 45 360 85 C460 -5 650 20 700 105 C875 75 960 230 875 355 C930 465 760 535 635 480 C510 565 350 520 290 450 C170 480 75 415 110 310Z"
            fill="var(--secondary)"
            opacity="0.58"
          />
          <path
            d="M440 675 C465 590 455 500 470 410 C480 350 475 285 490 225 C505 320 525 365 525 430 C525 510 520 595 560 675Z"
            fill="var(--primary)"
            opacity="0.13"
          />
          {categories.map((category) => (
            <path
              key={category.id}
              d={branchPaths[category.id]}
              fill="none"
              stroke={selected === category.id ? "var(--accent)" : "var(--primary)"}
              strokeWidth={selected === category.id ? 12 : 8}
              strokeLinecap="round"
              opacity={selected === category.id ? 1 : 0.55}
              className="transition-all duration-300"
            />
          ))}
          <path d="M495 655 C420 700 285 700 120 710 M505 660 C460 730 410 735 370 742 M515 660 C555 725 610 735 640 742 M525 655 C620 700 745 690 880 710" fill="none" stroke="var(--primary)" strokeWidth="9" strokeLinecap="round" opacity="0.5" />
          <path d="M95 755 C300 735 705 735 910 755" fill="none" stroke="var(--border)" strokeWidth="3" strokeLinecap="round" />
        </svg>

        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => setSelected(category.id)}
            aria-pressed={selected === category.id}
            className={cn(
              "absolute w-[25%] -translate-x-1/2 -translate-y-1/2 rounded-full border px-1.5 py-2 text-[10px] font-semibold shadow-sm transition-all duration-200 sm:w-[21%] sm:px-3 sm:py-2.5 sm:text-xs md:text-sm",
              selected === category.id
                ? "scale-105 border-accent bg-accent text-accent-foreground shadow-lg"
                : "border-primary/20 bg-card text-card-foreground hover:border-accent hover:bg-secondary",
            )}
            style={{ left: `${category.x}%`, top: `${category.y}%` }}
          >
            {category.name}
          </button>
        ))}

        <div className="absolute left-1/2 top-[63%] flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border-4 border-card bg-primary text-primary-foreground shadow-xl sm:h-24 sm:w-24">
          <Sprout className="h-5 w-5 sm:h-6 sm:w-6" />
          <span className="mt-1 font-display text-lg font-bold sm:text-xl">Джоб</span>
        </div>

        {roots.map((root) => (
          <div
            key={root.name}
            className="absolute w-[22%] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-primary/15 bg-secondary px-1 py-2 text-center text-[10px] font-semibold text-secondary-foreground shadow-sm sm:w-[18%] sm:text-xs"
            style={{ left: `${root.x}%`, top: `${root.y}%` }}
          >
            {root.name}
          </div>
        ))}
      </div>

      <div className="mx-auto -mt-2 max-w-lg rounded-2xl border bg-card p-4 text-center shadow-sm" aria-live="polite">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent">{active.name}</p>
        <p className="mt-1 text-sm text-muted-foreground">{active.description}</p>
      </div>
    </div>
  );
}
