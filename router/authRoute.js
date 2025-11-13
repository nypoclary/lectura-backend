import express from "express";
import { login } from "../controller/auth/login.js";
import { signup } from "../controller/auth/signup.js";
import { verify } from "../controller/auth/verify.js";
import { logout } from "../controller/auth/logout.js";

const authRouter = express.Router();

authRouter.post("/login", login);
authRouter.post("/signup", signup);
authRouter.get("/verify", verify);
authRouter.post('/logout', logout);

export default authRouter;
