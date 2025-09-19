import express from "express";
import storeTemp from "../controller/note/storeTemp.js";
import { checkAuth } from "../controller/auth/jwt.js";
import removeTemp from "../controller/note/removeTemp.js";
import startGenerate from "../controller/note/startGeneration.js";
import regenerate from "../controller/note/regenerate.js";
import editFileName from "../controller/note/editFileName.js";
import history from "../controller/note/history.js";
import status from "../controller/note/status.js";

const noteRouter = express.Router();
noteRouter.get("/editFileName/:fileName/:noteId", checkAuth, editFileName);
noteRouter.get("/history", checkAuth, history);
noteRouter.get("/status/:noteId", checkAuth, status);

noteRouter.post("/convert", checkAuth, storeTemp);
noteRouter.post("/generate", checkAuth, startGenerate);
noteRouter.post("/regenerate", checkAuth, regenerate);

noteRouter.delete("/deleteTemp/:key", checkAuth, removeTemp);

export default noteRouter;
