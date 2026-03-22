import pool from "../db/connection.js";

let activityLevelsEnsured = false;

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

const normalizeIntensity = (rawIntensity) => {
  const normalized = String(rawIntensity || "medio").trim().toLowerCase();

  if (normalized === "media") {
    return "medio";
  }

  if (["bajo", "medio", "alto"].includes(normalized)) {
    return normalized;
  }

  return "medio";
};

const normalizeTrainingType = (rawExerciseType, doesWeightTraining) => {
  const normalized = String(rawExerciseType || "").trim().toLowerCase();

  if (["fuerza", "pesas"].includes(normalized) || Boolean(doesWeightTraining)) {
    return "pesas";
  }

  if (["cardio", "ciclismo", "natacion", "hiit", "yoga"].includes(normalized)) {
    return "cardio";
  }

  return "ninguno";
};

const estimateCalories = ({ exerciseType, durationMinutes, intensity }) => {
  const intensityFactor = {
    bajo: 0.08,
    medio: 0.1,
    alto: 0.13,
  };

  const typeFactor = {
    cardio: 1.1,
    ciclismo: 1.15,
    natacion: 1.2,
    hiit: 1.3,
    fuerza: 1.05,
    yoga: 0.75,
  };

  const base = Number(durationMinutes || 0) * 70;
  const intensityMultiplier = intensityFactor[intensity] || intensityFactor.medio;
  const typeMultiplier = typeFactor[String(exerciseType || "").toLowerCase()] || 1;

  return Math.max(0, Math.round(base * intensityMultiplier * typeMultiplier));
};

const getOrCreateDailyLog = async (connection, userId, logDate) => {
  const [existing] = await connection.query(
    "SELECT idDailyLog FROM dailylog WHERE idUser = ? AND logDate = ? LIMIT 1",
    [userId, logDate]
  );

  if (existing.length > 0) {
    return existing[0].idDailyLog;
  }

  const [created] = await connection.query(
    `INSERT INTO dailylog
     (idUser, logDate, netKcal, dailyKcalObjetive, foodKcal, burnedKcal, proteins, carbohydrates, fats, proteinObjetive, carbTarget, fatTarget, waterMl, waterTargetMl)
     VALUES (?, ?, 0, 2000, 0, 0, 0, 0, 0, 130, 250, 65, 0, 2500)`,
    [userId, logDate]
  );

  return created.insertId;
};

