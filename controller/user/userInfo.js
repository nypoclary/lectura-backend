import database from "../../database/db.js";

const userInfo = async (req, res) => {
  const userId = req.userId;

  try {
    const [row] = await database.query(
      `SELECT name, vark_type FROM user WHERE id = ?`,
      [userId]
    );
    return res
      .status(200)
      .json({ name: row[0].name, vark_type: row[0].vark_type });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ payload: "Internal Server Error" });
  }
};

export default userInfo;
