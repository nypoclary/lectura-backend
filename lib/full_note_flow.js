import database from "../database/db.js";
import { r2, GetObjectCommand, PutObjectCommand } from "./r2.js";
import dotenv from "dotenv";
// --- We are not using Groq or Mistral directly in this file ---
// import { Groq } from "groq-sdk";
// import { Mistral } from "@mistralai/mistralai";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";
import { transcribeAudio } from "./transcription.js";
// import os from "os"; // Not used
import generateLectureNotesFlow from "./noteTaking.js";
import generateSpeech from "./tts.js";

dotenv.config();

// --- No need for groq/mistral instances here ---

// --- LEARNING_STYLES definition removed (it's in noteTaking.js) ---

const streamToBuffer = async (stream) => {
  // ... (No changes to this function)
  const chunks = [];
  return new Promise((resolve, reject) => {
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on("error", (err) => reject(err));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });
};

// --- retryWithBackOff removed (it's in transcription.js) ---

// --- TEMP_ROOT definition and chunking logic removed (it's in transcription.js) ---
const TEMP_ROOT = path.join(process.cwd(), "temp_chunks"); // Still need this for temp files
if (!fs.existsSync(TEMP_ROOT)) fs.mkdirSync(TEMP_ROOT, { recursive: true });


const full_note_flow = async (noteId) => {
  const startTime = new Date(); // Record start time
  console.log(`⏱ Flow started at: ${startTime.toISOString()}`);

  // Keep track of temp file paths for cleanup
  let tempInputPath, tempOutputPath;

  try {
    const [rows] = await database.query("SELECT * FROM note WHERE id = ?", [
      noteId,
    ]);
    const row = rows[0];
    if (!row) throw new Error("Note not found");

    const originalFilePath = row.originalFilePath;
    const userId = row.user_id;
    const name = row.name;

    await database.query(
      'UPDATE note SET status = "transcribing" WHERE id = ?',
      [noteId]
    );

    console.log("📝 Starting transcription (in parallel)...");

    const { Body: MP3File } = await r2.send(
      new GetObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: originalFilePath,
      })
    );

    const buffer = await streamToBuffer(MP3File);

    // Save MP3 buffer to temporary file
    tempInputPath = path.join(TEMP_ROOT, `${uuidv4()}_input.mp3`);
    await fs.promises.writeFile(tempInputPath, buffer);

    // Create temporary output file path
    tempOutputPath = path.join(TEMP_ROOT, `${uuidv4()}_output_full_transcript.txt`);

    // Call your transcription module
    // --- THIS NOW RETURNS AN ARRAY OF TEXT CHUNKS ---
    const transcriptChunks = await transcribeAudio(tempInputPath, tempOutputPath);

    if (!transcriptChunks || transcriptChunks.length === 0 || transcriptChunks.every(t => t.startsWith("[Transcription failed"))) {
      throw new Error("Transcription resulted in empty text");
    }

    await database.query("UPDATE note SET status = ? WHERE id = ?", [
      "transcribed",
      noteId,
    ]);

    console.log("✅ Transcription completed");

    // Fix the VARK type query
    const [userRows] = await database.query(
      "SELECT vark_type FROM user WHERE id = ?",
      [userId]
    );
    const userRow = userRows[0];

    if (!userRow) {
      throw new Error("User not found");
    }

    const vark_type = userRow.vark_type || "read-write"; // Default fallback

    await database.query("UPDATE note SET status = ? WHERE id = ?", [
      "converting",
      noteId,
    ]);

    console.log(`🔄 Converting ${transcriptChunks.length} text chunks to study notes (in parallel)...`);

    // --- PARALLEL NOTE GENERATION START ---
    const noteGenerationPromises = transcriptChunks.map((chunkText, i) => {
        // Don't send empty/failed chunks to Mistral
        if (chunkText.startsWith("[Transcription failed") || chunkText.trim().length === 0) {
            console.warn(`Skipping note generation for chunk ${i+1} (transcription failed)`);
            return Promise.resolve({ 
                index: i, 
                notes: chunkText // Pass through the error message
            });
        }
        
        console.log(`[Note Gen] Starting chunk ${i+1}/${transcriptChunks.length}`);
        return generateLectureNotesFlow(chunkText, vark_type)
            .then(noteChunk => {
                console.log(`[Note Gen] ✅ Finished chunk ${i+1}/${transcriptChunks.length}`);
                return { index: i, notes: noteChunk };
            })
            .catch(err => {
                console.error(`[Note Gen] ❌ Failed chunk ${i+1}/${transcriptChunks.length}: ${err.message}`);
                return { index: i, notes: `[Failed to generate notes for this section: ${err.message}]` };
            });
    });

    const completedNoteChunks = await Promise.all(noteGenerationPromises);
    // --- PARALLEL NOTE GENERATION END ---

    // Sort by index to ensure correct order
    completedNoteChunks.sort((a, b) => a.index - b.index);

    // Join the final note documents
    const generatedContent = completedNoteChunks.map(chunk => chunk.notes).join('\n\n');

    if (!generatedContent || generatedContent.trim().length === 0 || generatedContent.trim().startsWith("[")) {
      throw new Error("Failed to generate study notes from all chunks");
    }

    console.log("✅ All note chunks generated and combined.");

    await database.query("UPDATE note SET status = ? WHERE id = ?", [
      "finalizing",
      noteId,
    ]);

    let audioFilePath = null;

    if (vark_type === "auditory") {
      console.log("📄 Creating audio files...");

      try {
        const cleanedGeneratedNote = generatedContent.replace(/[*#]/g, "");
        // Call the updated TTS service to get the buffer
        const audioBuffer = await generateSpeech(cleanedGeneratedNote, {
          voice: 'michael' // Or 'sarah', etc.
        });

        // ... (Rest of TTS/R2 upload logic is unchanged) ...
        audioFilePath = `audioExplanationFile/${uuidv4()}_${name.replace(
          /[^a-zA-Z0-9]/g,
          "_"
        )}.mp3`;

        await r2.send(
          new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: audioFilePath,
            Body: audioBuffer,
            ContentType: "audio/mpeg", 
          })
        );
        console.log("✅ Speech audio saved to R2.");

      } catch (ttsError) {
        console.warn(`⚠️ Failed to generate or save speech audio: ${ttsError.message}`);
      }
    }

    console.log("📄 Finalizing notes...");

    const explanationFilePath = `explanationFile/${uuidv4()}_${name.replace(
      /[^a-zA-Z0-9]/g,
      "_"
    )}.txt`;

    await r2.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: explanationFilePath,
        Body: Buffer.from(generatedContent, "utf-8"),
        ContentType: "text/plain",
      })
    );

    await database.query(
      "UPDATE note SET status = ?, explanationFilePath = ?, audioFilePath = ? WHERE id = ?",
      ["completed", explanationFilePath, audioFilePath, noteId]
    );

    const endTime = new Date();
    const duration = (endTime - startTime) / 1000; // seconds

    console.log(`🎉 Process completed successfully!`);
    console.log(`⏱ Flow finished at: ${endTime.toISOString()}`);
    console.log(`⏳ Total duration: ${duration.toFixed(2)} seconds`);
  } catch (err) {
    // ... (No changes to error handling) ...
    console.error("❌ Full note flow failed:", err);
    await database.query("UPDATE note SET status = ? WHERE id = ?", [
      "failed",
      noteId,
    ]);

    const failTime = new Date();
    const duration = (failTime - startTime) / 1000;
    console.log(`⏱ Flow failed at: ${failTime.toISOString()}`);
    console.log(`⏳ Duration until failure: ${duration.toFixed(2)} seconds`);
    // Do not re-throw, or the process might crash the worker
    // throw err; 
  } finally {
    // ... (No changes to cleanup) ...
    try {
      if (tempInputPath && fs.existsSync(tempInputPath)) {
        fs.unlinkSync(tempInputPath);
      }
      if (tempOutputPath && fs.existsSync(tempOutputPath)) {
        fs.unlinkSync(tempOutputPath);
      }
    } catch (cleanupError) {
      console.warn("Temp file cleanup error:", cleanupError.message);
    }
  }
};

// --- buildUserPrompt function removed (it's in noteTaking.js) ---

export default full_note_flow;