export const addExercise = async (req, res) => {
  const connection = await pool.getConnection();
  let transactionStarted = false;

  try {
    const {
      idUser,
      exerciseName,
      exerciseType,
      durationMinutes,
      burnedCalories,
      intensity,
      dateTime,
    } = req.body;

    const userId = Number(idUser);
    const duration = Number(durationMinutes);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ message: "idUser es requerido y debe ser valido" });
    }

    const safeExerciseName = String(exerciseName || exerciseType || "").trim();
    if (!safeExerciseName) {
      return res.status(400).json({ message: "exerciseName es requerido" });
    }

    if (!Number.isFinite(duration) || duration <= 0) {
      return res.status(400).json({ message: "durationMinutes debe ser mayor a 0" });
    }

    const normalizedIntensity = normalizeIntensity(intensity);
    const effectiveBurnedCalories = Number.isFinite(Number(burnedCalories))
      ? Math.max(0, Math.round(Number(burnedCalories)))
      : estimateCalories({
          exerciseType: exerciseType || exerciseName,
          durationMinutes: duration,
          intensity: normalizedIntensity,
        });

    const eventDate = dateTime ? new Date(dateTime) : new Date();
    if (Number.isNaN(eventDate.getTime())) {
      return res.status(400).json({ message: "dateTime invalido" });
    }

    const logDate = eventDate.toISOString().slice(0, 10);
    const eventDateTime = eventDate.toISOString().slice(0, 19).replace("T", " ");

    await connection.beginTransaction();
    transactionStarted = true;

    const dailyLogId = await getOrCreateDailyLog(connection, userId, logDate);

    const [result] = await connection.query(
      `INSERT INTO exerciselog
       (idUser, idDailyLog, exerciseName, durationMinutes, burnedCalories, intensity, dateTime)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        dailyLogId,
        safeExerciseName,
        Math.round(duration),
        effectiveBurnedCalories,
        normalizedIntensity,
        eventDateTime,
      ]
    );

    await connection.query(
      "UPDATE dailylog SET burnedKcal = burnedKcal + ? WHERE idDailyLog = ?",
      [effectiveBurnedCalories, dailyLogId]
    );

    await connection.commit();
    transactionStarted = false;

    return res.status(201).json({
      message: "Ejercicio guardado",
      idExercise: result.insertId,
      idDailyLog: dailyLogId,
      burnedCalories: effectiveBurnedCalories,
    });
  } catch (error) {
    if (transactionStarted) {
      await connection.rollback();
    }

    console.error("addExercise error:", error);
    return res.status(500).json({
      message: "No se pudo guardar el ejercicio",
      error: String(error && error.message ? error.message : error),
    });
  } finally {
    connection.release();
  }
};

export const saveExerciseRoutine = async (req, res) => {
  const connection = await pool.getConnection();
  let transactionStarted = false;

  try {
    await ensureActivityLevelsSeeded();

    const {
      idUser,
      activityLevelId,
      exerciseType,
      intensity,
      durationMinutes,
      doesWeightTraining,
      trainingDays,
    } = req.body;

    const userId = Number(idUser);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ message: "idUser es requerido y debe ser valido" });
    }

    const normalizedIntensity = normalizeIntensity(intensity);
    const safeDuration = Math.max(5, Number(durationMinutes || 30) || 30);
    const daysArray = Array.isArray(trainingDays)
      ? trainingDays.filter((day) => typeof day === "string" && day.trim() !== "")
      : [];
    const trainingDaysPerWeek = daysArray.length;
    const trainingType = normalizeTrainingType(exerciseType, doesWeightTraining);

    let resolvedActivityLevelId = Number(activityLevelId);
    if (!Number.isInteger(resolvedActivityLevelId) || resolvedActivityLevelId <= 0) {
      const [statsRows] = await connection.query(
        "SELECT idActivityLevel FROM UserStats WHERE idUser = ? ORDER BY id DESC LIMIT 1",
        [userId]
      );
      resolvedActivityLevelId = statsRows[0]?.idActivityLevel || 1;
    }

    const estimatedBurnedKcal = estimateCalories({
      exerciseType,
      durationMinutes: safeDuration,
      intensity: normalizedIntensity,
    });

    await connection.beginTransaction();
    transactionStarted = true;

    const [activityRows] = await connection.query(
      "SELECT id FROM useractivityprofile WHERE idUser = ? ORDER BY id DESC LIMIT 1",
      [userId]
    );

    if (activityRows.length === 0) {
      await connection.query(
        `INSERT INTO useractivityprofile
         (idUser, idActivityLevel, trainingType, trainingDaysPerWeek, estimatedMinutesPerDay, intensity, estimatedBurnedKcal)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          resolvedActivityLevelId,
          trainingType,
          trainingDaysPerWeek,
          Math.round(safeDuration),
          normalizedIntensity,
          estimatedBurnedKcal,
        ]
      );
    } else {
      await connection.query(
        `UPDATE useractivityprofile
         SET idActivityLevel = ?, trainingType = ?, trainingDaysPerWeek = ?, estimatedMinutesPerDay = ?, intensity = ?, estimatedBurnedKcal = ?, updatedAt = NOW()
         WHERE id = ?`,
        [
          resolvedActivityLevelId,
          trainingType,
          trainingDaysPerWeek,
          Math.round(safeDuration),
          normalizedIntensity,
          estimatedBurnedKcal,
          activityRows[0].id,
        ]
      );
    }

    await connection.commit();
    transactionStarted = false;

    return res.status(200).json({
      message: "Rutina guardada",
      data: {
        idUser: userId,
        activityLevelId: resolvedActivityLevelId,
        trainingType,
        intensity: normalizedIntensity,
        durationMinutes: Math.round(safeDuration),
        doesWeightTraining: Boolean(doesWeightTraining),
        trainingDays,
        trainingDaysPerWeek,
        estimatedBurnedKcal,
      },
    });
  } catch (error) {
    if (transactionStarted) {
      await connection.rollback();
    }

    console.error("saveExerciseRoutine error:", error);
    return res.status(500).json({
      message: "No se pudo guardar la rutina",
      error: String(error && error.message ? error.message : error),
    });
  } finally {
    connection.release();
  }
};

export const getExercisesByUser = async (req, res) => {
  try {
    const userId = Number(req.params.userId);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ message: "userId invalido" });
    }

    const [rows] = await pool.query(
      `SELECT idExercise, idDailyLog, exerciseName, durationMinutes, burnedCalories, intensity, dateTime
       FROM exerciselog
       WHERE idUser = ?
       ORDER BY dateTime DESC
       LIMIT 100`,
      [userId]
    );

    return res.status(200).json(rows);
  } catch (error) {
    console.error("getExercisesByUser error:", error);
    return res.status(500).json({
      message: "No se pudieron obtener los ejercicios",
      error: String(error && error.message ? error.message : error),
    });
  }
};
