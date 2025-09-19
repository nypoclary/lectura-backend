import express from "express";
import authRouter from "./authRoute.js";
import noteRouter from "./noteRoute.js";
import userRouter from "./userRoute.js";

const mainRouter = express.Router();

mainRouter.use("/auth", authRouter);
mainRouter.use("/note", noteRouter);
mainRouter.use("/user", userRouter);

export default mainRouter;
