import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PUT /api/settings — Prisma P2022 column-drift recovery.
 *
 * The production Supabase `UserSettings` table can lag behind the Prisma schema
 * (missing customTab1/2, overviewViewMode, PDF export and band columns). When
 * that happens Prisma throws P2022 ("column does not exist") on the upsert,
 * which previously became a 500 "Failed to save settings". These tests pin the
 * recovery behaviour: strip-and-retry, graceful client-visible echo, and
 * unchanged 500s for genuine (non-drift) database failures.
 */

const upsertMock = vi.fn();
const findUniqueMock = vi.fn();
const getUserMock = vi.fn();
const getOrCreateUserMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    userSettings: {
      upsert: upsertMock,
      findUnique: findUniqueMock,
    },
  },
}));

vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: { auth: { getUser: getUserMock } },
}));

vi.mock("@/lib/auth-helpers", () => ({
  getOrCreateUser: getOrCreateUserMock,
}));

const ENV_BACKUP: Record<string, string | undefined> = {};

function makeToken(sub: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ sub, email: "user@example.com" })).toString("base64url");
  return `${header}.${payload}.signature`;
}

function putRequest(body: Record<string, unknown>): any {
  return new Request("https://example.com/api/settings", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${makeToken("supabase-user-1")}`,
    },
    body: JSON.stringify(body),
  }) as any;
}

function prismaP2022(column: string) {
  return {
    code: "P2022",
    message: `The column userSettings.${column} does not exist in the current database.`,
    meta: { column_name: column },
  };
}

describe("PUT /api/settings — Prisma P2022 column-drift recovery", () => {
  beforeAll(() => {
    for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "DATABASE_URL"]) {
      ENV_BACKUP[key] = process.env[key];
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/test";
    getOrCreateUserMock.mockResolvedValue({ id: "internal-user-1", email: "user@example.com" });
    findUniqueMock.mockResolvedValue(null);
  });

  it("strips the reported missing column (P2022) and retries the upsert with the rest", async () => {
    upsertMock
      .mockRejectedValueOnce(prismaP2022("customTab1"))
      .mockResolvedValueOnce({
        currency: "USD",
        claimPerformanceFee: true,
        claimTechnicalFee: true,
        theme: "dark",
      });

    const { PUT } = await import("@/app/api/settings/route");
    const response = await PUT(putRequest({ currency: "USD", theme: "dark", customTab1: "bands" }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.currency).toBe("USD");
    expect(body.theme).toBe("dark");
    // customTab1 could not be persisted (column missing) → default echoed back.
    expect(body.customTab1).toBe("setlists");

    // The retry payload must have dropped the offending column from BOTH update and create.
    const retryPayload = upsertMock.mock.calls[1][0];
    expect(retryPayload.update).not.toHaveProperty("customTab1");
    expect(retryPayload.create).not.toHaveProperty("customTab1");
    expect(retryPayload.update.currency).toBe("USD");
    expect(retryPayload.update.theme).toBe("dark");
  });

  it("gracefully echoes a 200 (client-visible success) when the whole patch only touches drifted columns", async () => {
    // Always reports customTab1; after stripping it the update still contains
    // customTab2, which then gets dropped too, leaving nothing persistable.
    upsertMock.mockRejectedValue(prismaP2022("customTab1"));

    const { PUT } = await import("@/app/api/settings/route");
    const response = await PUT(putRequest({ customTab1: "bands", customTab2: "investments" }));

    expect(response.status).toBe(200);
    const body = await response.json();
    // The sanitized patch is echoed back so the client considers the save a success.
    expect(body.customTab1).toBe("bands");
    expect(body.customTab2).toBe("investments");

    // Recovery must have attempted the write (and stopped once an empty update
    // would have been required).
    expect(upsertMock.mock.calls.length).toBeGreaterThan(0);
  });

  it("still returns a structured 500 for genuine (non-column) database failures", async () => {
    upsertMock.mockRejectedValue({ code: "P1001", message: "Can't reach database server" });

    const { PUT } = await import("@/app/api/settings/route");
    const response = await PUT(putRequest({ currency: "USD" }));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.code).toBe("DB_WRITE_FAILED");
    expect(body.error).toBe("Failed to save settings");
  });

  it("returns 401 when no bearer token is supplied", async () => {
    const { PUT } = await import("@/app/api/settings/route");
    const response = await PUT(
      new Request("https://example.com/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency: "USD" }),
      }) as any
    );

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Missing authorization token");
  });
});