import database from "../database/db.js";
import { r2, GetObjectCommand, PutObjectCommand } from "./r2.js";
import dotenv from "dotenv";
import { Groq } from "groq-sdk";
import { Mistral } from '@mistralai/mistralai'
import { v4 as uuidv4 } from "uuid";
import { JigsawStack } from 'jigsawstack';
import fs from "fs";
import path from "path";
import { transcribeAudio } from "./transcription.js";
import os from "os";
import generateLectureNotesFlow from "./noteTaking.js";
// Removed ffmpeg dependency - using simpler byte-based chunking

dotenv.config();

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

const mistral = new Mistral({
    apiKey: process.env.MISTRAL_API_KEY,
});

const jigsaw = JigsawStack({
    apiKey: process.env.JIGSAWSTACk_API_KEY,
})

const LEARNING_STYLES = {
    visual: {
        name: "Visual Learner",
        description: "Prefers visual representations like diagrams, charts, and spatial organization"
    },
    auditory: {
        name: "Auditory Learner",
        description: "Learns best through listening, discussions, and verbal explanations"
    },
    "read-write": {
        name: "Reading/Writing Learner",
        description: "Prefers written words, lists, notes, and textual information"
    },
    kinesthetic: {
        name: "Kinesthetic Learner",
        description: "Learns through doing, physical activities, hands-on experiences"
    }
};

const streamToBuffer = async (stream) => {
    const chunks = [];
    return new Promise((resolve, reject) => {
        stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        stream.on("error", (err) => reject(err));
        stream.on("end", () => resolve(Buffer.concat(chunks)));
    });
};

async function retryWithBackOff(fn, retries = 5, baseDelay = 2000, maxDelay = 30000) {
    let attempt = 0;
    let lastError;

    while (attempt < retries) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            attempt++;

            const isRetryable =
                err.message?.includes("Connection error") ||
                err.message?.includes("ECONNREFUSED") ||
                err.message?.includes("ETIMEDOUT") ||
                err.message?.includes("500") ||
                err.message?.includes("rate limit");

            if (!isRetryable || attempt === retries) {
                throw err;
            }

            const delay = Math.min(
                maxDelay,
                baseDelay * Math.pow(2, attempt - 1) * (0.5 + Math.random())
            );

            console.warn(
                `Attempt ${attempt} failed: ${err.message}. Retrying in ${Math.round(delay / 1000)}s...`
            );
            await new Promise((res) => setTimeout(res, delay));
        }
    }

    throw lastError;
}

const TEMP_ROOT = path.join(process.cwd(), "temp_chunks");
if (!fs.existsSync(TEMP_ROOT)) fs.mkdirSync(TEMP_ROOT, { recursive: true });

// Helper function to get file size in MB
function getFileSizeInMB(filePath) {
    const stats = fs.statSync(filePath);
    return stats.size / (1024 * 1024);
}

// Simple byte-based chunking - removed complex FFmpeg splitting

