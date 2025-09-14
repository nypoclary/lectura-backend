import express from "express";
import { login } from "../controller/auth/login.js";
import { signup } from "../controller/auth/signup.js";
import { verify } from "../controller/auth/verify.js";

const authRouter = express.Router();

authRouter.post("/login", login);
authRouter.post("/signup", signup);
authRouter.get("/verify", verify);

export default authRouter;
