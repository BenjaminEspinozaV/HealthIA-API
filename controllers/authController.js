import pool from "../db/connection.js";
import crypto from "crypto";
import nodemailer from "nodemailer";

const PASSWORD_RESET_WINDOW_MINUTES = Number(
  process.env.PASSWORD_RESET_WINDOW_MINUTES || 30
);
const MAIL_APP_NAME = process.env.MAIL_APP_NAME || "HealthIA";
const MAIL_PRIMARY_COLOR = process.env.MAIL_PRIMARY_COLOR || "#0b6b57";

let passwordResetTableEnsured = false;

const getPasswordResetGenericResponse = () => ({
  message:
    "Si el correo esta registrado, recibiras instrucciones para restablecer tu contrasena.",
});

const ensurePasswordResetTable = async () => {
  if (passwordResetTableEnsured) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INT AUTO_INCREMENT PRIMARY KEY,
      idUser INT NOT NULL,
      tokenHash VARCHAR(64) NOT NULL,
      expiresAt DATETIME NOT NULL,
      usedAt DATETIME NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_password_reset_token_hash (tokenHash),
      INDEX idx_password_reset_user (idUser),
      CONSTRAINT fk_password_reset_user
        FOREIGN KEY (idUser)
        REFERENCES users(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);

  passwordResetTableEnsured = true;
};

const buildResetUrl = (token) => {
  const rawBaseUrl =
    process.env.RESET_PASSWORD_URL || process.env.FRONTEND_URL || "";

  if (!rawBaseUrl) return `token=${token}`;

  const separator = rawBaseUrl.includes("?") ? "&" : "?";
  return `${rawBaseUrl}${separator}token=${encodeURIComponent(token)}`;
};

const sendPasswordResetEmail = async ({ to, resetUrl }) => {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = String(process.env.SMTP_PASS || "").replace(/\s+/g, "");
  const from = process.env.SMTP_FROM || user;

  if (!host || !user || !pass || !from) {
    throw new Error(
      "SMTP incompleto: faltan SMTP_HOST, SMTP_USER, SMTP_PASS o SMTP_FROM"
    );
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: { user, pass },
  });

  await transporter.verify();

  const safeAppName = String(MAIL_APP_NAME).replace(/[<>]/g, "");
  const currentYear = new Date().getFullYear();

  const plainText = [
    "Hola,",
    "",
    `Recibimos una solicitud para restablecer tu contrasena en ${safeAppName}.`,
    `Este enlace vence en ${PASSWORD_RESET_WINDOW_MINUTES} minutos.`,
    "",
    `Restablecer contrasena: ${resetUrl}`,
    "",
    "Si no solicitaste este cambio, puedes ignorar este correo.",
  ].join("\n");

  const html = `
  <div style="margin:0;padding:24px 12px;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
      <tr>
        <td style="background:${MAIL_PRIMARY_COLOR};padding:22px 24px;text-align:center;">
          <h1 style="margin:0;font-size:30px;line-height:1.2;color:#ffffff;font-weight:700;">${safeAppName}</h1>
        </td>
      </tr>
      <tr>
        <td style="padding:26px 24px 8px 24px;">
          <p style="margin:0 0 14px 0;font-size:18px;font-weight:700;color:#111827;">Recuperacion de contrasena</p>
          <p style="margin:0 0 16px 0;font-size:16px;line-height:1.55;">
            Hola, recibimos una solicitud para restablecer tu contrasena en <strong>${safeAppName}</strong>.
          </p>
          <p style="margin:0 0 22px 0;font-size:14px;line-height:1.5;color:#4b5563;">
            Por seguridad, este enlace vence en <strong>${PASSWORD_RESET_WINDOW_MINUTES} minutos</strong>.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 18px auto;">
            <tr>
              <td align="center" style="border-radius:10px;background:${MAIL_PRIMARY_COLOR};">
                <a href="${resetUrl}" style="display:inline-block;padding:13px 22px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;">
                  Restablecer contrasena
                </a>
              </td>
            </tr>
          </table>
          <p style="margin:0 0 10px 0;font-size:13px;line-height:1.5;color:#6b7280;">
            Si el boton no funciona, copia y pega este enlace en tu navegador:
          </p>
          <p style="margin:0 0 18px 0;font-size:12px;line-height:1.5;word-break:break-all;">
            <a href="${resetUrl}" style="color:${MAIL_PRIMARY_COLOR};text-decoration:underline;">${resetUrl}</a>
          </p>
          <p style="margin:0;font-size:13px;line-height:1.5;color:#6b7280;">
            Si no solicitaste este cambio, puedes ignorar este correo.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 24px;background:#111827;color:#d1d5db;text-align:center;font-size:12px;">
          © ${currentYear} ${safeAppName}. Todos los derechos reservados.
        </td>
      </tr>
    </table>
  </div>`;

  const info = await transporter.sendMail({
    from: `"${safeAppName}" <${from}>`,
    to,
    subject: `Recuperacion de contrasena - ${safeAppName}`,
    text: plainText,
    html,
  });

  console.log("Correo enviado:", info.messageId);
};

const hashResetToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

export const testMail = async (req, res) => {
  try {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER;
    const pass = String(process.env.SMTP_PASS || "").replace(/\s+/g, "");
    const from = process.env.SMTP_FROM || user;
    const to = req.body?.to || user;

    if (!host || !user || !pass || !from) {
      return res.status(500).json({
        message: "Faltan variables SMTP_HOST, SMTP_USER, SMTP_PASS o SMTP_FROM",
      });
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      requireTLS: port === 587,
      auth: {
        user,
        pass,
      },
    });

    await transporter.verify();

    const info = await transporter.sendMail({
      from: `HealthIA <${from}>`,
      to,
      subject: "Prueba SMTP HealthIA",
      text: "Si recibes este correo, SMTP esta funcionando.",
      html: "<p>Si recibes este correo, <b>SMTP esta funcionando</b>.</p>",
    });

    return res.status(200).json({
      message: "Correo de prueba enviado",
      messageId: info.messageId,
    });
  } catch (error) {
    console.error("testMail error:", error);
    return res.status(500).json({
      message: "Fallo SMTP",
      error: String(error && error.message ? error.message : error),
    });
  }
};

/* ===========================
   REGISTER
=========================== */
export const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const [result] = await pool.query(
      "INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
      [name, email, password]
    );

    return res.json({
      id: result.insertId,
      name,
      email,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Error al registrar" });
  }
};

/* ===========================
   LOGIN
=========================== */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const [rows] = await pool.query(
      "SELECT * FROM users WHERE email = ? AND password = ?",
      [email.trim(), password.trim()]
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: "Credenciales incorrectas" });
    }

    return res.json(rows[0]);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Error en login" });
  }
};

/* ===========================
   FORGOT PASSWORD
=========================== */
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== "string") {
      return res.status(400).json({ message: "Email es requerido" });
    }

    await ensurePasswordResetTable();

    const normalizedEmail = email.trim().toLowerCase();
    const [users] = await pool.query(
      "SELECT id, email FROM users WHERE LOWER(email) = ? LIMIT 1",
      [normalizedEmail]
    );

    if (users.length === 0) {
      return res.status(200).json(getPasswordResetGenericResponse());
    }

    const user = users[0];
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashResetToken(rawToken);
    const expiresAt = new Date(
      Date.now() + PASSWORD_RESET_WINDOW_MINUTES * 60 * 1000
    );

    await pool.query(
      `INSERT INTO password_reset_tokens (idUser, tokenHash, expiresAt, usedAt)
       VALUES (?, ?, ?, NULL)`,
      [user.id, tokenHash, expiresAt]
    );

    const resetUrl = buildResetUrl(rawToken);
    await sendPasswordResetEmail({ to: user.email, resetUrl });

    return res.status(200).json(getPasswordResetGenericResponse());
  } catch (error) {
    console.error("forgotPassword error:", error);
    return res.status(500).json({ message: "No se pudo enviar el correo" });
  }
};

/* ===========================
   RESET PASSWORD
=========================== */
export const resetPassword = async (req, res) => {
  const connection = await pool.getConnection();
  let transactionStarted = false;

  try {
    const { token, password } = req.body;

    if (!token || typeof token !== "string") {
      return res.status(400).json({ message: "Token es requerido" });
    }

    if (!password || typeof password !== "string") {
      return res.status(400).json({ message: "Password es requerido" });
    }

    await ensurePasswordResetTable();

    const tokenHash = hashResetToken(token.trim());

    await connection.beginTransaction();
    transactionStarted = true;

    const [tokens] = await connection.query(
      `SELECT id, idUser, expiresAt, usedAt
       FROM password_reset_tokens
       WHERE tokenHash = ?
       ORDER BY id DESC
       LIMIT 1
       FOR UPDATE`,
      [tokenHash]
    );

    if (tokens.length === 0) {
      await connection.rollback();
      return res.status(400).json({ message: "Token invalido o expirado" });
    }

    const tokenRow = tokens[0];
    const tokenExpired = new Date(tokenRow.expiresAt).getTime() < Date.now();

    if (tokenRow.usedAt || tokenExpired) {
      await connection.rollback();
      return res.status(400).json({ message: "Token invalido o expirado" });
    }

    await connection.query("UPDATE users SET password = ? WHERE id = ?", [
      password.trim(),
      tokenRow.idUser,
    ]);

    await connection.query(
      "UPDATE password_reset_tokens SET usedAt = NOW() WHERE id = ?",
      [tokenRow.id]
    );

    await connection.commit();
    transactionStarted = false;

    return res
      .status(200)
      .json({ message: "Contrasena actualizada correctamente" });
  } catch (error) {
    if (transactionStarted) {
      await connection.rollback();
    }
    console.error(error);
    return res.status(500).json({ message: "Error al restablecer contrasena" });
  } finally {
    connection.release();
  }
};