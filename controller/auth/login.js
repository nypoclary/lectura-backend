import database from "../../database/db.js";
import { generateToken } from "./jwt.js";

export const login = async (req, res) => {
  const { username, password } = req.body;

  try {
    if (!username || !password) {
      return res
        .status(400)
        .json({ success: false, payload: "Please fill in all the fields" });
    }

    const users = await database.query(
      "SELECT password, id FROM user WHERE name = ?",
      [username]
    );

    if (users.length < 1) {
      return res.status(401).json({
        success: false,
        payload: "User does not exist",
      });
    }

    if (password != users[0][0].password) {
      return res.status(402).json({
        success: false,
        payload: "Invalid password",
      });
    }

    const token = generateToken(users[0][0].id);
    res.cookie("token", token);

    return res
      .status(200)
      .json({ success: true, payload: "Login successful", token: token });
  } catch (error) {
    return res.status(500).json({ success: false, payload: error.message });
  }
};
