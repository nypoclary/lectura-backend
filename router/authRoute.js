import express from "express";
import { login } from "../controller/auth/login.js";
import { signup } from "../controller/auth/signup.js";

const authRouter = express.Router();

authRouter.post("/login", login);
authRouter.post("/signup", signup);

export default authRouter;
