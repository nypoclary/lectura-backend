import express from "express";
import storeTemp from "../controller/note/storeTemp.js";

const noteRouter = express.Router();

noteRouter.post("/convert", storeTemp);

export default noteRouter;