export interface InfoPayCredentials {
  uniqueId: string;
  accessToken: string;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function encryptionKey(secret: string) {
  if (!secret) throw new Error("Липсва настройка за защита на InfoPay данните.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptInfoPayCredentials(credentials: InfoPayCredentials, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(secret),
    new TextEncoder().encode(JSON.stringify(credentials)),
  );
  return `v1.${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}

export async function decryptInfoPayCredentials(ciphertext: string, secret: string) {
  const [version, encodedIv, encodedPayload, ...rest] = ciphertext.split(".");
  if (version !== "v1" || !encodedIv || !encodedPayload || rest.length)
    throw new Error("InfoPay данните за връзката са повредени. Свържете я отново.");
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(encodedIv) },
    await encryptionKey(secret),
    base64ToBytes(encodedPayload),
  );
  const parsed = JSON.parse(new TextDecoder().decode(decrypted)) as Partial<InfoPayCredentials>;
  if (!parsed.uniqueId || !parsed.accessToken)
    throw new Error("InfoPay данните за връзката са повредени. Свържете я отново.");
  return { uniqueId: parsed.uniqueId, accessToken: parsed.accessToken };
}
