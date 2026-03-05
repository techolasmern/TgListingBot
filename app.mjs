import express from "express";
import { db } from "./config/db.config.mjs";
import "./bot/main.mjs";
import env from "dotenv"
import { bot } from "./config/bot.config.mjs";
env.config()

await db.config();
const app = express();

app.get("/set-webhook", async (req, res) => {
    await bot.api.setWebhook(process.env.SERVER);
    res.send("Webhook set");
})

app.listen(process.env.PORT || 3000, () => {
    console.log(`Server started on port ${process.env.PORT || 3000}`);
});








