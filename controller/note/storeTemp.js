import { r2, PutObjectCommand } from "../../lib/r2.js";
import { v4 as uuidv4 } from "uuid";
import { exec } from "child_process";
import formidable from "formidable";
import fs from "fs";
import path from "path";
import os from "os";

const storeTemp = async (req, res) => {
  let responseHandled = false;

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
    const outputName = `${uuidv4()}.mp3`;
    const outputPath = path.join(os.tmpdir(), outputName);

    console.log("Converting file to MP3:", inputPath);
    console.log("Output path:", outputPath);

    // First, analyze the file to check if it has an audio stream
    exec(
      `ffmpeg -i "${inputPath}" -hide_banner`,
      (analyzeError, analyzeStdout, analyzeStderr) => {
        // Determine if we need to generate silent audio or extract existing audio
        const hasAudio =
          analyzeStderr.includes("Stream") && analyzeStderr.includes("Audio");

        // Command for files with audio vs files without audio
        const ffmpegCmd = hasAudio
          ? `ffmpeg -i "${inputPath}" -vn -ar 44100 -ac 2 -b:a 192k "${outputPath}"`
          : `ffmpeg -f lavfi -i anullsrc=r=44100:cl=stereo -t 1 -b:a 192k "${outputPath}"`;

        // Execute the appropriate command
        exec(ffmpegCmd, async (error, stdout, stderr) => {
          if (error) {
            console.error("FFmpeg error:", error);
            console.error("FFmpeg stderr:", stderr);
            if (!responseHandled) {
              responseHandled = true;
              res.status(500).json({ error: "FFmpeg conversion failed" });
            }

            // Clean up input file
            try {
              if (fs.existsSync(inputPath)) {
                fs.unlinkSync(inputPath);
              }
            } catch (e) {
              console.error("Cleanup error:", e);
            }

            return;
          }

          try {
            // Check if output file was created
            if (!fs.existsSync(outputPath)) {
              throw new Error("Output file was not created");
            }

            // Read the output file
            const fileBuffer = fs.readFileSync(outputPath);

            // Upload to R2
            await r2.send(
              new PutObjectCommand({
                Bucket: process.env.R2_BUCKET_NAME,
                Key: outputName,
                Body: fileBuffer,
                ContentType: "audio/mpeg",
              })
            );

            // Clean up files
            try {
              if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
              if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
            } catch (cleanupError) {
              console.error("Cleanup error:", cleanupError);
            }

            if (!responseHandled) {
              responseHandled = true;
              res.json({ success: true, key: outputName });
            }
          } catch (processError) {
            console.error("Processing error:", processError);
            if (!responseHandled) {
              responseHandled = true;
              res
                .status(500)
                .json({ error: processError.message || "Processing failed" });
            }

            // Clean up files
            try {
              if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
              if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
            } catch (e) {
              console.error("Cleanup error:", e);
            }
          }
        });
      }
    );
  });
};

export default storeTemp;
