import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { Groq } from 'groq-sdk';
import { fileURLToPath } from 'url';

// Get current file and directory names for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize the Groq client
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || ''
});

// Default configuration
const DEFAULT_CONFIG = {
  model: 'whisper-large-v3-turbo',
  maxFileSize: 19 * 1024 * 1024, // 19 MB
  tempDir: path.join(__dirname, 'temp_chunks'),
  language: 'en',
  prompt: '',
  maxRetries: 5,
  retryDelay: 2000,
  maxRetryDelay: 30000,
};

/**
 * Get audio duration using ffprobe
 */
function getAudioDuration(filePath) {
  return new Promise((resolve, reject) => {
    const ffprobeCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`;
    exec(ffprobeCmd, (error, stdout) => {
      if (error) return reject(error);
      resolve(parseFloat(stdout));
    });
  });
}

/**
 * Split large audio files into chunks
 */
async function splitAudioIntoChunks(inputPath, config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const fileSize = fs.statSync(inputPath).size;

  if (fileSize <= cfg.maxFileSize) return [inputPath];

  if (!fs.existsSync(cfg.tempDir)) fs.mkdirSync(cfg.tempDir, { recursive: true });

  const duration = await getAudioDuration(inputPath);
  const chunkCount = Math.ceil(fileSize / cfg.maxFileSize);
  const chunkLength = Math.ceil(duration / chunkCount);

  const chunkPaths = [];
  const promises = [];

  for (let i = 0; i < chunkCount; i++) {
    const chunkPath = path.join(cfg.tempDir, `chunk_${i}.mp3`);
    chunkPaths.push(chunkPath);

    const startTime = i * chunkLength;
    const ffmpegCmd = `ffmpeg -ss ${startTime} -i "${inputPath}" -t ${chunkLength} -c copy "${chunkPath}" -y -loglevel error`;

    promises.push(
      new Promise((resolve, reject) => {
        exec(ffmpegCmd, (error) => (error ? reject(error) : resolve()));
      })
    );
  }

  await Promise.all(promises);
  return chunkPaths;
}

/**
 * Transcribe audio with retry logic
 */
async function transcribeAudioWithRetry(audioPath, config = {}, chunkNumber = 1, totalChunks = 1) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  let lastError;

  for (let attempt = 1; attempt <= cfg.maxRetries; attempt++) {
    try {
      const transcription = await groq.audio.transcriptions.create({
        file: fs.createReadStream(audioPath),
        model: cfg.model,
        prompt: cfg.prompt,
        response_format: 'text',
        language: cfg.language,
        temperature: 0.0,
      });
      return transcription;
    } catch (error) {
      lastError = error;
      const retryable = ['Connection error', '499', 'ECONNREFUSED', 'ETIMEDOUT'].some(msg => error.message.includes(msg));
      if (!retryable || attempt === cfg.maxRetries) throw error;

      const delay = Math.min(cfg.maxRetryDelay, cfg.retryDelay * Math.pow(2, attempt - 1) * (0.5 + Math.random()));
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Cleanup temporary chunks
 */
function cleanupChunks(tempDir = DEFAULT_CONFIG.tempDir) {
  if (!fs.existsSync(tempDir)) return;
  fs.readdirSync(tempDir).forEach(file => fs.unlinkSync(path.join(tempDir, file)));
  fs.rmdirSync(tempDir);
}

/**
 * Main transcription function
 */
async function transcribeAudio(inputPath, outputPath, config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  if (!fs.existsSync(inputPath)) throw new Error(`Input file '${inputPath}' not found`);

  if (!fs.existsSync(cfg.tempDir)) fs.mkdirSync(cfg.tempDir, { recursive: true });

  const audioChunks = await splitAudioIntoChunks(inputPath, cfg);

  let fullTranscript = '';
  for (let i = 0; i < audioChunks.length; i++) {
    try {
      const chunkTranscript = await transcribeAudioWithRetry(audioChunks[i], cfg, i + 1, audioChunks.length);
      fullTranscript += chunkTranscript + '\n\n';
      fs.writeFileSync(outputPath, fullTranscript);
    } catch (error) {
      console.error(`Failed chunk ${i + 1}: ${error.message}`);
      continue;
    }
  }

  cleanupChunks(cfg.tempDir);
  return fullTranscript.trim();
}

export { transcribeAudio, transcribeAudioWithRetry, splitAudioIntoChunks, cleanupChunks };
