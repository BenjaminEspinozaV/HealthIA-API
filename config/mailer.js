import dotenv from "dotenv";
dotenv.config();

import nodemailer from "nodemailer";

export const mailFrom = process.env.SMTP_FROM;

export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  connectionTimeout: 30000,
  greetingTimeout: 15000,
  socketTimeout: 60000,
});
