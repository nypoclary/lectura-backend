import express from "express";
import { checkAuth } from "../controller/auth/jwt.js";
import setVark from "../controller/user/setVark.js";
import userInfo from "../controller/user/userInfo.js";

const userRouter = express.Router();

userRouter.get("/vark/:vark_type", checkAuth, setVark);
userRouter.get("/info", checkAuth, userInfo);

export default userRouter;