async function transcribeWithSizeCheck(buffer) {
    const tempInputPath = path.join(TEMP_ROOT, `${uuidv4()}_input.mp3`);

    try {
        // Write original buffer to temp file
        await fs.promises.writeFile(tempInputPath, buffer);

        const fileSizeMB = getFileSizeInMB(tempInputPath);
        console.log(`File size: ${fileSizeMB.toFixed(2)} MB`);

        // If file is under 18MB, transcribe directly
        if (fileSizeMB < 18) {
            return await retryWithBackOff(async () => {
                const response = await groq.audio.transcriptions.create({
                    file: fs.createReadStream(tempInputPath),
                    model: "whisper-large-v3-turbo",
                    response_format: "text",
                    language: "en",
                    temperature: 0,
                });

                if (!response?.text) {
                    throw new Error("Empty transcription result");
                }
                return response.text;
            });
        }

        // If file is too large, split it using simple byte-based chunks
        // But preserve some buffer to avoid cutting in the middle of audio frames
        console.log("File too large, splitting into byte chunks...");

        const maxChunkSize = 17 * 1024 * 1024; // 17MB to be safe
        const chunks = [];

        for (let start = 0; start < buffer.length; start += maxChunkSize) {
            const end = Math.min(start + maxChunkSize, buffer.length);
            chunks.push(buffer.slice(start, end));
        }

        console.log(`Split into ${chunks.length} chunks`);

        let fullTranscript = "";

        for (let idx = 0; idx < chunks.length; idx++) {
            const chunk = chunks[idx];
            const chunkPath = path.join(TEMP_ROOT, `${uuidv4()}_chunk_${idx}.mp3`);

            try {
                await fs.promises.writeFile(chunkPath, chunk);
                const chunkSizeMB = getFileSizeInMB(chunkPath);

                console.log(`Processing chunk ${idx + 1}/${chunks.length} (${chunkSizeMB.toFixed(2)} MB)`);

                const text = await retryWithBackOff(async () => {
                    const response = await groq.audio.transcriptions.create({
                        file: fs.createReadStream(chunkPath),
                        model: "whisper-large-v3-turbo",
                        response_format: "text",
                        language: "en",
                        temperature: 0,
                    });

                    if (!response?.text) {
                        throw new Error("Empty transcription result");
                    }
                    return response.text;
                });

                fullTranscript += text + (idx < chunks.length - 1 ? "\n\n" : "");
                console.log(`✅ Completed chunk ${idx + 1}/${chunks.length}`);

                // Add small delay between requests to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 2000));

            } catch (error) {
                console.error(`❌ Failed to transcribe chunk ${idx + 1}:`, error.message);

                // If it's a file format error, we might need to handle it differently
                if (error.message.includes('format') || error.message.includes('codec')) {
                    console.log(`Skipping corrupted chunk ${idx + 1} due to format issues`);
                    fullTranscript += `\n\n[Audio segment ${idx + 1} could not be processed due to format issues]\n\n`;
                } else {
                    // For other errors, try to continue
                    fullTranscript += `\n\n[Transcription failed for segment ${idx + 1}]\n\n`;
                }
            } finally {
                // Cleanup chunk file
                try {
                    if (fs.existsSync(chunkPath)) {
                        fs.unlinkSync(chunkPath);
                    }
                } catch (cleanupError) {
                    console.warn(`Cleanup error for chunk ${idx + 1}:`, cleanupError.message);
                }
            }
        }

        return fullTranscript;

    } finally {
        // Cleanup input file
        try {
            if (fs.existsSync(tempInputPath)) {
                fs.unlinkSync(tempInputPath);
            }
        } catch (cleanupError) {
            console.warn("Input cleanup error:", cleanupError.message);
        }
    }
}

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

        console.log("📝 Starting transcription...");

        const { Body: MP3File } = await r2.send(
            new GetObjectCommand({
                Bucket: process.env.R2_BUCKET_NAME,
                Key: originalFilePath,
            })
        );

        const buffer = await streamToBuffer(MP3File);
        // const fullTranscript = await transcribeWithSizeCheck(buffer);

        // Save MP3 buffer to temporary file
        const tempInputPath = path.join(TEMP_ROOT, `${uuidv4()}_input.mp3`);
        await fs.promises.writeFile(tempInputPath, buffer);

        // Create temporary output file path
        const tempOutputPath = path.join(TEMP_ROOT, `${uuidv4()}_output.txt`);

        // Call your new transcription module
        const fullTranscript = await transcribeAudio(tempInputPath, tempOutputPath);


        if (!fullTranscript || fullTranscript.trim().length === 0) {
            throw new Error("Transcription resulted in empty text");
        }

        await database.query("UPDATE note SET status = ? WHERE id = ?", [
            "transcribed",
            noteId,
        ]);

        console.log("✅ Transcription completed");

        // Fix the VARK type query
        const [userRows] = await database.query("SELECT vark_type FROM user WHERE id = ?", [userId]);
        const userRow = userRows[0];

        if (!userRow) {
            throw new Error("User not found");
        }

        const vark_type = userRow.vark_type || 'read-write'; // Default fallback

        await database.query("UPDATE note SET status = ? WHERE id = ?", [
            "converting",
            noteId,
        ]);

        console.log("🔄 Converting to study notes...");

        // const chatResponse = await mistral.chat.complete({
        //     model: "mistral-small-2503",
        //     messages: [
        //         {
        //             role: "system",
        //             content: "You are an expert educator who creates detailed, engaging lecture notes tailored to different learning styles."
        //         },
        //         {
        //             role: "user",
        //             content: buildUserPrompt(fullTranscript, vark_type)
        //         }
        //     ],
        //     temperature: 0.3,
        //     maxTokens: 128000,
        //     safePrompt: false,
        // });

        // const generatedContent = chatResponse.choices[0]?.message?.content || "";

        const generatedContent = await generateLectureNotesFlow(fullTranscript, vark_type);

        if (!generatedContent) {
            throw new Error("Failed to generate study notes");
        }

        await database.query("UPDATE note SET status = ? WHERE id = ?", [
            "finalizing",
            noteId,
        ]);

        console.log("📄 Finalizing notes...");

        const explanationFilePath = `explanationFile/${uuidv4()}_${name.replace(/[^a-zA-Z0-9]/g, '_')}.txt`;

        await r2.send(new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: explanationFilePath,
            Body: Buffer.from(generatedContent, "utf-8"),
            ContentType: "text/plain"
        }));

        // Update status to completed
        await database.query(
            "UPDATE note SET status = ?, explanationFilePath = ? WHERE id = ?",
            ["completed", explanationFilePath, noteId]
        );

        const endTime = new Date(); // Record finish time
        const duration = (endTime - startTime) / 1000; // duration in seconds

        console.log(`🎉 Process completed successfully!`);
        console.log(`⏱ Flow finished at: ${endTime.toISOString()}`);
        console.log(`⏳ Total duration: ${duration.toFixed(2)} seconds`);

    } catch (err) {
        console.error("❌ Full note flow failed:", err);
        await database.query("UPDATE note SET status = ? WHERE id = ?", [
            "failed",
            noteId,
        ]);

        const failTime = new Date();
        const duration = (failTime - startTime) / 1000;
        console.log(`⏱ Flow failed at: ${failTime.toISOString()}`);
        console.log(`⏳ Duration until failure: ${duration.toFixed(2)} seconds`);
        throw err;
    } finally {
        // Cleanup temp files
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

function buildUserPrompt(transcriptText, learningStyle) {
    const basePrompt = `
You are a university lecturer tasked with rewriting your full 3-hour lecture into a student-facing teaching document. This document will be read by a student who missed class entirely and needs to understand everything deeply — as if they were there.

Your job is to convert the entire transcript into a comprehensive, structured, and easy-to-follow explanation, covering **all** details, logic, transitions, and background context.

Rules:
- DO NOT summarize, compress, or leave anything out. This is a **1:1 rewrite** of the full lecture — rewritten in clean explanatory paragraphs.
- Write in **full sentences and paragraphs**, not just bullet points.
- Explain every term, concept, and process as if teaching it from scratch.
- For each technical term, provide a brief definition and **why it matters**.
- Include section headers and subheaders for organization (e.g., Introduction, Key Concepts, Applications).
- Keep the structure similar to how the lecture unfolded — preserve flow and topic order.
- If the lecturer repeats something, explain it again as repetition for emphasis.
- Add clarification or expansion wherever the transcript lacks it — assume the reader has no prior knowledge.
- **Do not skip side remarks, jokes, or comments that seem unrelated — include them clearly as they might help with memory, engagement, or exam hints.**
- **Preserve any emotional cues, humor, sarcasm, or casual tone from the speaker if it affects how students interpret the message.**

Tone:
- Professional, but easy to follow.
- Your voice is that of a helpful professor explaining clearly to a student.
- Do not sound robotic or just like a transcript.

At the end of the document, include a "**Study Tip Summary**" with a recap of:
- Key topics (and summarize each of them briefly)
- Common misunderstandings  
- Critical formulas or definitions to memorize
- Provide study strategies tailored to the student's learning style, but not as generic commands. Instead, show guidance connected to the key exam topics from this lecture.
`;

    // Add learning-style specific instructions
    let styleSpecificPrompt = "";

    switch (learningStyle) {
        case 'visual':
            styleSpecificPrompt = `
SPECIAL INSTRUCTIONS FOR VISUAL LEARNER:
- Create vivid visual descriptions and mental imagery for concepts
- Suggest diagrams, charts, or mind maps that could represent the information
- Use spatial language (e.g., "imagine this as a layered structure")
- Include recommendations for color-coding information
- Describe relationships using visual metaphors
- Suggest creating flashcards with visual cues
- Recommend drawing concepts rather than just writing them
`;
            break;

        case 'auditory':
            styleSpecificPrompt = `
SPECIAL INSTRUCTIONS FOR AUDITORY LEARNER:
- Include suggestions for reading notes aloud
- Recommend recording and listening to key concepts
- Suggest creating rhymes, songs, or mnemonics for memorization
- Encourage discussing concepts with study partners
- Include verbal explanations and talking through processes
- Recommend listening to related podcasts or audio resources
- Suggest explaining concepts to someone else as a study method
`;
            break;

        case 'read-write':
            styleSpecificPrompt = `
SPECIAL INSTRUCTIONS FOR READING/WRITING LEARNER:
- Provide comprehensive written explanations
- Include detailed lists and organized notes
- Suggest rewriting concepts in own words
- Recommend creating detailed study guides
- Include potential essay questions or writing prompts
- Suggest keeping a learning journal
- Provide extensive definitions and written examples
`;
            break;

        case 'kinesthetic':
            styleSpecificPrompt = `
SPECIAL INSTRUCTIONS FOR KINESTHETIC LEARNER:
- Include hands-on activities and experiments
- Suggest physical movements or gestures to remember concepts
- Recommend building models or physical representations
- Include real-world applications and practical exercises
- Suggest study breaks with physical activity
- Recommend using manipulatives or tactile learning tools
- Include "try this" activities throughout the notes
`;
            break;
    }

    return `${basePrompt}
${styleSpecificPrompt}

Now rewrite the following lecture transcript into a complete, self-contained, deeply explained document tailored for a ${LEARNING_STYLES[learningStyle].name}:

Transcript:
${transcriptText}
`;
}

export default full_note_flow;