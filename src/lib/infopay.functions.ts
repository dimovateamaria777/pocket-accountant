import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const credentialsSchema = z.object({
  uniqueId: z.string().uuid(),
  accessToken: z.string().min(1).max(512),
});

export const connectInfoPayAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { uniqueId: string; accessToken: string }) =>
    credentialsSchema.parse(input),
  )
  .handler(async ({ data, context }) => {
    const encryptionSecret = process.env["INFOPAY_CREDENTIALS_KEY"];
    if (!encryptionSecret) throw new Error("Защитата на InfoPay връзката още не е настроена.");
    const { connectInfoPay } = await import("@/lib/infopay.server");
    return connectInfoPay(context.userId, data, encryptionSecret);
  });

export const syncInfoPay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { connectionId: string }) =>
    z.object({ connectionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const encryptionSecret = process.env["INFOPAY_CREDENTIALS_KEY"];
    if (!encryptionSecret) throw new Error("Защитата на InfoPay връзката още не е настроена.");
    const { syncInfoPayConnection } = await import("@/lib/infopay.server");
    return syncInfoPayConnection(data.connectionId, context.userId, encryptionSecret);
  });
