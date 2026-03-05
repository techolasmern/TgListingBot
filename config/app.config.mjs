import env from "dotenv"
env.config()

export const app_config = {
    BOT: {
        USERNAME: process.env.BOT_USERNAME,
        TOKEN: process.env.BOT_TOKEN
    },
    CHANNEL: {
        ID: process.env.CHANNEL_ID,
        USERNAME: process.env.CHANNEL_USERNAME
    }
}