import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/* =========================
   UTIL: SLEEP
========================= */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* =========================
   RETRY + FALLBACK
========================= */
const generateWithRetry = async (models, parts, maxRetries = 4) => {
  let delay = 1000;

  for (const modelName of models) {
    const model = genAI.getGenerativeModel({ model: modelName });

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Intento ${attempt} con modelo ${modelName}`);
        return await model.generateContent(parts);
      } catch (error) {
        const status = error?.status;

        const retryable =
          status === 503 || // sobrecarga
          status === 429 || // rate limit
          status === 500;   // error interno

        console.warn(
          `Error en ${modelName} intento ${attempt}:`,
          status,
          error.message
        );

        if (!retryable || attempt === maxRetries) {
          console.warn(`Cambiando de modelo...`);
          break;
        }

        await sleep(delay);
        delay *= 2;
      }
    }
  }

  throw new Error("Todos los modelos fallaron (Gemini no disponible)");
};

/* =========================
   FUNCIÓN PRINCIPAL
========================= */
export const analyzeFoodImage = async (
  imageBase64,
  mimeType,
  userContext,
  existingFoods
) => {
  try {
    /* ===== LIMPIAR BASE64 ===== */
    const cleanBase64 = imageBase64.replace(/^data:.*;base64,/, "");

    /* ===== PROMPT ===== */
    const prompt = `
Eres un nutricionista experto y una IA de reconocimiento de alimentos.
Analiza la imagen adjunta e identifica los alimentos y sus cantidades aproximadas.

CONTEXTO DEL USUARIO:
- Peso: ${userContext.weight} kg, Altura: ${userContext.height} cm
- Objetivo: ${userContext.goalType} (Peso objetivo: ${userContext.targetWeight} kg)
- Nivel de Actividad (PAL): ${userContext.pal} (${userContext.intensityName})
- Comida actual: ${userContext.mealType}

BASE DE DATOS ACTUAL DE ALIMENTOS:
${JSON.stringify(existingFoods)}

REGLAS:
1. Usa el ID si el alimento existe.
2. Si no existe, usa id: null y is_new: true.
3. Calcula macros totales.
4. Genera comentario corto motivacional.

RESPONDE SOLO JSON:

{
  "detected_foods": [
    {
      "id": 1,
      "name": "Nombre",
      "category": "Categoría",
      "unit_measure": "g",
      "quantity": 150,
      "calories": 200,
      "proteins": 10,
      "carbs": 20,
      "fats": 5,
      "is_new": false
    }
  ],
  "totals": {
    "calories": 200,
    "proteins": 10,
    "carbs": 20,
    "fats": 5
  },
  "comment": "Mensaje motivacional"
}
`;

    /* ===== IMAGEN ===== */
    const imageParts = [
      {
        inlineData: {
          data: cleanBase64,
          mimeType: mimeType,
        },
      },
    ];

    /* ===== MODELOS (orden de fallback) ===== */
    const models = [
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
    ];

    /* ===== LLAMADA CON RETRY ===== */
    const result = await generateWithRetry(models, [prompt, ...imageParts]);

    const responseText = result.response.text();

    /* ===== LIMPIAR RESPUESTA ===== */
    const cleanedJson = responseText
      .replace(/```json\s*/g, "")
      .replace(/```/g, "")
      .trim();

    try {
      return JSON.parse(cleanedJson);
    } catch (parseError) {
      console.error("Error parseando JSON de Gemini:", cleanedJson);
      throw new Error("Respuesta inválida de Gemini");
    }
  } catch (error) {
    console.error("Error en analyzeFoodImage:", error.message);
    throw error;
  }
};