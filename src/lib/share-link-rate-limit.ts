type AttemptState = {
  count: number;
  firstAttemptAt: number;
  blockedUntil: number;
};

const attempts = new Map<string, AttemptState>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const BLOCK_MS = 15 * 60 * 1000;

function pruneExpiredEntries() {
  const now = Date.now();
  attempts.forEach((state, key) => {
    if (state.blockedUntil > 0 && state.blockedUntil < now) {
      attempts.delete(key);
      return;
    }

    if (state.blockedUntil === 0 && now - state.firstAttemptAt > WINDOW_MS) {
      attempts.delete(key);
    }
  });
}

export function getRateLimitKey(token: string, ipAddress: string): string {
  return `${token}:${ipAddress}`;
}

export function isShareLinkVerifyBlocked(key: string) {
  pruneExpiredEntries();
  const state = attempts.get(key);
  if (!state) {
    return { blocked: false, retryAfterSeconds: 0 };
  }

  const now = Date.now();
  if (state.blockedUntil > now) {
    return {
      blocked: true,
      retryAfterSeconds: Math.ceil((state.blockedUntil - now) / 1000),
    };
  }

  return { blocked: false, retryAfterSeconds: 0 };
}

export function recordShareLinkVerifyFailure(key: string) {
  pruneExpiredEntries();
  const now = Date.now();
  const existing = attempts.get(key);

  if (!existing || now - existing.firstAttemptAt > WINDOW_MS) {
    attempts.set(key, {
      count: 1,
      firstAttemptAt: now,
      blockedUntil: 0,
    });
    return { blocked: false, retryAfterSeconds: 0, remaining: MAX_ATTEMPTS - 1 };
  }

  const nextCount = existing.count + 1;
  const shouldBlock = nextCount >= MAX_ATTEMPTS;
  const blockedUntil = shouldBlock ? now + BLOCK_MS : 0;

  attempts.set(key, {
    count: nextCount,
    firstAttemptAt: existing.firstAttemptAt,
    blockedUntil,
  });

  return {
    blocked: shouldBlock,
    retryAfterSeconds: shouldBlock ? Math.ceil(BLOCK_MS / 1000) : 0,
    remaining: Math.max(0, MAX_ATTEMPTS - nextCount),
  };
}

export function clearShareLinkVerifyFailures(key: string) {
  attempts.delete(key);
}
