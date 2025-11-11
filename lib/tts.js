import OpenAI from "openai";
import "dotenv/config"; // To load environment variables

// Initialize the client
const openai = new OpenAI({
  apiKey: process.env.LEMONFOX_API_KEY || "", // Use a specific key for this service
  baseURL: "https://api.lemonfox.ai/v1",
});

/**
 * Generates an MP3 audio buffer from text input.
 *
 * @param {string} inputText The text to synthesize into speech.
 * @param {object} [options={}] Optional parameters for the API.
 * @param {string} [options.voice] The voice to use (e.g., 'sarah'). Defaults to 'sarah'.
 * @param {string} [options.model] The TTS model to use (e.g., 'tts-1'). Defaults to 'tts-1'.
 * @returns {Promise<Buffer>} A promise that resolves with the audio data as a Buffer.
 */
async function generateSpeech(inputText, options = {}) {
  // --- 1. Input Validation ---
  if (!inputText || inputText.trim().length === 0) {
    throw new Error("Input text is empty or not provided.");
  }
  if (!process.env.LEMONFOX_API_KEY) {
    throw new Error("LEMONFOX_API_KEY environment variable is not set.");
  }

  // --- 2. Set Options with Defaults ---
  const voice = options.voice || "michael";
  const model = options.model || "tts-1";
  const response_format = "mp3"; // We need the arrayBuffer, so format is fixed

  try {
    // --- 3. Call API ---
    const audio = await openai.audio.speech.create({
      input: inputText,
      voice: voice,
      response_format: response_format,
      model: model,
    });

    // --- 4. Process and Return Buffer ---
    const buffer = Buffer.from(await audio.arrayBuffer());

    // Return the buffer directly
    return buffer;
  } catch (error) {
    console.error("Error during speech generation:", error);
    throw new Error(`Failed to generate speech: ${error.message}`);
  }
}

export default generateSpeech;