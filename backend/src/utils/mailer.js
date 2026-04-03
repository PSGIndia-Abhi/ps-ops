const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: true, // port 465
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const sendOTPEmail = async ({ toEmail, userEmail, otp }) => {
  await transporter.sendMail({
    from: `"PS Ops" <${process.env.SMTP_USER}>`,
    to: toEmail,
    subject: "Signup OTP",
    text: `OTP for ${userEmail}: ${otp}`,
  });
};

const sendTicketCreatedEmail = async ({ toEmails = [], ticket, job }) => {
  if (!toEmails.length) return;

  const jobLabel = job?.code ? `Job ${job.code}` : `Job ${job?.id || ""}`.trim();
  const subject = `New ticket raised for ${jobLabel}`;
  const text = [
    "A new ticket has been raised.",
    "",
    `Job: ${jobLabel}`,
    `Ticket: ${ticket?.subject || "(no subject)"}`,
    `Priority: ${ticket?.priority || "MEDIUM"}`,
    "",
    ticket?.message ? `Message: ${ticket.message}` : "",
  ].filter(Boolean).join("\n");

  await transporter.sendMail({
    from: `"PS Ops" <${process.env.SMTP_USER}>`,
    to: toEmails.join(","),
    subject,
    text,
  });
};

module.exports = { sendOTPEmail, sendTicketCreatedEmail };
