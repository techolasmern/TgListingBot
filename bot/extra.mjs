import { bot } from "../config/bot.config.mjs";

bot.command("this_command_is_for_ads", async ctx => {
    return await ctx.reply(`<b>🔎 Welcome to ads section</b>`, {
        parse_mode: "HTML"
    })
})