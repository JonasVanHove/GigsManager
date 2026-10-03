import { prisma } from "@/lib/prisma";
import { sendRsvpChangeEmail } from "@/lib/email-service";

/**
 * Fans an RSVP change out to the people who run the band (v1.37.0).
 *
 * A bandmate answering "Attending" is the signal a leader needs, so the
 * audience is every leader of the band plus the band owner — minus the person
 * who just answered, who obviously already knows.
 *
 * Recipient resolution is deliberately pure and exported so it can be unit
 * tested without a database; only `deliverRsvpChangeNotifications` touches
 * Prisma and Resend.
 */

export type RsvpStatus = "ATTENDING" | "DECLINED" | "MAYBE" | "PENDING";

export interface RsvpRecipient {
  userId: string;
  email: string | null;
  name: string | null;
}

/** Display label per status, reused by the in-app alert and the email. */
export const RSVP_STATUS_LABELS: Record<RsvpStatus, string> = {
  ATTENDING: "Attending",
  DECLINED: "Declined",
  MAYBE: "Maybe",
  PENDING: "Awaiting reply",
};

/** Emoji shown on the in-app alert. */
export const RSVP_STATUS_ICONS: Record<RsvpStatus, string> = {
  ATTENDING: "🟢",
  DECLINED: "🔴",
  MAYBE: "🟡",
  PENDING: "⚪",
};

/**
 * Deep link straight to the gig card the alert is about.
 *
 * The dashboard reads the `gig` param and scrolls to / highlights that card,
 * so "View" lands on the right row instead of the top of the list.
 */
export function gigDeepLink(gigId: string): string {
  return `/app?tab=gigs&gig=${encodeURIComponent(gigId)}`;
}

/**
 * Resolves who should be told, owner first then leaders.
 *
 * De-duplicates by user id — an owner is often also flagged as a leader, and
 * must not get two identical alerts. Unclaimed BandMember rows (`userId` null,
 * someone who never signed up) cannot be notified and are dropped.
 */
export function resolveRecipients(
  owner: { userId: string; email?: string | null; name?: string | null } | null,
  leaders: Array<{ userId: string | null; email?: string | null; name?: string | null }>
): RsvpRecipient[] {
  const seen = new Set<string>();
  const recipients: RsvpRecipient[] = [];

  const add = (
    userId: string | null | undefined,
    email?: string | null,
    name?: string | null
  ) => {
    if (!userId || seen.has(userId)) return;
    seen.add(userId);
    recipients.push({ userId, email: email ?? null, name: name ?? null });
  };

  if (owner) add(owner.userId, owner.email, owner.name);
  for (const leader of leaders) add(leader.userId, leader.email, leader.name);

  return recipients;
}

/** Removes the actor, so nobody is told about their own tap. */
export function excludeActor(
  recipients: RsvpRecipient[],
  actorUserId: string
): RsvpRecipient[] {
  return recipients.filter((r) => r.userId !== actorUserId);
}

export interface RsvpChangeEvent {
  gigId: string;
  gigName: string;
  gigDate: Date;
  bandName: string | null;
  actorUserId: string;
  actorName: string;
  status: RsvpStatus;
  attendingCount: number;
  totalCount: number;
}

export interface DeliveryResult {
  /** Leaders who got an in-app alert. */
  inApp: number;
  /** Leaders who were emailed. */
  emailed: number;
  /** Leaders skipped because they have no email address. */
  noEmail: number;
}

/**
 * Creates the in-app alerts and sends the emails.
 *
 * Never throws: a failed notification must not undo an RSVP the bandmate
 * already saved, so every error is logged and swallowed. Emails are dispatched
 * without awaiting, so a slow mail provider cannot stall the API response.
 */
