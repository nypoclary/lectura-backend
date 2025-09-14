import express from "express";
import storeTemp from "../controller/note/storeTemp.js";
import { checkAuth } from "../controller/auth/jwt.js";

const noteRouter = express.Router();

noteRouter.post("/convert", checkAuth, storeTemp);

export default noteRouter;
