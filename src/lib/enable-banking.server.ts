const API_ORIGIN = "https://api.enablebanking.com";

export class BankingSetupError extends Error {
  constructor() {
    super(
      "Банковата връзка още не е настроена. Необходими са идентификатор и частен ключ на приложение в Enable Banking.",
    );
    this.name = "BankingSetupError";
  }
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function applicationJwt(applicationId: string, privateKeyPem: string) {
  const pem = privateKeyPem.replace(/\\n/g, "\n");
  const encoded = pem
    .replace(/-----BEGIN (?:RSA )?PRIVATE KEY-----/g, "")
    .replace(/-----END (?:RSA )?PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  if (!encoded) throw new BankingSetupError();
  const der = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(
    new TextEncoder().encode(JSON.stringify({ typ: "JWT", alg: "RS256", kid: applicationId })),
  );
  const payload = base64Url(
    new TextEncoder().encode(
      JSON.stringify({
        iss: "enablebanking.com",
        aud: "api.enablebanking.com",
        iat: now,
        exp: now + 3600,
      }),
    ),
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${base64Url(new Uint8Array(signature))}`;
}

export async function enableBankingRequest<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const applicationId = process.env["ENABLE_BANKING_APP_ID"];
  const privateKey = process.env["ENABLE_BANKING_PRIVATE_KEY"];
  if (!applicationId || !privateKey) throw new BankingSetupError();
  const jwt = await applicationJwt(applicationId, privateKey);
  const response = await fetch(`${API_ORIGIN}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: "application/json",
      ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    redirect: "manual",
  });
  if (!response.ok) {
    const details = await response.text();
    let message = `Enable Banking върна грешка ${response.status}.`;
    try {
      const parsed = JSON.parse(details) as { message?: string; error?: string };
      message = parsed.message ?? parsed.error ?? message;
    } catch {
      // Keep the concise status when the provider does not return JSON.
    }
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
