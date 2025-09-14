import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();
const jwtSecretKey = process.env.Secretkey;

export const verify = async (req, res) => {
  try {
    const token = req.cookies.token;

    if (!token) {
      return res
        .status(400)
        .json({ success: false, payload: "Not authenticated" });
    }

    const userInfo = jwt.verify(token, jwtSecretKey); // will throw if invalid

    if (!userInfo) {
      return res
        .status(401)
        .json({ success: false, payload: "Userinfo not found" });
    }

    return res.status(200).json({ success: true, payload: "Authenticated" });
  } catch (err) {
    console.error("JWT verify error:", err.message);
    return res
      .status(401)
      .json({ success: false, payload: "Invalid or expired token" });
  }
};
