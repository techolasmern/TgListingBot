import { app_config } from "../config/app.config.mjs";
import { bot } from "../config/bot.config.mjs";
import { options } from "../lib/bot.mjs";
import { AssetModel } from "../models/asset.model.mjs";

bot.inlineQuery(/./, async ctx => {
    try {
        const query = ctx.inlineQuery.query;
        const offset = parseInt(ctx.inlineQuery.offset || "0");
        const limit = 15; 

        const assets = await AssetModel.find({
            status: "approved",
            $or: [
                { title: { $regex: query, $options: "i" } },
                { description: { $regex: query, $options: "i" } },
                { category: { $regex: query, $options: "i" } },
                { username: { $regex: query, $options: "i" } },
            ]
        })
            .sort({ rating: -1, createdAt: -1 }) // Sort by rating then date
            .skip(offset)
            .limit(limit);

        const results = assets.map(asset => {

            return {
                type: "article",
                id: asset.asset_id.toString(),
                title: `${asset.title}`,
                description: `⭐ ${asset.rating} | Category: ${asset.category} | ${asset.asset_type.toUpperCase()}`,
                input_message_content: {
                    message_text:
                        `<b>${asset.asset_type == "bot" ? "🤖" : asset.asset_type == "chat" ? "👥" : asset.asset_type == "channel" ? "📢" : "💬"} ${asset.title} (${asset.asset_type.toUpperCase()})</b>\n` +
                        `<b>📂 Category:</b> <b>${asset.category}</b>\n` +
                        `<b>⭐ Rating: ${asset.rating.toFixed(1)}/5.0</b>\n`,
                    ...options
                },
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "🚀 Open in Bot", url: `https://t.me/${app_config.BOT.USERNAME}?start=asset_${asset.asset_id}` },
                        ]
                    ]
                }
            };
        });

        const nextOffset = assets.length === limit ? (offset + limit).toString() : "";

        return await ctx.answerInlineQuery(results, {
            next_offset: nextOffset,
            cache_time: 0
        });

    } catch (err) {
        return await ctx.answerInlineQuery([{
            type: "article",
            id: "error",
            title: "❌ An error occurred",
            description: "Please try again later.",
            input_message_content: {
                message_text: `<b>❌ An error occurred</b>`,
                ...options
            }
        }]);
    }
});