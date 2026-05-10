import pool from "../db/connection.js";
import bcrypt from "bcryptjs";
import { transporter, mailFrom } from "../config/mailer.js";

const PASSWORD_RESET_WINDOW_MINUTES = Number(
  process.env.PASSWORD_RESET_WINDOW_MINUTES || 30
);
const MAIL_APP_NAME = process.env.MAIL_APP_NAME || "HealthIA";
const MAIL_PRIMARY_COLOR = process.env.MAIL_PRIMARY_COLOR || "#0b6b57";

const codes = new Map(); // email -> { code, expiresAt, purpose, verified }

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

const isValidEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
};

const makeCode = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

const storeCode = (email, purpose) => {
  const code = makeCode();
  codes.set(email, {
    code,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutos
    purpose, // "register" | "reset"
    verified: false,
  });
  return code;
};

const sendCodeEmail = async ({ to, code, purpose }) => {
  const safeAppName = String(MAIL_APP_NAME).replace(/[<>]/g, "");
  const subject =
    purpose === "reset"
      ? `Recuperar contraseña - ${safeAppName}`
      : `Código de verificación - ${safeAppName}`;

  const title =
    purpose === "reset"
      ? "Recuperación de contraseña"
      : "Verificación de correo";

  const text = [
    "Hola,",
    "",
    `Tu código es: ${code}`,
    "",
    `Este código vence en ${PASSWORD_RESET_WINDOW_MINUTES} minutos.`,
    "",
    "Si no solicitaste esto, ignora este correo.",
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
            <p style="margin:0 0 14px 0;font-size:18px;font-weight:700;color:#111827;">${title}</p>
            <p style="margin:0 0 16px 0;font-size:16px;line-height:1.55;">
              Tu código de verificación es:
            </p>
            <div style="font-size:34px;font-weight:700;letter-spacing:6px;margin:16px 0;color:#111827;">
              ${code}
            </div>
            <p style="margin:0 0 22px 0;font-size:14px;line-height:1.5;color:#4b5563;">
              Este código vence en <strong>${PASSWORD_RESET_WINDOW_MINUTES} minutos</strong>.
            </p>
            <p style="margin:0;font-size:13px;line-height:1.5;color:#6b7280;">
              Si no solicitaste esto, puedes ignorar este correo.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 24px;background:#111827;color:#d1d5db;text-align:center;font-size:12px;">
            © ${new Date().getFullYear()} ${safeAppName}. Todos los derechos reservados.
          </td>
        </tr>
      </table>
    </div>`;

  await transporter.sendMail({
    from: mailFrom,
    to,
    subject,
    text,
    html,
  });
};

const getGenericResetResponse = () => ({
  message:
    "Si el correo esta registrado, recibiras instrucciones para restablecer tu contrasena.",
});

/* =========================
   TEST MAIL
========================= */
export const testMail = async (req, res) => {
  try {
    const to = req.body?.to || process.env.SMTP_USER;

    await transporter.verify();

    const info = await transporter.sendMail({
      from: mailFrom,
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
      error: String(error?.message || error),
    });
  }
};

/* =========================
   LOGIN
========================= */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ message: "Email y password son requeridos" });
    }

    const [rows] = await pool.query(
      "SELECT * FROM users WHERE LOWER(email) = ? LIMIT 1",
      [normalizeEmail(email)]
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: "Usuario no encontrado" });
    }

    const user = rows[0];

    if (
      user.role === "user" &&
      String(user.status).toLowerCase().trim() !== "active"
    ) {
      return res.status(403).json({ message: "Cuenta no activada" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: "Credenciales incorrectas" });
    }

    const { password: _, ...userSafe } = user;
    return res.json({ user: userSafe });
  } catch (error) {
    console.error("login error:", error);
    return res.status(500).json({ message: "Error en login" });
  }
};

/* =========================
   EMAIL CHECK
========================= */
export const checkEmailExists = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);

    if (!email) {
      return res.status(400).json({ message: "El email es requerido" });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "El email no es válido" });
    }

    const [rows] = await pool.query(
      "SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1",
      [email]
    );

    return res.json({
      exists: rows.length > 0,
    });
  } catch (error) {
    console.error("checkEmailExists error:", error);
    return res.status(500).json({
      message: "Error del servidor",
    });
  }
};

/* =========================
   REGISTER CODE
========================= */
export const sendCode = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);

    if (!email) {
      return res.status(400).json({ message: "El email es requerido" });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "El email no es válido" });
    }

    const [rows] = await pool.query(
      "SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1",
      [email]
    );

    if (rows.length > 0) {
      return res.status(409).json({ message: "Este correo ya está registrado" });
    }

    const code = storeCode(email, "register");

    await sendCodeEmail({
      to: email,
      code,
      purpose: "register",
    });

    console.log("Código de registro enviado a:", email);

    return res.json({ success: true, message: "Código enviado" });
  } catch (error) {
    console.error("sendCode error:", error);
    return res.status(500).json({ message: "No se pudo enviar el código" });
  }
};

export const verifyCode = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const code = String(req.body?.code || "").trim();

    if (!email || !code) {
      return res.status(400).json({
        valid: false,
        message: "Email y código son requeridos",
      });
    }

    const saved = codes.get(email);

    if (!saved) {
      return res.status(400).json({
        valid: false,
        message: "Código inválido o expirado",
      });
    }

    if (Date.now() > saved.expiresAt) {
      codes.delete(email);
      return res.status(400).json({
        valid: false,
        message: "Código expirado",
      });
    }

    if (saved.code !== code) {
      return res.status(400).json({
        valid: false,
        message: "Código incorrecto",
      });
    }

    codes.set(email, { ...saved, verified: true });

    return res.json({
      valid: true,
      message:
        saved.purpose === "reset"
          ? "Código verificado para restablecer contraseña"
          : "Correo verificado",
    });
  } catch (error) {
    console.error("verifyCode error:", error);
    return res.status(500).json({
      valid: false,
      message: "Error al verificar código",
    });
  }
};

/* =========================
   RESET PASSWORD CODE FLOW
========================= */
export const forgotPassword = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);

    if (!email) {
      return res.status(400).json({ message: "Email es requerido" });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "El email no es válido" });
    }

    const [users] = await pool.query(
      "SELECT id, email FROM users WHERE LOWER(email) = ? LIMIT 1",
      [email]
    );

    if (users.length === 0) {
      return res.status(200).json(getGenericResetResponse());
    }

    const code = storeCode(email, "reset");

    await sendCodeEmail({
      to: users[0].email,
      code,
      purpose: "reset",
    });

    console.log("Código de recuperación enviado a:", email);

    return res.status(200).json(getGenericResetResponse());
  } catch (error) {
    console.error("forgotPassword error:", error);
    return res.status(500).json({
      message: "No se pudo enviar el correo",
    });
  }
};

export const verifyResetCode = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const code = String(req.body?.code || "").trim();

    const saved = codes.get(email);

    if (!saved || saved.purpose !== "reset") {
      return res.status(400).json({ valid: false, message: "Código inválido" });
    }

    if (Date.now() > saved.expiresAt) {
      codes.delete(email);
      return res.status(400).json({ valid: false, message: "Expirado" });
    }

    if (saved.code !== code) {
      return res.status(400).json({ valid: false, message: "Código incorrecto" });
    }

    codes.set(email, { ...saved, verified: true });

    return res.json({ valid: true, message: "Código verificado" });
  } catch (error) {
    console.error("verifyResetCode error:", error);
    return res.status(500).json({ valid: false, message: "Error al verificar" });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const code = String(req.body?.code || "").trim();
    const password = String(req.body?.password || "").trim();

    if (!email || !code || !password) {
      return res.status(400).json({
        message: "Email, código y contraseña son requeridos",
      });
    }

    const saved = codes.get(email);

    if (!saved || saved.purpose !== "reset") {
      return res.status(400).json({
        message: "Debes solicitar un código de recuperación",
      });
    }

    if (Date.now() > saved.expiresAt) {
      codes.delete(email);
      return res.status(400).json({ message: "Código expirado" });
    }

    if (saved.code !== code || !saved.verified) {
      return res.status(400).json({
        message: "Código no verificado",
      });
    }

    const hashed = await bcrypt.hash(password, 10);

    await pool.query("UPDATE users SET password = ? WHERE LOWER(email) = ?", [
      hashed,
      email,
    ]);

    codes.delete(email);

    return res.json({
      message: "Contraseña actualizada correctamente",
    });
  } catch (error) {
    console.error("resetPassword error:", error);
    return res.status(500).json({
      message: "Error al restablecer contraseña",
    });
  }
};

/* =========================
   ALIASES OPCIONALES
========================= */
export const sendResetCode = forgotPassword;
export const resetPasswordWithCode = resetPassword;