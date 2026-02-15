/**
 * Email templates with GigsManager branding
 * Uses Teal (#007280), Gold (#F8B600), Orange (#FAA32C) color scheme
 */

export const emailStyles = `
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #1e293b;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background: #ffffff;
    }
    .header {
      background: linear-gradient(135deg, #007280 0%, #FAA32C 100%);
      padding: 40px 20px;
      text-align: center;
      color: white;
    }
    .logo {
      font-size: 28px;
      font-weight: bold;
      margin-bottom: 10px;
    }
    .brand-text {
      color: #F8B600;
    }
    .content {
      padding: 40px 30px;
      background: #ffffff;
    }
    .greeting {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 20px;
      color: #007280;
    }
    .body-text {
      font-size: 14px;
      color: #475569;
      margin-bottom: 20px;
      line-height: 1.8;
    }
    .cta-button {
      display: inline-block;
      background: linear-gradient(135deg, #007280 0%, #005a68 100%);
      color: white;
      padding: 14px 40px;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 600;
      font-size: 16px;
      margin: 30px 0;
      transition: opacity 0.3s;
    }
    .cta-button:hover {
      opacity: 0.9;
    }
    .code-block {
      background: #f1f5f9;
      border-left: 4px solid #F8B600;
      padding: 15px;
      border-radius: 4px;
      margin: 20px 0;
      font-family: 'Courier New', monospace;
      font-size: 13px;
      color: #1e293b;
      letter-spacing: 2px;
      text-align: center;
      font-weight: bold;
    }
    .divider {
      border-top: 1px solid #e2e8f0;
      margin: 30px 0;
    }
    .footer {
      background: #f8fafc;
      padding: 20px 30px;
      text-align: center;
      font-size: 12px;
      color: #64748b;
      border-top: 1px solid #e2e8f0;
    }
    .footer-link {
      color: #007280;
      text-decoration: none;
    }
    .highlight {
      color: #007280;
      font-weight: 600;
    }
    .secondary-text {
      font-size: 13px;
      color: #94a3b8;
      margin-top: 15px;
    }
  </style>
`;

/**
 * Email verification template
 */
export function verifyEmailTemplate(
  userName: string,
  verificationLink: string
): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      ${emailStyles}
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">
            Gigs<span class="brand-text">Manager</span>
          </div>
          <div style="font-size: 14px; opacity: 0.95;">
            Manage Your Gigs Professionally
          </div>
        </div>

        <div class="content">
          <div class="greeting">Welcome to GigsManager, ${userName}! 🎵</div>
          
          <p class="body-text">
            Thanks for signing up! To get started with managing your gigs and finances, 
            please verify your email address by clicking the button below.
          </p>

          <div style="text-align: center;">
            <a href="${verificationLink}" class="cta-button">
              Verify Email Address
            </a>
          </div>

          <p class="secondary-text">
            Or copy this verification link:<br>
            <code style="background: #f1f5f9; padding: 5px 10px; border-radius: 4px; word-break: break-all;">
              ${verificationLink}
            </code>
          </p>

          <p class="body-text">
            This link will expire in <span class="highlight">24 hours</span>.
          </p>

          <div class="divider"></div>

          <p class="body-text" style="color: #64748b; font-size: 13px;">
            <span class="highlight">What's next?</span><br>
            Once verified, you'll have full access to:
            • Track all your gigs and performances<br>
            • Automatically calculate splits and payments<br>
            • Manage band members and setlists<br>
            • Export financial reports<br>
            • And much more!
          </p>
        </div>

        <div class="footer">
          <p style="margin: 0;">
            © ${new Date().getFullYear()} GigsManager • Built for live music professionals
          </p>
          <p style="margin: 10px 0 0 0;">
            <a href="https://gigsmanager.com" class="footer-link">Website</a> • 
            <a href="https://gigsmanager.com/privacy" class="footer-link">Privacy</a> • 
            <a href="https://gigsmanager.com/support" class="footer-link">Support</a>
          </p>
          <p class="secondary-text" style="margin-top: 15px;">
            Having trouble with the button? Contact support at support@gigsmanager.com
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Password reset template
 */
export function passwordResetTemplate(
  userName: string,
  resetLink: string
): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      ${emailStyles}
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">
            Gigs<span class="brand-text">Manager</span>
          </div>
        </div>

        <div class="content">
          <div class="greeting">Password Reset Request</div>
          
          <p class="body-text">
            Hi ${userName},
          </p>

          <p class="body-text">
            We received a request to reset your GigsManager password. 
            Click the button below to create a new password.
          </p>

          <div style="text-align: center;">
            <a href="${resetLink}" class="cta-button">
              Reset Password
            </a>
          </div>

          <p class="body-text">
            This link will expire in <span class="highlight">1 hour</span>.
          </p>

          <div class="divider"></div>

          <p class="body-text" style="color: #64748b; font-size: 13px;">
            <strong>Didn't request this?</strong><br>
            If you didn't ask to reset your password, ignore this email or 
            <a href="https://gigsmanager.com/support" class="footer-link">contact support</a> if you have concerns about your account security.
          </p>
        </div>

        <div class="footer">
          <p style="margin: 0;">
            © ${new Date().getFullYear()} GigsManager • Keep your account secure
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Welcome email after verification
 */
export function welcomeEmailTemplate(userName: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      ${emailStyles}
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">
            Gigs<span class="brand-text">Manager</span>
          </div>
          <div style="font-size: 14px; opacity: 0.95;">
            Your account is ready to use ✓
          </div>
        </div>

        <div class="content">
          <div class="greeting">You're all set, ${userName}!</div>
          
          <p class="body-text">
            Your email has been verified and your GigsManager account is now active.
            You can start logging gigs, managing payments, and tracking finances immediately.
          </p>

          <div style="text-align: center;">
            <a href="https://gigsmanager.com" class="cta-button">
              Go to Dashboard
            </a>
          </div>

          <div class="divider"></div>

          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0 0 15px 0; font-weight: 600; color: #007280;">Quick Start Guide</p>
            <ol style="margin: 0; padding-left: 20px; color: #475569; font-size: 14px;">
              <li style="margin-bottom: 10px;">Add your first gig and band members</li>
              <li style="margin-bottom: 10px;">Set your fees and customization preferences</li>
              <li style="margin-bottom: 10px;">Let GigsManager calculate splits automatically</li>
              <li>Export reports and manage payments</li>
            </ol>
          </div>

          <p class="body-text">
            Questions? Check out our <a href="https://gigsmanager.com/docs" class="footer-link">documentation</a> 
            or <a href="https://gigsmanager.com/support" class="footer-link">contact support</a>.
          </p>
        </div>

        <div class="footer">
          <p style="margin: 0;">
            © ${new Date().getFullYear()} GigsManager • Made for musicians, by musicians
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}
