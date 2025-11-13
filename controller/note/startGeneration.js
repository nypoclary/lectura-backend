import database from "../../database/db.js";
// --- GetObjectCommand is no longer needed ---
import { r2, PutObjectCommand } from "../../lib/r2.js";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import fs from "fs"; // --- ADDED fs
import path from "path"; // --- ADDED path
import full_note_flow from "../../lib/full_note_flow(old).js";
dotenv.config();

// --- streamToBuffer is no longer needed as we'll use readFileSync ---

const startGenerate = async (req, res) => {
  const userId = req.userId;
  const { convertedKey: key, fileName: originalFileName } = req.body;

  let fileName = originalFileName;
  if (fileName && fileName.toLowerCase().endsWith(".mp4")) {
    fileName = fileName.slice(0, -4) + ".mp3";
  } else if (fileName && !fileName.toLowerCase().endsWith(".mp3")) {
    fileName = fileName.replace(/\.[^/.]+$/, "") + ".mp3";
  }

  if (!key) {
    return res.status(400).json({ message: "Please upload a file" });
  }

  // --- 1. Define the path to the local temp file ---
  const tempDir = path.resolve(process.cwd(), "temp_uploads");
  const localFilePath = path.join(tempDir, key);

  try {
    // --- 2. Check if the local file exists ---
    if (!fs.existsSync(localFilePath)) {
      console.error("Local temp file not found:", localFilePath);
      return res.status(404).json({
        message:
          "File not found. Your session may have expired. Please re-upload.",
      });
    }

    // --- 3. Read the file from the local temp folder ---
    const buffer = fs.readFileSync(localFilePath);

    // --- This part remains mostly the same ---
    const originalFilePath = `originalFile/${uuidv4()}${fileName}`;
    const insertNote = await database.query(
      `INSERT INTO note (name, originalFilePath, created_at, status, user_id) VALUES (?, ?, NOW(), ?, ?)`,
      [fileName, originalFilePath, "pending", userId]
    );

    const note = insertNote[0];

    // --- 4. Upload the buffer (from the local file) to R2 ---
    await r2.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: originalFilePath,
        Body: buffer,
        ContentType: "audio/mpeg",
      })
    );

    // --- 5. Clean up the local temp file after successful upload ---
    try {
      fs.unlinkSync(localFilePath);
    } catch (cleanupError) {
      console.error("Error cleaning up temp file:", cleanupError);
      // Don't fail the request for this, just log it
    }

    // --- 6. Start the background job ---
    full_note_flow(note.insertId);

    res.status(200).json({
      message: "MP3 file moved to temporary to storage",
      noteId: note.insertId,
    });
  } catch (error) {
    console.log(error);
    // If we failed, try to clean up the temp file just in case
    try {
      if (fs.existsSync(localFilePath)) {
        fs.unlinkSync(localFilePath);
      }
    } catch (e) {}
    return res
      .status(500)
      .json({ message: "Error processing request", error: error.message });
  }
};

export default startGenerate;