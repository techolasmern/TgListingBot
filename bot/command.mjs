import { app_config } from "../config/app.config.mjs";
import { api, bot } from "../config/bot.config.mjs";
import { getBotInfo, options, sendAdminNotification, startMessage, user_mention } from "../lib/bot.mjs";
import { AssetModel } from "../models/asset.model.mjs";
import { UserModel } from "../models/user.model.mjs";

bot.command("start", async ctx => {
    try {
        const params = ctx.match;
        const user = await UserModel.findOne({ id: ctx.from.id });
        if (!user) {
            const users = await UserModel.estimatedDocumentCount();
            const usr = await UserModel.create({
                id: ctx.from.id,
                first_name: ctx.from.first_name,
                last_name: ctx.from.last_name,
                username: ctx.from.username,
                is_admin: users === 0
            });
            if (!usr) return await ctx.reply(`<b>❌ Unable to process your request. Please try again later</b>`, options);
            sendAdminNotification(ctx, users + 1);
        }
        if (params?.startsWith("asset_")) {
            const asset_id = Number(params.split("_")[1]);
            const asset = await AssetModel.findOne({ asset_id, status: "approved" });
            if(!asset) return await ctx.reply(`<b>❌ Entry not found in our records</b>`, options);
            const { text, keyboard } = await getBotInfo(asset);
            return await ctx.reply(text, {
                ...options,
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });
        }
        const { status } = await api.getChatMember(app_config.CHANNEL.ID, ctx.from.id);
        if (status != "administrator" && status != "creator" && status != "member") {
            const key = [
                [{ text: "✅ Join the Channel", url: `https://t.me/${app_config.CHANNEL.USERNAME}` }],
                [{ text: "🔎 Verify", callback_data: "/start" }]
            ]
            return await ctx.reply(`<b>🔎 You must be a member of channels/chats to continue</b>`, {
                ...options,
                reply_markup: {
                    inline_keyboard: key
                }
            });
        }
        const { text, keyboard } = startMessage();
        return await ctx.reply(text, {
            ...options,
            reply_markup: {
                inline_keyboard: keyboard
            }
        })
    } catch (err) {
        return await ctx.reply(`<b>❌ Unable to process your request. Please try again later</b>`, options);
    }
})