export async function deliverRsvpChangeNotifications(
  event: RsvpChangeEvent
): Promise<DeliveryResult> {
  const result: DeliveryResult = { inApp: 0, emailed: 0, noEmail: 0 };

  try {
    // Without a band there is no leadership to notify.
    if (!event.bandName) return result;

    const recipients = await findBandLeadership(event.bandName);
    const targets = excludeActor(recipients, event.actorUserId);
    if (targets.length === 0) return result;

    const preferences = await loadPreferences(targets.map((r) => r.userId));
    const actionUrl = gigDeepLink(event.gigId);
    const label = RSVP_STATUS_LABELS[event.status];
    const icon = RSVP_STATUS_ICONS[event.status];

    // In-app and email are independent switches: someone may want the alert in
    // the app but no mail (or the other way round).
    const inAppTargets = targets.filter(
      (r) => preferences.get(r.userId)?.inAppNotifications !== false
    );

    if (inAppTargets.length > 0) {
      await prisma.notification.createMany({
        data: inAppTargets.map((r) => ({
          userId: r.userId,
          type: "rsvp_changed",
          title: "Attendance updated",
          message:
            `${event.actorName} answered "${label}" for ${event.gigName}. ` +
            `${event.attendingCount} of ${event.totalCount} attending.`,
          icon,
          actionUrl,
          actionLabel: "View gig",
          status: "unread",
        })),
      });
      result.inApp = inAppTargets.length;
    }

    const emailTargets = targets.filter(
      (r) => preferences.get(r.userId)?.emailNotifications !== false
    );

    for (const recipient of emailTargets) {
      if (!recipient.email) {
        result.noEmail += 1;
        continue;
      }
      // Fire and forget: a mail provider hiccup must not fail the request.
      void sendRsvpChangeEmail({
        to: recipient.email,
        recipientName: recipient.name || "there",
        actorName: event.actorName,
        gigName: event.gigName,
        gigDate: event.gigDate,
        statusLabel: label,
        statusIcon: icon,
        attendingCount: event.attendingCount,
        totalCount: event.totalCount,
        gigUrl: absoluteGigUrl(event.gigId),
      })
        .then((sent) => {
          if (sent) result.emailed += 1;
        })
        .catch((err) => {
          console.error("[rsvp-notifications] email failed:", err);
        });
    }

    return result;
  } catch (err) {
    console.error("[rsvp-notifications] delivery failed:", err);
    return result;
  }
}

/** Turns the relative deep link into something clickable from an email. */
function absoluteGigUrl(gigId: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "https://gigsmanager.netlify.app";
  return `${base.replace(/\/$/, "")}${gigDeepLink(gigId)}`;
}

/** Owner plus leaders of the named band. */
async function findBandLeadership(bandName: string): Promise<RsvpRecipient[]> {
  const band = await prisma.bands.findFirst({
    where: { name: bandName },
    select: { userId: true },
  });

  const leaders = await prisma.bandMember.findMany({
    where: { bands: { has: bandName }, isLeader: true },
    select: { userId: true, email: true, name: true },
  });

  // `bands` has no relation to User (it predates the invite flow), so the
  // owner's address is fetched separately rather than through a join.
  const ownerUser = band
    ? await prisma.user.findUnique({
        where: { id: band.userId },
        select: { email: true, name: true },
      })
    : null;

  return resolveRecipients(
    band ? { userId: band.userId, ...ownerUser } : null,
    leaders
  );
}

/**
 * Notification preferences keyed by user id.
 *
 * A user with no preference row counts as opted in (both true), matching the
 * database defaults.
 */
async function loadPreferences(
  userIds: string[]
): Promise<
  Map<string, { emailNotifications: boolean; inAppNotifications: boolean }>
> {
  const rows = await prisma.notificationPreference.findMany({
    where: { userId: { in: userIds } },
    select: {
      userId: true,
      emailNotifications: true,
      inAppNotifications: true,
    },
  });

  return new Map(
    rows.map((row) => [
      row.userId,
      {
        emailNotifications: row.emailNotifications,
        inAppNotifications: row.inAppNotifications,
      },
    ])
  );
}

