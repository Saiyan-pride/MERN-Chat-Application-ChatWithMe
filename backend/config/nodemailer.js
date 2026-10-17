const nodemailer = require("nodemailer");

const createTransporter = () => {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  });
};

const sendOtpEmail = async (toEmail, otp) => {
  const transporter = createTransporter();
  const from = process.env.EMAIL_FROM || `ChatWithMe <${process.env.SMTP_USER || "no-reply@chatwithme.com"}>`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
      <h2 style="color: #2B6CB0; text-align: center;">ChatWithMe Password Reset</h2>
      <p>Hello,</p>
      <p>We received a request to reset your password for your <strong>ChatWithMe</strong> account.</p>
      <div style="background-color: #EDF2F7; padding: 15px; border-radius: 6px; text-align: center; margin: 20px 0;">
        <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #1A202C;">${otp}</span>
      </div>
      <p style="color: #718096; font-size: 14px;">This one-time passcode (OTP) will expire in <strong>5 minutes</strong>.</p>
      <p style="color: #718096; font-size: 14px;">If you did not request this password reset, please ignore this email or contact support if you have concerns.</p>
      <hr style="border: none; border-top: 1px solid #eaeaea; margin: 20px 0;" />
      <p style="color: #A0AEC0; font-size: 12px; text-align: center;">ChatWithMe Application</p>
    </div>
  `;

  if (!transporter) {
    console.log("--------------------------------------------------");
    console.log(`[SMTP SIMULATION] No SMTP_USER/SMTP_PASS in .env`);
    console.log(`[SMTP SIMULATION] To: ${toEmail}`);
    console.log(`[SMTP SIMULATION] OTP: ${otp}`);
    console.log("--------------------------------------------------");
    return { simulated: true };
  }

  return await transporter.sendMail({
    from,
    to: toEmail,
    subject: "Your ChatWithMe Verification Code",
    text: `Your ChatWithMe verification code is: ${otp}. It expires in 5 minutes.`,
    html,
  });
};

const sendPasswordResetSuccessEmail = async (toEmail) => {
  const transporter = createTransporter();
  const from = process.env.EMAIL_FROM || `ChatWithMe <${process.env.SMTP_USER || "no-reply@chatwithme.com"}>`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
      <h2 style="color: #2F855A; text-align: center;">Password Reset Successful</h2>
      <p>Hello,</p>
      <p>Your password for <strong>ChatWithMe</strong> has been successfully changed.</p>
      <p style="color: #718096; font-size: 14px;">If you performed this action, no further steps are needed.</p>
      <p style="color: #E53E3E; font-size: 14px;"><strong>If you did NOT perform this action, please secure your account immediately.</strong></p>
      <hr style="border: none; border-top: 1px solid #eaeaea; margin: 20px 0;" />
      <p style="color: #A0AEC0; font-size: 12px; text-align: center;">ChatWithMe Application</p>
    </div>
  `;

  if (!transporter) {
    console.log(`[SMTP SIMULATION] Password reset confirmation email simulated for: ${toEmail}`);
    return { simulated: true };
  }

  return await transporter.sendMail({
    from,
    to: toEmail,
    subject: "ChatWithMe Security Notice: Password Changed",
    text: `Your ChatWithMe password has been successfully reset. If you did not do this, please contact support immediately.`,
    html,
  });
};

module.exports = {
  sendOtpEmail,
  sendPasswordResetSuccessEmail,
};
