import express from "express";
import { db } from "./config/db.config.mjs";
import "./bot/main.mjs";
import nodeCron from "node-cron";

await db.config();
const app = express();

app.get("/api/v1", (req, res) => {
    return res.status(200).send({ 
        ok: true,
        message: "Everything is working fine."
    });
});

nodeCron.schedule("* * * * *", async () => {
    try {
        const response = await fetch(`${process.env.SERVER}/api/v1`);
        const data = await response.json();
        return console.log(data);
    } catch (err) {
        return console.log(err.message);   
    }
});

app.listen(process.env.PORT || 3000, () => {
    console.log(`Server started on port ${process.env.PORT || 3000}`);
});








