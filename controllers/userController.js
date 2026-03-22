import pool from "../db/connection.js";

let onboardingTableEnsured = false;
let activityLevelsEnsured = false;

const ensureOnboardingTable = async () => {
  if (onboardingTableEnsured) {
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_onboarding_preferences (
      id INT AUTO_INCREMENT PRIMARY KEY,
      idUser INT NOT NULL,
      birthDate DATE NULL,
      sex VARCHAR(20) NULL,
      dietType VARCHAR(60) NULL,
      ingredientsJson JSON NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_onboarding_user (idUser),
      CONSTRAINT fk_onboarding_user
        FOREIGN KEY (idUser)
        REFERENCES users(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);

  onboardingTableEnsured = true;
};

const ensureActivityLevelsSeeded = async () => {
  if (activityLevelsEnsured) {
    return;
  }

  await pool.query(`
    INSERT INTO activitylevels (idActivityLevel, levelName, description, activityFactor)
    VALUES
      (1, 'Sedentario', 'Poco o nada de ejercicio', 1.20),
      (2, 'Ligeramente activo', '1-3 dias por semana', 1.38),
      (3, 'Moderadamente activo', '3-5 dias por semana', 1.55),
      (4, 'Muy activo', '6-7 dias por semana', 1.72),
      (5, 'Atleta profesional', 'Dos veces al dia', 1.90)
    ON DUPLICATE KEY UPDATE
      levelName = VALUES(levelName),
      description = VALUES(description),
      activityFactor = VALUES(activityFactor);
  `);

  activityLevelsEnsured = true;
};

const toPositiveNumber = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
};

const resolveActivityLevelId = (rawId, rawLabel) => {
  const parsed = Number(rawId);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  const label = String(rawLabel || "")
    .trim()
    .toLowerCase();

  const map = {
    sedentario: 1,
    "ligeramente activo": 2,
    "moderadamente activo": 3,
    "muy activo": 4,
    "atleta profesional": 5,
  };

  return map[label] || 1;
};


export const getUsers = async (req, res) => {
  const [rows] = await pool.query("SELECT * FROM users");
  res.json(rows);
};

export const getUser = async (req, res) => {
  const { id } = req.params;
  const [rows] = await pool.query("SELECT * FROM users WHERE id = ?", [id]);
  res.json(rows[0]);
};

export const saveOnboarding = async (req, res) => {
  const connection = await pool.getConnection();
  let transactionStarted = false;

  try {
    await ensureOnboardingTable();
    await ensureActivityLevelsSeeded();

    const {
      idUser,
      username,
      birthDate,
      currentWeight,
      height,
      targetWeight,
      sex,
      activityLevelId,
      activityLevel,
      doesWeightTraining,
      dietType,
      ingredients,
    } = req.body;

    const userId = Number(idUser);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ message: "idUser es requerido y debe ser valido" });
    }

    const parsedWeight = toPositiveNumber(currentWeight);
    const parsedHeightRaw = toPositiveNumber(height);
    const parsedTargetWeight = toPositiveNumber(targetWeight);

    if (!parsedWeight || !parsedHeightRaw || !parsedTargetWeight) {
      return res.status(400).json({
        message: "currentWeight, height y targetWeight son requeridos",
      });
    }

    const parsedHeight = parsedHeightRaw > 10
      ? Number((parsedHeightRaw / 100).toFixed(2))
      : Number(parsedHeightRaw.toFixed(2));

    const parsedActivityLevelId = resolveActivityLevelId(activityLevelId, activityLevel);
    const parsedTrainingType = Boolean(doesWeightTraining) ? "pesas" : "ninguno";
    const parsedIngredients = Array.isArray(ingredients)
      ? ingredients.filter((item) => typeof item === "string" && item.trim() !== "")
      : [];

    await connection.beginTransaction();
    transactionStarted = true;

    if (typeof username === "string" && username.trim()) {
      await connection.query("UPDATE users SET name = ? WHERE id = ?", [
        username.trim(),
        userId,
      ]);
    }

    const [statsRows] = await connection.query(
      "SELECT id FROM UserStats WHERE idUser = ? ORDER BY id DESC LIMIT 1",
      [userId]
    );

    if (statsRows.length === 0) {
      await connection.query(
        `INSERT INTO UserStats (idUser, weight, height, targetWeight, idActivityLevel)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, parsedWeight, parsedHeight, parsedTargetWeight, parsedActivityLevelId]
      );
    } else {
      await connection.query(
        `UPDATE UserStats
         SET weight = ?, height = ?, targetWeight = ?, idActivityLevel = ?, recordDate = NOW()
         WHERE id = ?`,
        [
          parsedWeight,
          parsedHeight,
          parsedTargetWeight,
          parsedActivityLevelId,
          statsRows[0].id,
        ]
      );
    }

    const [activityRows] = await connection.query(
      "SELECT id FROM useractivityprofile WHERE idUser = ? ORDER BY id DESC LIMIT 1",
      [userId]
    );

    if (activityRows.length === 0) {
      await connection.query(
        `INSERT INTO useractivityprofile
         (idUser, idActivityLevel, trainingType, trainingDaysPerWeek, estimatedMinutesPerDay, intensity, estimatedBurnedKcal)
         VALUES (?, ?, ?, 0, 0, 'medio', 0)`,
        [userId, parsedActivityLevelId, parsedTrainingType]
      );
    } else {
      await connection.query(
        `UPDATE useractivityprofile
         SET idActivityLevel = ?, trainingType = ?, updatedAt = NOW()
         WHERE id = ?`,
        [parsedActivityLevelId, parsedTrainingType, activityRows[0].id]
      );
    }

    const [objectiveRows] = await connection.query(
      "SELECT id FROM objective WHERE idUser = ? ORDER BY id DESC LIMIT 1",
      [userId]
    );

    const today = new Date();
    const startDate = today.toISOString().slice(0, 10);
    const end = new Date(today);
    end.setDate(end.getDate() + 90);
    const endDate = end.toISOString().slice(0, 10);

    if (objectiveRows.length === 0) {
      await connection.query(
        `INSERT INTO objective (idUser, goalType, goalValue, startDate, endDate, completed)
         VALUES (?, 'peso', ?, ?, ?, 0)`,
        [userId, parsedTargetWeight, startDate, endDate]
      );
    } else {
      await connection.query(
        `UPDATE objective
         SET goalType = 'peso', goalValue = ?, startDate = ?, endDate = ?, completed = 0
         WHERE id = ?`,
        [parsedTargetWeight, startDate, endDate, objectiveRows[0].id]
      );
    }

    await connection.query(
      `INSERT INTO user_onboarding_preferences (idUser, birthDate, sex, dietType, ingredientsJson)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         birthDate = VALUES(birthDate),
         sex = VALUES(sex),
         dietType = VALUES(dietType),
         ingredientsJson = VALUES(ingredientsJson),
         updatedAt = NOW()`,
      [
        userId,
        birthDate || null,
        sex || null,
        dietType || null,
        JSON.stringify(parsedIngredients),
      ]
    );

    await connection.commit();
    transactionStarted = false;

    return res.status(200).json({
      message: "Formulario guardado correctamente",
      data: {
        idUser: userId,
        username: username?.trim() || null,
        weight: parsedWeight,
        height: parsedHeight,
        targetWeight: parsedTargetWeight,
        idActivityLevel: parsedActivityLevelId,
        dietType: dietType || null,
        ingredientsCount: parsedIngredients.length,
      },
    });
  } catch (error) {
    if (transactionStarted) {
      await connection.rollback();
    }

    console.error("saveOnboarding error:", error);
    return res.status(500).json({
      message: "No se pudo guardar el formulario",
      error: String(error && error.message ? error.message : error),
    });
  } finally {
    connection.release();
  }
};

export const getOnboarding = async (req, res) => {
  try {
    await ensureOnboardingTable();

    const { idUser } = req.params;
    const userId = Number(idUser);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ message: "idUser invalido" });
    }

    const [userRows] = await pool.query(
      "SELECT id, name, email, status FROM users WHERE id = ? LIMIT 1",
      [userId]
    );

    if (userRows.length === 0) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const [statsRows] = await pool.query(
      `SELECT weight, height, targetWeight, idActivityLevel, recordDate
       FROM UserStats
       WHERE idUser = ?
       ORDER BY id DESC
       LIMIT 1`,
      [userId]
    );

    const [activityRows] = await pool.query(
      `SELECT idActivityLevel, trainingType, trainingDaysPerWeek, estimatedMinutesPerDay, intensity, updatedAt
       FROM useractivityprofile
       WHERE idUser = ?
       ORDER BY id DESC
       LIMIT 1`,
      [userId]
    );

    const [objectiveRows] = await pool.query(
      `SELECT goalType, goalValue, startDate, endDate, completed
       FROM objective
       WHERE idUser = ?
       ORDER BY id DESC
       LIMIT 1`,
      [userId]
    );

    const [prefRows] = await pool.query(
      `SELECT birthDate, sex, dietType, ingredientsJson, updatedAt
       FROM user_onboarding_preferences
       WHERE idUser = ?
       LIMIT 1`,
      [userId]
    );

    let ingredients = [];
    if (prefRows[0]?.ingredientsJson) {
      const rawIngredients = prefRows[0].ingredientsJson;

      if (Array.isArray(rawIngredients)) {
        ingredients = rawIngredients;
      } else if (typeof rawIngredients === "string") {
        try {
          ingredients = JSON.parse(rawIngredients);
        } catch {
          ingredients = [];
        }
      }
    }

    return res.status(200).json({
      user: userRows[0],
      stats: statsRows[0] || null,
      activity: activityRows[0] || null,
      objective: objectiveRows[0] || null,
      preferences: prefRows[0]
        ? {
            ...prefRows[0],
            ingredients,
          }
        : null,
    });
  } catch (error) {
    console.error("getOnboarding error:", error);
    return res.status(500).json({
      message: "No se pudo obtener el formulario",
      error: String(error && error.message ? error.message : error),
    });
  }
};

