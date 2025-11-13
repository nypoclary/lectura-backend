// --- REMOVED R2 IMPORTS ---
import { v4 as uuidv4 } from "uuid";
import { exec } from "child_process";
import formidable from "formidable";
import fs from "fs";
import path from "path";
import os from "os";

const storeTemp = async (req, res) => {
  let responseHandled = false;

  const tempDir = path.resolve(process.cwd(), "temp_uploads");
  try {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  } catch (dirError) {
    console.error("Failed to create temp directory:", dirError);
    return res.status(500).json({ error: "Server configuration error" });
  }

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

    const inputPath = file.filepath; // This is a temp path from formidable
    const outputName = `${uuidv4()}.mp3`;
    const outputPath = path.join(tempDir, outputName);

    // --- NEW LOGIC: CHECK FILE TYPE ---
    const fileType = file.mimetype;

    if (fileType === "audio/mpeg" || fileType === "audio/mp3") {
      // --- IT'S ALREADY AN MP3! ---
      console.log("File is already an MP3. Moving file...");

      // Just move the file. This is an instant operation.
      fs.rename(inputPath, outputPath, (moveErr) => {
        if (moveErr) {
          console.error("File move error:", moveErr);
          return res.status(500).json({ error: "Failed to move file" });
        }
        console.log("File move complete:", outputPath);
        res.json({ success: true, key: outputName });
      });
      // We are done. No ffmpeg needed.
      return;
    }

    // --- IT'S A VIDEO (or other) FILE, so we run ffmpeg ---
    // (This is your original code, which is correct for videos)
    console.log("File is a video. Converting file to MP3:", inputPath);
    console.log("Output path:", outputPath);

    exec(
      `ffmpeg -i "${inputPath}" -hide_banner`,
      (analyzeError, analyzeStdout, analyzeStderr) => {
        const hasAudio =
          analyzeStderr.includes("Stream") && analyzeStderr.includes("Audio");

        const ffmpegCmd = hasAudio
          ? `ffmpeg -i "${inputPath}" -vn -ar 44100 -ac 2 -b:a 192k "${outputPath}"`
          : `ffmpeg -f lavfi -i anullsrc=r=44100:cl=stereo -t 1 -b:a 192k "${outputPath}"`;

        exec(ffmpegCmd, async (error, stdout, stderr) => {
          if (error) {
            console.error("FFmpeg error:", error);
            console.error("FFmpeg stderr:", stderr);
            if (!responseHandled) {
              responseHandled = true;
              res.status(500).json({ error: "FFmpeg conversion failed" });
            }
            try {
              if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
            } catch (e) {
              console.error("Cleanup error:", e);
            }
            return;
          }

          try {
            if (!fs.existsSync(outputPath)) {
              throw new Error("Output file was not created");
            }
            try {
              if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
            } catch (cleanupError) {
              console.error("Cleanup error (input file):", cleanupError);
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