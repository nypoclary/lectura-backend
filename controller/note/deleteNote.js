import database from "../../database/db.js";
import { r2, DeleteObjectCommand } from "../../lib/r2.js";
import dotenv from "dotenv";
dotenv.config();

const deleteNote = async (req, res) => {
  const { noteId } = req.params;
  try {
    const [row] = await database.query(
      `SELECT explanationFilePath FROM note WHERE id = ?`,
      [noteId]
    );
    console.log(row);
    const explanationFilePath = row[0].explanationFilePath;

    await r2.send(
      new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: explanationFilePath,
      })
    );

    const [secondRow] = await database.query(`DELETE FROM note WHERE id = ?`, [
      noteId,
    ]);

    return res.status(200).json({ payload: "File Deleted Successfully" });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ payload: "Internval Server Error" });
  }
};

export default deleteNote;
