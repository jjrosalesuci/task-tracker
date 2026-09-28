import nodemailer from "nodemailer";
import { config } from "../config";

const transporter = nodemailer.createTransport({
  host: config.SMTP_HOST,
  port: config.SMTP_PORT,
  secure: config.SMTP_SECURE,
  auth:
    config.SMTP_USER && config.SMTP_PASS
      ? { user: config.SMTP_USER, pass: config.SMTP_PASS }
      : undefined,
});

export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  const resetUrl = new URL("/reset-password", config.APP_ORIGIN);
  resetUrl.searchParams.set("token", token);
  await transporter.sendMail({
    from: config.MAIL_FROM,
    to: email,
    subject: "Reset your Task Tracker password",
    text: `Reset your password using this link: ${resetUrl.toString()}`,
    html: `<p>Reset your password using this link:</p><p><a href="${resetUrl.toString()}">Reset password</a></p>`,
  });
}
