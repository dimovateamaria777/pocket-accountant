import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { syncAllInfoPayConnections } from "@/lib/infopay.server";

export const Route = createFileRoute("/api/public/jobs/infopay-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const encryptionSecret = process.env["INFOPAY_CREDENTIALS_KEY"];
        if (!encryptionSecret) return Response.json({ error: "Configuration missing" }, { status: 500 });
        const result = await syncAllInfoPayConnections(encryptionSecret);
        return Response.json(result);
      },
    },
  },
});
