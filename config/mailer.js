// config/mailer.js
import nodemailer from "nodemailer";
import dotenv from "dotenv";
export const mailFrom = process.env.SMTP_FROM;
dotenv.config();

export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false, // porque usas 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});