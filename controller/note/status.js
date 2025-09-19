import database from "../../database/db.js";

const status = async (req, res) => {
  const { noteId } = req.params;
  const userId = req.userId;

  try {
    const [row] = await database.query(
      `SELECT status FROM note WHERE id = ? AND user_id = ?`,
      [noteId, userId]
    );
    return res.status(200).json({ status: row[0].status });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ payload: "Internal Server Error" });
  }
};

export default status;
