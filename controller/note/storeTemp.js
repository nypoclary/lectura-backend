import { r2, GetObjectCommand, PutObjectCommand } from "../../../r2.js";
import { v4 as uuidv4 } from 'uuid';
import Ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";

const storeTemp = async (req, res) => {
    const userId = req.userId;
    const file = req.file;
    const fileName = file.name;
    const inputPath = file.path;
    const outputName = uuidv4() + fileName.replace(/\.[^/.]+$/, "") + ".mp3";
    const outputPath = path.join('temp', outputName)

    if (!file) {
        return res.status(400).json({ error: "No file upload" })
    }

    try {
        Ffmpeg(inputPath)
            .output(outputPath)
            .audioCodec("libmp3lame")
            .audioBitrate("192k")
            .on("end", async () => {
                const buffer = fs.readFileSync(outputPath)
                try {
                    await r2.send(new PutObjectCommand({
                        Bucket: process.env.R2_BUCKET_NAME,
                        Key: outputPath,
                        Body: buffer,
                        ContentType: "audio/mpeg"
                    }))

                    fs.unlinkSync(inputPath);
                    fs.unlinkSync(outputPath);

                    res.json({ payload: "File converted and uploaded", key: `temp/${outputName}` })
                } catch (err) {
                    console.error("Upload error:", err);
                    res.status(500).json({ error: "Upload failed" });
                }
            })
            .on("error", (err) => {
                console.error("FFmpeg error:", err);
                res.status(500).json({ error: "Conversion failed" });
            })
            .run();
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Unexpected error" });
    }
};

export default storeTemp;