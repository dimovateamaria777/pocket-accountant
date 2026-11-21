import { createOpenAI } from "@ai-sdk/openai";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const MODEL = "openai/gpt-6-astra";
const RUN_ID = "X-Lovable-AIG-Run-ID";

export function createProvider(request: Request) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");
  let runId = request.headers.get(RUN_ID)?.trim() || undefined;
  const fetchWithRun = async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    if (runId && !headers.has(RUN_ID)) headers.set(RUN_ID, runId);
    const res = await fetch(input, { ...init, headers });
    runId ??= res.headers.get(RUN_ID)?.trim() || undefined;
    return res;
  };
  return createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: fetchWithRun,
  });
}

export const reasoningOptions = {
  openai: {
    forceReasoning: true,
    reasoningEffort: "low",
    reasoningSummary: "auto",
    store: false,
    include: ["reasoning.encrypted_content"],
  },
} as const;

/** Supabase client acting as the caller (RLS applies). Returns null when the token is invalid. */
export async function userClientFromRequest(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const supabase = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        h.set("apikey", key);
        h.set("Authorization", `Bearer ${token}`);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return { supabase, userId: data.user.id };
}

export function aiErrorResponse(err: unknown) {
  const e = err as { statusCode?: number; message?: string };
  const status = e?.statusCode ?? 500;
  const message =
    status === 402
      ? "AI кредитите са изчерпани. Добавете кредити в настройките на работното пространство."
      : status === 429
        ? "Твърде много заявки. Опитайте отново след малко."
        : (e?.message ?? "Възникна грешка при обработката.");
  console.error("AI error", status, e?.message);
  return Response.json({ error: message }, { status });
}
