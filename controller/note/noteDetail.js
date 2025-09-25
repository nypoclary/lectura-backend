import { r2, GetObjectCommand } from "../../lib/r2.js";
import database from "../../database/db.js";
import dotenv from "dotenv";
dotenv.config();
const noteDetail = async (req, res) => {
  const { noteId } = req.params;
  const userId = req.userId;

  try {
    const [row] = await database.query(
      `SELECT * FROM note WHERE id = ? AND user_id = ?`,
      [noteId, userId]
    );
    const note = row[0];

    const explanationFilePath = note.explanationFilePath;

    const { Body: noteFile } = await r2.send(
      new GetObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: explanationFilePath,
      })
    );
    const originalFinalName = cleanFilename(note.originalFilePath.slice(49));
    const explanationText = await noteFile.transformToString();

    const noteResponse = {
      ...note,
      explanationText: explanationText,
      originalFinalName: originalFinalName,
    };
    return res.status(200).json({ noteResponse: noteResponse });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ payload: "Internal Server Error" });
  }
};

function cleanFilename(filename) {
  // Remove UUID prefix
  let cleaned = filename.replace(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/i,
    ""
  );

  return cleaned;
}

export default noteDetail;
