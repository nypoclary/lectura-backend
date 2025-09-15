import express from "express";
import storeTemp from "../controller/note/storeTemp.js";
import { checkAuth } from "../controller/auth/jwt.js";
import removeTemp from "../controller/note/removeTemp.js";
import startGenerate from "../controller/note/startGeneration.js";

const noteRouter = express.Router();

noteRouter.post("/convert", checkAuth, storeTemp);
noteRouter.delete("/deleteTemp/:key", checkAuth, removeTemp);
noteRouter.post("/generate", checkAuth, startGenerate);

export default noteRouter;
