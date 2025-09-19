import express from "express";
import { checkAuth } from "../controller/auth/jwt.js";
import setVark from "../controller/user/setVark.js";

const userRouter = express.Router();

userRouter.get("/vark/:vark_type", checkAuth, setVark);

export default userRouter;
