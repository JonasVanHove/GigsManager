import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { auth: { getUser } } }));

import { getVerifiedUserIdFromHeader } from "@/lib/auth-helpers";

function bearer(token?: string) {
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  return new NextRequest("http://localhost/api/bands/join", { headers });
}

describe("getVerifiedUserIdFromHeader", () => {
  it("rejects missing and blank bearer tokens", async () => {
    expect(await getVerifiedUserIdFromHeader(bearer())).toBeNull();
    expect(await getVerifiedUserIdFromHeader(bearer("  "))).toBeNull();
    expect(getUser).not.toHaveBeenCalled();
  });

  it("returns the identity from Supabase verification", async () => {
    getUser.mockResolvedValueOnce({ data: { user: { id: "verified-user" } }, error: null });

    await expect(getVerifiedUserIdFromHeader(bearer("opaque-token"))).resolves.toBe("verified-user");
    expect(getUser).toHaveBeenCalledWith("opaque-token");
  });

  it("rejects forged or expired tokens even when they contain a subject", async () => {
    getUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: "JWT expired", status: 401 },
    });
    await expect(getVerifiedUserIdFromHeader(bearer("forged.expired.jwt"))).resolves.toBeNull();

    getUser.mockResolvedValueOnce({
      data: { user: { id: "attacker" } },
      error: { message: "signature verification failed", status: 401 },
    });
    await expect(getVerifiedUserIdFromHeader(bearer("forged.signature.jwt"))).resolves.toBeNull();
  });
});
