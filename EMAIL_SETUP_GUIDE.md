# GigsManager Email Setup Guide

## Overview
GigsManager now uses **Resend** for professional branded emails instead of Supabase's default email templates. This provides a better user experience with custom HTML, proper branding (teal/gold), and reliable delivery.

## Prerequisites
- Resend account (free tier: 100 emails/day)
- Supabase project with auth configured

## Setup Steps

### 1. Create Resend Account
1. Go to [Resend.com](https://resend.com)
2. Sign up with your email
3. Add your domain (or use `gigsmanager.com` for testing)
4. Get your **API Key** from the dashboard

### 2. Configure Environment Variables
Add these to your `.env.local`:

```bash
# Resend Email Service
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxx

# Supabase Webhook
SUPABASE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxx

# App URL for email links
NEXT_PUBLIC_APP_URL=http://localhost:3000  # or your production domain
```

### 3. Get Supabase Webhook Secret
1. Go to Supabase Dashboard → Project Settings → Webhooks
2. Create a new webhook:
   - **Name:** Email Auth Events
   - **Events:** `auth.user_created` and `auth.user_confirmed`
   - **URL:** `https://yourdomain.com/api/auth-webhook` (or `http://localhost:3000/api/auth-webhook` for dev)
   - Copy the **Webhook Secret** to your `.env.local`

### 4. Test the Setup

**Local Testing:**
```bash
1. Start your app: npm run dev
2. Create a Supabase tunnel (to receive webhooks):
   npx wormhole listen/watch 3000
3. Get the tunnel URL and add it to Supabase webhook
4. Try signing up - check Resend dashboard for sent emails
```

**Production:**
- Deploy to Vercel/hosting
- Use actual domain (e.g., `https://api.gigsmanager.com/api/auth-webhook`)
- Update Supabase webhook URL

## Email Templates

### Included Templates
1. **Verification Email** - Sent on signup, prompts email confirmation
2. **Password Reset** - Sent when user requests password reset
3. **Welcome Email** - Sent after email is verified

### Customization
Edit `/src/lib/email-templates.tsx` to:
- Change colors (Teal #007280, Gold #F8B600, Orange #FAA32C)
- Update copy/branding
- Add/remove sections
- Adjust styling

**Color Variables:**
```css
Brand (Teal): #007280
Gold: #F8B600
Orange: #FAA32C
Light Background: #f8fafc
Text Dark: #1e293b
Text Muted: #64748b
```

## Email Flow

```
User Signs Up
    ↓
Supabase auth.user_created webhook triggers
    ↓
/api/auth-webhook receives event
    ↓
Resend sends branded verification email
    ↓
User clicks verification link
    ↓
Email confirmed → Welcome email sent
```

## Troubleshooting

### Emails not sending?
1. Check Resend API key is correct
2. Verify webhook secret matches
3. Check Resend dashboard for delivery status
4. Look at server logs: `npm run dev` output

### Webhook signature verification failing?
- Make sure `SUPABASE_WEBHOOK_SECRET` is exact copy from Supabase
- Webhook must be reached via HTTPS in production
- For local dev, use tunnel service like wormhole

### Emails look wrong?
- Test in major email clients (Gmail, Outlook, Apple Mail)
- Preview at https://resend.com/previews
- Check `/src/lib/email-templates.tsx` for HTML issues

## Free Tier Limits
- **Resend:** 100 emails/day (plenty for a growing app)
- **Supabase:** Unlimited webhooks
- **Sendgrid (alternative):** 100 emails/day free tier

## Next Steps
- [ ] Deploy to production
- [ ] Update `NEXT_PUBLIC_APP_URL` to production domain
- [ ] Test all email flows
- [ ] Monitor delivery in Resend dashboard
- [ ] Set up email bounces/complaints handling (optional)

## Support
- Resend Docs: https://resend.com/docs
- Supabase Webhooks: https://supabase.com/docs/guides/webhooks
