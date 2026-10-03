import { Resend } from "resend";
import {
  verifyEmailTemplate,
  passwordResetTemplate,
  welcomeEmailTemplate,
  rsvpChangedTemplate,
  type RsvpChangeEmailData,
} from "@/lib/email-templates";

// Initialize Resend client only when API key is available
const getResendClient = () => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(
      "[email-service] RESEND_API_KEY not configured - emails will not be sent"
    );
    return null;
  }
  return new Resend(apiKey);
};

/**
 * Send verification email via Resend
 * Called after user signs up
 */
export async function sendVerificationEmail(
  email: string,
  userName: string,
  verificationLink: string
) {
  try {
    const resend = getResendClient();
    if (!resend) {
      console.warn("[sendVerificationEmail] Resend not configured - skipping");
      return { success: false, message: "Email service not configured" };
    }

    const html = verifyEmailTemplate(userName, verificationLink);

    const result = await resend.emails.send({
      from: "GigsManager <noreply@gigsmanager.com>",
      to: email,
      subject: "Verify your GigsManager email",
      html,
    });

    console.log("[sendVerificationEmail] Success:", result);
    return result;
  } catch (error) {
    console.error("[sendVerificationEmail] Error:", error);
    throw error;
  }
}

/**
 * Send password reset email via Resend
 */
export async function sendPasswordResetEmail(
  email: string,
  userName: string,
  resetLink: string
) {
  try {
    const resend = getResendClient();
    if (!resend) {
      console.warn("[sendPasswordResetEmail] Resend not configured - skipping");
      return { success: false, message: "Email service not configured" };
    }

    const html = passwordResetTemplate(userName, resetLink);

    const result = await resend.emails.send({
      from: "GigsManager <noreply@gigsmanager.com>",
      to: email,
      subject: "Reset your GigsManager password",
      html,
    });

    console.log("[sendPasswordResetEmail] Success:", result);
    return result;
  } catch (error) {
    console.error("[sendPasswordResetEmail] Error:", error);
    throw error;
  }
}

/**
 * Send welcome email via Resend
 */
export async function sendWelcomeEmail(email: string, userName: string) {
  try {
    const resend = getResendClient();
    if (!resend) {
      console.warn("[sendWelcomeEmail] Resend not configured - skipping");
      return { success: false, message: "Email service not configured" };
    }

    const html = welcomeEmailTemplate(userName);

    const result = await resend.emails.send({
      from: "GigsManager <noreply@gigsmanager.com>",
      to: email,
      subject: "Welcome to GigsManager! ðŸŽµ",
      html,
    });

    console.log("[sendWelcomeEmail] Success:", result);
    return result;
  } catch (error) {
    console.error("[sendWelcomeEmail] Error:", error);
    throw error;
  }
}

/**
 * Tell a band leader that a bandmate changed their attendance answer (v1.37.0).
 *
 * Returns a boolean instead of throwing, because callers dispatch this in the
 * background: a mail failure must never fail the RSVP request that triggered
 * it, and the in-app alert has already been stored by then.
 */
export async function sendRsvpChangeEmail(
  data: RsvpChangeEmailData
): Promise<boolean> {
  try {
    const resend = getResendClient();
    if (!resend) {
      console.warn("[sendRsvpChangeEmail] Resend not configured - skipping");
      return false;
    }

    const html = rsvpChangedTemplate(data);

    await resend.emails.send({
      from: "GigsManager <noreply@gigsmanager.com>",
      to: data.to,
      subject: `${data.statusIcon} ${data.actorName} is ${data.statusLabel.toLowerCase()} for ${data.gigName}`,
      html,
    });

    return true;
  } catch (error) {
    console.error("[sendRsvpChangeEmail] Error:", error);
    return false;
  }
}
