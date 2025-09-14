import express from "express";
import authRouter from "./authRoute.js";
import noteRouter from "./noteRoute.js";

const mainRouter = express.Router();

mainRouter.use("/auth", authRouter);
mainRouter.use("/note", noteRouter);

export default mainRouter;
