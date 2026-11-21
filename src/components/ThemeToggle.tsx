import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("dzhob-theme", next ? "dark" : "light");
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={toggle}
      aria-label={dark ? "Включи светла тема" : "Включи тъмна тема"}
      title={dark ? "Светла тема" : "Тъмна тема"}
      className="fixed bottom-5 left-5 z-40 rounded-full bg-card/90 shadow-lg backdrop-blur"
    >
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}
