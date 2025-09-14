import { r2, PutObjectCommand } from "../../lib/r2.js";
import { v4 as uuidv4 } from "uuid";
import Ffmpeg from "fluent-ffmpeg";
import formidable from "formidable";
import concat from "concat-stream"; // npm install concat-stream
import fs from "fs";

const storeTemp = async (req, res) => {
  const form = formidable({ multiples: false });

  form.parse(req, (err, fields, files) => {
    if (err) {
      console.error("Formidable parse error:", err);
      return res.status(400).json({ error: "File parsing failed" });
    }

    const file = files.file?.[0] || files.file;
    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const inputPath = file.filepath;
    const outputName =
      uuidv4() + "_" + file.originalFilename.replace(/\.[^/.]+$/, "") + ".mp3";

    console.log("Converting file to MP3:", inputPath);

    try {
      // Pipe FFmpeg output into concat-stream to get a buffer
      Ffmpeg(inputPath)
        .format("mp3")
        .audioCodec("libmp3lame")
        .audioBitrate("192k")
        .on("error", (err) => {
          console.error("FFmpeg error:", err);
          return res.status(500).json({ error: "FFmpeg conversion failed" });
        })
        .pipe(
          concat(async (buffer) => {
            try {
              // Upload the buffer to R2
              await r2.send(
                new PutObjectCommand({
                  Bucket: process.env.R2_BUCKET_NAME,
                  Key: outputName,
                  Body: buffer,
                  ContentType: "audio/mpeg",
                  ContentLength: buffer.length,
                })
              );

              // Clean up temp file
              fs.unlinkSync(inputPath);

              res.json({ success: true, key: outputName });
            } catch (uploadErr) {
              console.error("Upload failed:", uploadErr);
              res.status(500).json({ error: "Upload to R2 failed" });
            }
          })
        );
    } catch (err) {
      console.error("Unexpected error:", err);
      res.status(500).json({ error: "Server error" });
    }
  });
};

export default storeTemp;
