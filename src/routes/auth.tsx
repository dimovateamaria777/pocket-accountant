import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { LovableMark } from "@lovable.dev/cloud-auth-js/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Вход – Personal Accountant" },
      { name: "description", content: "Влезте или създайте профил в Personal Accountant." },
      { property: "og:title", content: "Вход – Personal Accountant" },
      { property: "og:description", content: "Влезте или създайте профил в Personal Accountant." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function GoogleG() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/></svg>
  );
}

function AuthPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) navigate({ to: "/app" });
  }, [user, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) toast.error("Грешен имейл или парола.");
    } else {
      const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + "/app" } });
      if (error) toast.error(error.message);
      else toast.success("Проверете имейла си, за да потвърдите профила.");
    }
    setBusy(false);
  }

  async function oauth(provider: "google" | "lovable") {
    const r = await lovable.auth.signInWithOAuth(provider, { redirect_uri: window.location.origin + "/auth" });
    if (r.error) toast.error("Входът не успя.");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8">
        <Link to="/" className="font-display text-2xl font-bold text-primary">Personal Accountant</Link>
        <h1 className="mt-4 text-xl font-semibold">{mode === "in" ? "Вход" : "Нов профил"}</h1>
        <div className="mt-6 space-y-2">
          <Button type="button" variant="outline" className="w-full" onClick={() => oauth("google")}><GoogleG />Продължи с Google</Button>
          <Button type="button" variant="outline" className="w-full" onClick={() => oauth("lovable")}><LovableMark />Продължи с Lovable</Button>
        </div>
        <div className="my-5 text-center text-xs text-muted-foreground">или с имейл</div>
        <form onSubmit={submit} className="space-y-3">
          <div><Label htmlFor="email">Имейл</Label><Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><Label htmlFor="pw">Парола</Label><Input id="pw" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          <Button type="submit" className="w-full" disabled={busy}>{mode === "in" ? "Влез" : "Създай профил"}</Button>
        </form>
        <button className="mt-4 w-full text-sm text-muted-foreground underline" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "Нямате профил? Регистрация" : "Имате профил? Вход"}
        </button>
      </div>
    </div>
  );
}
