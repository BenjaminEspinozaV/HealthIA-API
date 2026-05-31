import dotenv from "dotenv";
dotenv.config();

import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;

export const resend = new Resend(apiKey);

export const mailFrom =
  process.env.RESEND_FROM || "HealthIA <onboarding@resend.dev>";