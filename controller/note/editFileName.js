import database from "../../database/db.js";

const editFileName = async (req, res) => {
  const { fileName, noteId } = req.params;

  try {
    const row = database.query(`UPDATE note SET name = ? WHERE id = ?`, [
      fileName,
      noteId,
    ]);

    if (row.length < 0) {
      return res.status(500).json({ payload: "Internal server error" });
    }

    return res.status(200).json({ payload: "File Name changed" });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ payload: "Internal server error" });
  }
};

export default editFileName;
