import database from "../../database/db.js";

const history = async (req, res) => {
  const userId = req.userId;

  try {
    const [row] = await database.query(
      `SELECT name, id, created_at FROM note WHERE user_id = ?`,
      [userId]
    );

    return res.status(200).json({ noteList: row });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ payload: "Internal Server Error" });
  }
};

export default history;
