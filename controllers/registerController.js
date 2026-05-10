import bcrypt from "bcrypt";
import pool from "../db/connection.js";

const toPositiveNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const toPositiveInteger = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

const normalizeHeight = (height) => {
  const parsed = toPositiveNumber(height);
  if (!parsed) return null;
  return parsed > 10 ? Number((parsed / 100).toFixed(2)) : Number(parsed.toFixed(2));
};

const calculateBMI = (weight, heightMeters) => {
  if (!weight || !heightMeters) return null;
  return weight / (heightMeters * heightMeters);
};

const getHealthyWeightRange = (heightMeters) => {
  const min = 18.5 * heightMeters * heightMeters;
  const max = 24.9 * heightMeters * heightMeters;
  return {
    min: Number(min.toFixed(2)),
    max: Number(max.toFixed(2)),
  };
};

const estimateMinimumDays = (currentWeight, targetWeight) => {
  const diff = Math.abs(currentWeight - targetWeight);
  if (diff === 0) return 0;

  const losing = targetWeight < currentWeight;
  const weeklyRate = losing ? 0.75 : 0.35; // kg por semana, conservador
  return Math.ceil((diff / weeklyRate) * 7);
};

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

export const register = async (req, res) => {
  const connection = await pool.getConnection();
  let transactionStarted = false;

  try {
    const {
      name,
      email,
      password,
      gender,
      birthday,
      weight,
      height,
      targetWeight,
      goalType,
      goalValue,
      goalDays,
      intensityId,
      selectedFoodIds,
    } = req.body;

    if (
      !name ||
      !email ||
      !password ||
      !gender ||
      !birthday ||
      !weight ||
      !height ||
      !targetWeight ||
      !intensityId
    ) {
      return res.status(400).json({
        message: "Faltan campos obligatorios",
      });
    }

    const parsedWeight = toPositiveNumber(weight);
    const parsedHeight = normalizeHeight(height);
    const parsedTargetWeight = toPositiveNumber(targetWeight);
    const parsedIntensityId = toPositiveInteger(intensityId);
    const parsedGoalDays = toPositiveInteger(goalDays);

    if (
      !parsedWeight ||
      !parsedHeight ||
      !parsedTargetWeight ||
      !parsedIntensityId
    ) {
      return res.status(400).json({
        message: "Peso, altura, peso objetivo e intensidad deben ser válidos",
      });
    }

    const currentBmi = calculateBMI(parsedWeight, parsedHeight);
    const targetBmi = calculateBMI(parsedTargetWeight, parsedHeight);
    const healthyRange = getHealthyWeightRange(parsedHeight);

    if (!currentBmi || !targetBmi) {
      return res.status(400).json({
        message: "Altura inválida",
      });
    }

    if (
      parsedTargetWeight < healthyRange.min ||
      parsedTargetWeight > healthyRange.max
    ) {
      return res.status(400).json({
        message: `El peso objetivo debe estar entre ${healthyRange.min} kg y ${healthyRange.max} kg para esa altura`,
      });
    }

    const minimumDays = estimateMinimumDays(parsedWeight, parsedTargetWeight);

    if (parsedGoalDays && parsedGoalDays < minimumDays) {
      return res.status(400).json({
        message: `El tiempo elegido es muy corto. Para este objetivo necesitas al menos ${minimumDays} días`,
      });
    }

    const planDays = parsedGoalDays || minimumDays || 30;
    const startDate = new Date();
    const endDate = addDays(startDate, planDays);

    const cleanFoodIds = Array.isArray(selectedFoodIds)
      ? Array.from(
          new Set(
            selectedFoodIds
              .map((id) => Number(id))
              .filter((id) => Number.isInteger(id) && id > 0)
          )
        )
      : [];

    if (cleanFoodIds.length === 0) {
      return res.status(400).json({
        message: "Debes seleccionar al menos un alimento",
      });
    }

    await connection.beginTransaction();
    transactionStarted = true;

    const [existingUsers] = await connection.query(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      [email.trim().toLowerCase()]
    );

    if (existingUsers.length > 0) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({
        message: "El correo ya está registrado",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [userResult] = await connection.query(
      `INSERT INTO users
        (name, email, password, role, registered_at, status, activated_at, gender,birthday)
       VALUES (?, ?, ?, 'user', CURRENT_TIMESTAMP, 'inactive', CURRENT_TIMESTAMP, ?,?)`,
      [name.trim(), email.trim().toLowerCase(), hashedPassword, gender, birthday]
    );

    const userId = userResult.insertId;

    await connection.query(
      `INSERT INTO user_stats
        (id_user, weight, height, changed_date, record_date, status)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'active')`,
      [userId, parsedWeight, parsedHeight]
    );

    await connection.query(
      `INSERT INTO goals
        (id_user, target_weight, goal_type, goal_value, start_date, end_date, status)
       VALUES (?, ?, ?, ?, ?, ?, 'inprogress')`,
      [
        userId,
        parsedTargetWeight,
        goalType || "weight",
        goalValue || parsedTargetWeight,
        startDate,
        endDate,
      ]
    );

    await connection.query(
      `INSERT INTO intensity_history
        (intensity_id, users_id, start_date, end_date, status)
       VALUES (?, ?, CURRENT_TIMESTAMP, NULL, 'active')`,
      [parsedIntensityId, userId]
    );

    const values = cleanFoodIds.map((foodId) => [userId, foodId]);
    await connection.query(
      `INSERT INTO user_has_foods (users_id, foods_id) VALUES ?`,
      [values]
    );

    await connection.commit();
    transactionStarted = false;

    return res.status(201).json({
      message: "Usuario registrado correctamente",
      userId,
      plan: {
        minimumDays,
        planDays,
        endDate,
      },
    });
  } catch (error) {
    if (transactionStarted) {
      await connection.rollback();
    }

    console.error("register error:", error);
    return res.status(500).json({
      message: "Error al registrar",
      error: String(error.message || error),
    });
  } finally {
    connection.release();
  }
};
