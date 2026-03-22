import { describe, expect, it } from "vitest";
import {
  clearShareLinkVerifyFailures,
  getRateLimitKey,
  isShareLinkVerifyBlocked,
  recordShareLinkVerifyFailure,
} from "./share-link-rate-limit";

describe("share-link-rate-limit", () => {
  it("tracks failures and blocks after max attempts", () => {
    const key = getRateLimitKey("token-test", `ip-${Date.now()}`);

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const result = recordShareLinkVerifyFailure(key);
      expect(result.blocked).toBe(false);
      expect(result.remaining).toBe(5 - attempt);
    }

    const fifth = recordShareLinkVerifyFailure(key);
    expect(fifth.blocked).toBe(true);
    expect(fifth.retryAfterSeconds).toBeGreaterThan(0);

    const blockedState = isShareLinkVerifyBlocked(key);
    expect(blockedState.blocked).toBe(true);
    expect(blockedState.retryAfterSeconds).toBeGreaterThan(0);

    clearShareLinkVerifyFailures(key);
    const afterClear = isShareLinkVerifyBlocked(key);
    expect(afterClear.blocked).toBe(false);
  });
});
