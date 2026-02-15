import { Resend } from "resend";
import {
  verifyEmailTemplate,
  passwordResetTemplate,
  welcomeEmailTemplate,
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
      subject: "Welcome to GigsManager! 🎵",
      html,
    });

    console.log("[sendWelcomeEmail] Success:", result);
    return result;
  } catch (error) {
    console.error("[sendWelcomeEmail] Error:", error);
    throw error;
  }
}
