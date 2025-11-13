import express from "express";
import { checkAuth } from "../controller/auth/jwt.js";
import setVark from "../controller/user/setVark.js";
import userInfo from "../controller/user/userInfo.js";
import userDetail from "../controller/user/userDetail.js";
import update from "../controller/user/update.js";

const userRouter = express.Router();

userRouter.get("/vark/:vark_type", checkAuth, setVark);
userRouter.get("/info", checkAuth, userInfo);
userRouter.get("/detail", checkAuth, userDetail);

userRouter.post("/update", checkAuth, update);

export default userRouter;
