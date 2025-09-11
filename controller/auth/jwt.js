import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();
const JWTsecretkey = process.env.Secretkey;

export const generateToken = (id) => {
  const token = jwt.sign(
    {
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 168,
      userId: id,
    },
    JWTsecretkey
  );
  return token;
};

export const checkAuth = (req, res, next) => {
  try {
    const token = req.cookies.token;
    if (!token) throw new Error("No token provided");

    const decodedToken = jwt.verify(token, JWTsecretkey);
    if (!decodedToken) throw new Error("Invalid token");

    req.userId = decodedToken.userId;
    next();
  } catch (error) {
    res.status(403).json({ success: false, payload: "Please log in" });
  }
};
