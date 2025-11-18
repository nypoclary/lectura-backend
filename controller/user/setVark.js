import database from "../../database/db.js";

const varkMap = {
  V: "visual",
  A: "auditory",
  R: "read-write",
  K: "kinesthetic",
};

const setVark = async (req, res) => {
  const userId = req.userId;
  const { vark_type } = req.params; 

  try {
    const fullVarkType = varkMap[vark_type];

    if (!fullVarkType) {
      console.log(`Invalid vark_type received: ${vark_type}`);
      return res.status(400).json({ payload: "Invalid VARK type provided." });
    }

    // Updated log to show both
    console.log(`Received code: ${vark_type}, Storing in DB: ${fullVarkType} for User: ${userId}`);

    const [row] = await database.query(
      `UPDATE user SET vark_type = ? WHERE id = ?`,
      [
        fullVarkType,
        userId,
      ]
    );

    if (row.affectedRows === 0) {
      // This will still run, but now you'll know WHY
      return res.status(404).json({ payload: "User not found." });
    }

    return res.status(200).json({ payload: "Vark Type is set" });
  } catch (error) {
    console.error("Database error in setVark:", error); 
    return res.status(500).json({ payload: "Internal server error" });
  }
};

export default setVark;