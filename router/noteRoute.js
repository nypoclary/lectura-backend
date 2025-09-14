import express from "express";
import storeTemp from "../controller/note/storeTemp.js";
import { checkAuth } from "../controller/auth/jwt.js";
import removeTemp from "../controller/note/removeTemp.js";

const noteRouter = express.Router();

noteRouter.post("/convert", checkAuth, storeTemp);
noteRouter.delete("/deleteTemp/:key", checkAuth, removeTemp);

export default noteRouter;
