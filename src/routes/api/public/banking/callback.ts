import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { enableBankingRequest } from "@/lib/enable-banking.server";

const querySchema = z.object({
  state: z.string().uuid(),
  code: z.string().min(1).max(4096).optional(),
  error: z.string().max(200).optional(),
});
const accountSchema = z.object({
  uid: z.string().uuid(),
  identification_hash: z.string().optional(),
  name: z.string().max(300).optional(),
  currency: z.string().max(3).optional(),
});
const sessionSchema = z.object({
  session_id: z.string().uuid(),
  accounts: z.array(accountSchema).max(100),
  access: z.object({ valid_until: z.string().datetime().optional() }).optional(),
});

function redirect(status: "connected" | "cancelled" | "error") {
  return new Response(null, { status: 302, headers: { Location: `/app?tab=banking&bank=${status}` } });
}

export const Route = createFileRoute("/api/public/banking/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
        if (!parsed.success) return redirect("error");
        const { state, code, error: providerError } = parsed.data;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: attempt } = await supabaseAdmin
          .from("bank_connection_attempts")
          .select("id, user_id, bank_name, bank_country, expires_at, completed_at")
          .eq("state", state)
          .maybeSingle();
        if (!attempt || attempt.completed_at || new Date(attempt.expires_at).getTime() < Date.now()) return redirect("error");
        if (providerError) {
          await supabaseAdmin.from("bank_connection_attempts").update({ completed_at: new Date().toISOString() }).eq("id", attempt.id);
          return redirect("cancelled");
        }
        if (!code) return redirect("error");
        try {
          const rawSession = await enableBankingRequest<unknown>("/sessions", { method: "POST", body: { code } });
          const session = sessionSchema.parse(rawSession);
          const accounts = session.accounts.map((account) => ({
            uid: account.uid,
            identification_hash: account.identification_hash,
            name: account.name,
            currency: account.currency,
          }));
          const { error } = await supabaseAdmin.from("bank_connections").insert({
            user_id: attempt.user_id,
            provider: "enable_banking",
            session_id: session.session_id,
            bank_name: attempt.bank_name,
            bank_country: attempt.bank_country,
            accounts,
            access_valid_until: session.access?.valid_until ?? null,
          });
          if (error) throw error;
          await supabaseAdmin.from("bank_connection_attempts").update({ completed_at: new Date().toISOString() }).eq("id", attempt.id);
          return redirect("connected");
        } catch (error) {
          console.error("Enable Banking callback failed", error instanceof Error ? error.message : "unknown error");
          return redirect("error");
        }
      },
    },
  },
});
