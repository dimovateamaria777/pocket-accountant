import { describe, expect, it } from "vitest";
import { decryptInfoPayCredentials, encryptInfoPayCredentials } from "./infopay-crypto.server";

describe("защита на InfoPay данните", () => {
  it("съхранява шифрован текст и възстановява данните само с ключа", async () => {
    const credentials = { uniqueId: crypto.randomUUID(), accessToken: "test-access-token" };
    const ciphertext = await encryptInfoPayCredentials(credentials, "test-encryption-key");
    expect(ciphertext).not.toContain(credentials.uniqueId);
    expect(ciphertext).not.toContain(credentials.accessToken);
    await expect(decryptInfoPayCredentials(ciphertext, "test-encryption-key")).resolves.toEqual(
      credentials,
    );
    await expect(decryptInfoPayCredentials(ciphertext, "wrong-encryption-key")).rejects.toThrow();
  });
});
