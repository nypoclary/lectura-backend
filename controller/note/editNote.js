import database from "../../database/db.js";
import { r2, PutObjectCommand } from "../../lib/r2.js";
import dotenv from "dotenv";
dotenv.config();

const editNote = async (req, res) => {
  const { textMd, noteId } = req.body;

  try {
    const [row] = await database.query(
      `SELECT explanationFilePath FROM note WHERE id = ?`,
      [noteId]
    );
    const explanationFilePath = row[0].explanationFilePath;

    await r2.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: explanationFilePath,
        Body: textMd,
        ContentType: "text/plain",
      })
    );
    return res.status(200).json({ payload: "Note Updated Successfully" });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ payload: "Internval Server Error" });
  }
};

export default editNote;
