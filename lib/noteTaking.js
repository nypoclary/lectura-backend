import fs from 'fs';
import path from 'path';
import 'dotenv/config';
import { Mistral } from '@mistralai/mistralai';
import { GoogleGenAI } from "@google/genai"; // <-- ADDED: Import GoogleGenAI

const mistral = new Mistral({
  apiKey: process.env.MISTRAL_API_KEY || ''
});

// VARK Learning Style Definitions
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

async function generateLectureNotesFlow(transcriptText, learningStyle = 'r', options = {}) {
  if (!transcriptText || transcriptText.trim().length === 0) {
    throw new Error("Transcript text is empty or not provided.");
  }

  if (!LEARNING_STYLES[learningStyle]) {
    throw new Error(`Invalid learning style '${learningStyle}'. Must be one of: v, a, r, k`);
  }

  // --- Model-agnostic parameters ---
  const temperature = options.temperature ?? 0.3;
  const outputPath = options.outputPath; // optional

  // --- Build the prompt once ---
  const userPrompt = buildUserPrompt(transcriptText, learningStyle);

  // --- Token approximation and Model Switching Logic ---
  // We approximate tokens. A common heuristic is ~4 characters per token.
  // So, 10,000 tokens is approximately 40,000 characters.
  const characterCount = transcriptText.length;
  const tokenThreshold = 10000;
  const charThreshold = tokenThreshold * 4; // 40,000 characters

  let generatedContent = "";

  if (characterCount > charThreshold) {
    // --- USE GEMINI 2.5 PRO (from your example) ---
    console.log(`Transcript length (${characterCount} chars) > ${charThreshold}. Using Gemini 2.5 Pro.`);

    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY environment variable is not set for large transcript.");
    }

    const genAI = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        authClient: null  
    });

    // Use settings from your 'processNoteInBackground' example
    const result = await genAI.models.generateContent({
        model: 'gemini-2.5-pro', 
        contents: [{ role: "user", parts: [{ text: userPrompt }] }], // Use the VARK prompt
        generationConfig: {
            maxOutputTokens: 128000, // Use a high limit
            temperature: temperature, // Use the passed-in temp
            topP: 0.95
        }
    });

    generatedContent = result.text; // Get text as per your example

  } else {
    // --- USE MISTRAL (existing logic) ---
    console.log(`Transcript length (${characterCount} chars) <= ${charThreshold}. Using Mistral.`);

    if (!process.env.MISTRAL_API_KEY) {
      throw new Error("MISTRAL_API_KEY environment variable is not set.");
    }

    const model = options.model || "mistral-medium-2508";
    const maxTokens = options.maxTokens ?? 128000; // Keep this high

    const chatResponse = await mistral.chat.complete({
      model,
      messages: [
        { role: "system", content: "You are an expert educator creating detailed lecture notes tailored to different learning styles." },
        { role: "user", content: userPrompt } // Use the VARK prompt
      ],
      temperature,
      maxTokens,
      safePrompt: false
    });

    generatedContent = chatResponse.choices[0]?.message?.content || "";
  }

  // --- Post-processing (same as before) ---
  if (!generatedContent || generatedContent.trim().length === 0) {
    throw new Error("Generated lecture notes are empty.");
  }

  if (outputPath) {
    fs.writeFileSync(outputPath, generatedContent);
  }

  return generatedContent;
}


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
- Create diagrams, charts, or mind maps that could represent the information in the explanation (use the mermaid npm package's visual format)
- Allowed chart types (Flowchart = graph, Sequence Diagram = sequenceDiagram, Gantt Chart = gantt, Class Diagram = classDiagram, State Diagram = stateDiagram-v2, Pie Chart = pie, and ER Diagram = erDiagram)
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

export default generateLectureNotesFlow;