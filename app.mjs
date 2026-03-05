import express from "express";
import { db } from "./config/db.config.mjs";
import "./bot/main.mjs";
import env from "dotenv"
env.config()

await db.config();
const app = express();

app.listen(process.env.PORT || 3000, () => {
    console.log(`Server started on port ${process.env.PORT || 3000}`);
});








