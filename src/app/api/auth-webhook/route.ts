import { Webhook } from "svix";
import { sendVerificationEmail, sendWelcomeEmail } from "@/lib/email-service";

/**
 * Webhook endpoint for Supabase auth events
 * Triggers custom branded emails via Resend instead of Supabase defaults
 *
 * Set up in Supabase project settings:
 * Webhooks → New Hook → Events: auth.user_created, auth.user_updated
 * URL: https://yourdomain.com/api/auth-webhook
 */

export async function POST(request: Request) {
  try {
    // Get webhook signing secret from environment
    const wh_secret = process.env.SUPABASE_WEBHOOK_SECRET;
    if (!wh_secret) {
      console.error("[auth-webhook] Missing SUPABASE_WEBHOOK_SECRET");
      return new Response("Missing webhook secret", { status: 500 });
    }

    const body = await request.text();

    // Get Supabase signature from headers
    const signature = request.headers.get("x-webhook-signature");
    if (!signature) {
      console.warn("[auth-webhook] Missing webhook signature");
      return new Response("Missing signature", { status: 401 });
    }

    // Verify webhook signature using Svix
    let payload: any;
    try {
      const wh = new Webhook(wh_secret);
      payload = wh.verify(body, { "x-webhook-signature": signature }) as any;
    } catch (err) {
      console.error("[auth-webhook] Signature verification failed:", err);
      return new Response("Invalid signature", { status: 401 });
    }

    console.log("[auth-webhook] Received event:", payload.type);

    // Handle user signup event
    if (payload.type === "user_signup") {
      const { id, email, raw_user_meta_data } = payload.data;
      const userName =
        raw_user_meta_data?.full_name?.split(" ")[0] ||
        email.split("@")[0] ||
        "there";

      // Build verification link
      // This should redirect to your app's confirmation page
      const verificationLink = `${process.env.NEXT_PUBLIC_APP_URL}/auth/verify?token=${id}`;

      console.log("[auth-webhook] Sending verification email to:", email);

      try {
        await sendVerificationEmail(email, userName, verificationLink);
        console.log("[auth-webhook] Verification email sent successfully");
      } catch (emailError) {
        console.error("[auth-webhook] Failed to send verification email:", emailError);
        // Don't fail the webhook - user can still verify through app
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    // Handle user confirmed event (optional - send welcome email)
    if (payload.type === "user_confirmed") {
      const { email, raw_user_meta_data } = payload.data;
      const userName =
        raw_user_meta_data?.full_name?.split(" ")[0] ||
        email.split("@")[0] ||
        "there";

      console.log("[auth-webhook] Sending welcome email to:", email);

      try {
        await sendWelcomeEmail(email, userName);
        console.log("[auth-webhook] Welcome email sent successfully");
      } catch (emailError) {
        console.error("[auth-webhook] Failed to send welcome email:", emailError);
        // Don't fail the webhook
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    // Unknown event type - just acknowledge
    console.log("[auth-webhook] Ignoring event type:", payload.type);
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    console.error("[auth-webhook] Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
}
