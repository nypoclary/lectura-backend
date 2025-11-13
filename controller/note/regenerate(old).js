import database from "../../database/db.js";
import { r2, PutObjectCommand, GetObjectCommand } from "../../lib/r2.js";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import full_note_flow from "../../lib/full_note_flow(old).js";
dotenv.config();

const streamToBuffer = async (stream) => {
  const chunks = [];
  return new Promise((resolve, reject) => {
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on("error", (err) => reject(err));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });
};

const regenerate = async (req, res) => {
  const userId = req.userId;
  const { noteId, convertedKey: key, fileName: originalFileName } = req.body;

  try {
    let fileName;
    let originalFilePath;
    let buffer;

    if (key) {
      // ===== CASE 1: New file uploaded (like startGenerate) =====
      fileName = originalFileName;
      if (fileName && fileName.toLowerCase().endsWith(".mp4")) {
        fileName = fileName.slice(0, -4) + ".mp3";
      } else if (fileName && !fileName.toLowerCase().endsWith(".mp3")) {
        fileName = fileName.replace(/\.[^/.]+$/, "") + ".mp3";
      }

      originalFilePath = `originalFile/${uuidv4()}${fileName}`;

      const { Body: MP3file } = await r2.send(
        new GetObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: key,
        })
      );
      buffer = await streamToBuffer(MP3file);

      // Upload to new path in R2
      await r2.send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: originalFilePath,
          Body: buffer,
          ContentType: "audio/mpeg",
        })
      );

      // Update DB with new file
      await database.query(
        `UPDATE note SET name = ?, originalFilePath = ?, created_at = NOW(), status = "pending" WHERE id = ? AND user_id = ?`,
        [fileName, originalFilePath, noteId, userId]
      );
    } else {
      // ===== CASE 2: Reuse old file =====
      const [rows] = await database.query(
        `SELECT name, originalFilePath FROM note WHERE id = ? AND user_id = ? LIMIT 1`,
        [noteId, userId]
      );

      if (!rows || rows.length === 0) {
        return res.status(404).json({ message: "Note not found" });
      }

      fileName = rows[0].name;
      originalFilePath = rows[0].originalFilePath;

      const { Body: MP3file } = await r2.send(
        new GetObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: originalFilePath,
        })
      );
      buffer = await streamToBuffer(MP3file);

      // Just mark status as pending again
      await database.query(
        `UPDATE note SET status = "pending", created_at = NOW() WHERE id = ? AND user_id = ?`,
        [noteId, userId]
      );
    }

    // Restart the note processing
    full_note_flow(noteId);

    res.status(200).json({
      message: key
        ? "MP3 file replaced and processing restarted"
        : "Existing MP3 reused and processing restarted",
      noteId,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Error processing request",
      error: error.message,
    });
  }
};

export default regenerate;
