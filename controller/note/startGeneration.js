import database from "../../database/db.js";
import { r2, PutObjectCommand, GetObjectCommand } from "../../lib/r2.js";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import fs from "fs";
dotenv.config();

const streamToBuffer = async (stream) => {
  const chunks = [];

  return new Promise((resolve, reject) => {
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on("error", (err) => reject(err));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });
};

const startGenerate = async (req, res) => {
  const userId = req.userId;

  const { convertedKey: key, fileName: originalFileName } = req.body;

  let fileName = originalFileName;
  if (fileName && fileName.toLowerCase().endsWith(".mp4")) {
    fileName = fileName.slice(0, -4) + ".mp3";
  } else if (fileName && !fileName.toLowerCase().endsWith(".mp3")) {
    // If it has another extension or no extension, add .mp3
    fileName = fileName.replace(/\.[^/.]+$/, "") + ".mp3";
  }

  if (!key) {
    return res.status(400).json({ message: "Please upload a file" });
  }

  try {
    const originalFilePath = `originalFile/${uuidv4()}${fileName}`;
    const { Body: MP3file } = await r2.send(
      new GetObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
      })
    );

    const buffer = await streamToBuffer(MP3file);

    const insertNote = await database.query(
      `INSERT INTO note (name, originalFilePath, created_at, status, user_id) VALUES (?, ?, NOW(), ?, ?)`,
      [fileName, originalFilePath, "pending", userId]
    );

    const note = insertNote[0];

    await r2.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: originalFilePath,
        Body: buffer,
        ContentType: "audio/mpeg",
      })
    );

    res.status(200).json({
      message: "MP3 file moved to temporary to storage",
      noteId: note.insertId,
    });
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json({ message: "Error processing request", error: error.message });
  }
};

export default startGenerate;
