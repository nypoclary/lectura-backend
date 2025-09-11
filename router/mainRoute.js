import express from "express";
import authRouter from "./authRoute.js";

const mainRouter = express.Router();

mainRouter.use("/auth", authRouter);

export default mainRouter;
