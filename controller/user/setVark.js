import database from "../../database/db.js";

const setVark = async (req, res) => {
  const userId = req.user_id;
  const vark_type = req.params;

  try {
    const [row] = database.query(`UPDATE user SET vark_type = ? WHERE id = ?`, [
      vark_type,
      userId,
    ]);

    if (row.length < 0) {
      return res.status(500).json({ payload: "Internal server error" });
    }

    return res.status(200).json({ payload: "Vark Type is set" });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ payload: "Internal server error" });
  }
};

export default setVark;
