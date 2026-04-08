/**
 * gemini-client.mjs
 * Persistent SDK-based Gemini client using @google/genai.
 * No CLI spawn overhead — singleton client reused across all calls in the process.
 * Falls back gracefully when GOOGLE_API_KEY is not set or SDK import fails.
 */

import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Singleton — created once per process, reused for all subsequent calls.
// ---------------------------------------------------------------------------

let _ai = null;
let _sdkChecked = false;
let _sdkAvailable = false;

async function getAI() {
  if (_sdkChecked) return _ai;
  _sdkChecked = true;

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;

  try {
    const { GoogleGenAI } = await import("@google/genai");
    _ai = new GoogleGenAI({ apiKey });
    _sdkAvailable = true;
    return _ai;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Image helpers
// ---------------------------------------------------------------------------

const MIME_BY_EXT = {
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif":  "image/gif",
  ".bmp":  "image/bmp",
};

/**
 * Reads an image file and returns an inlineData Part for the Gemini API.
 * @param {string} filePath  Absolute or relative path to the image file
 * @returns {{ inlineData: { data: string, mimeType: string } }}
 */
export function imageFileToPart(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = MIME_BY_EXT[ext];
  if (!mimeType) {
    throw new Error(`Unsupported image format "${ext}". Supported: ${Object.keys(MIME_BY_EXT).join(", ")}`);
  }
  const data = fs.readFileSync(path.resolve(filePath));
  return { inlineData: { data: data.toString("base64"), mimeType } };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * @param {string}   model                    Model name
 * @param {string}   prompt                   Full prompt text
 * @param {{
 *   thinkingBudget?: number|null,
 *   imagePaths?: string[],
 * }} [opts]
 * @returns {Promise<{ response: string, sessionId: null, reasoningSummary: string|null }>}
 */
export async function callGeminiSDK(model, prompt, { thinkingBudget = null, imagePaths = [] } = {}) {
  const ai = await getAI();
  if (!ai) throw new Error("SDK_UNAVAILABLE");

  /** @type {Record<string, unknown>} */
  const config = {};
  if (thinkingBudget !== null && thinkingBudget >= 0) {
    config.thinkingConfig = { thinkingBudget };
  }

  // Build contents: text part + optional image parts
  const parts = [{ text: prompt }];
  for (const imgPath of imagePaths) {
    parts.push(imageFileToPart(imgPath));
  }
  const contents = imagePaths.length > 0
    ? [{ role: "user", parts }]
    : prompt;

  const result = await ai.models.generateContent({
    model,
    contents,
    ...(Object.keys(config).length > 0 ? { config } : {}),
  });

  const text = result.text ?? "";

  // Extract reasoning summary from thinking parts if present
  let reasoningSummary = null;
  const candidates = result.candidates ?? [];
  for (const candidate of candidates) {
    for (const part of candidate.content?.parts ?? []) {
      if (part.thought && part.text) {
        const clean = part.text.replace(/\s+/g, " ").trim();
        reasoningSummary = clean.length > 600 ? clean.slice(0, 600) + "…" : clean;
        break;
      }
    }
    if (reasoningSummary) break;
  }

  return { response: text, sessionId: null, reasoningSummary };
}

/**
 * Returns true when the SDK client can be instantiated.
 * Async — performs SDK import on first call.
 */
export async function isSdkAvailable() {
  await getAI();
  return _sdkAvailable;
}
