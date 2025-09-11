import database from "../../database/db.js";

export const signup = async (req, res) => {
  try {
    const { username, password } = req.body;

    const [fetchUsers] = await database.query(
      "SELECT * FROM user WHERE name = ?",
      [username]
    );

    if (fetchUsers.length > 0) {
      return res
        .status(400)
        .json({ success: false, payload: "User already exists" });
    }

    const newUser = await database.query(
      "INSERT INTO user (name, password, created_at) VALUES (?, ?, NOW())",
      [username, password]
    );

    const newUserId = newUser[0].insertId;

    return res.status(200).json({
      success: true,
      payload: "Registration successful",
      userId: newUserId,
    });
  } catch (error) {
    return res.status(500).json({ success: false, payload: error.message });
  }
};
