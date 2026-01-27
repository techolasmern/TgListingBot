import { app_config } from "../config/app.config.mjs";
import { api, bot } from "../config/bot.config.mjs";
import { getBotInfo, options, startMessage, user_mention } from "../lib/bot.mjs";
import { AssetModel } from "../models/asset.model.mjs";
import { ReviewModel } from "../models/review.model.mjs";
import { UserModel } from "../models/user.model.mjs";

bot.callbackQuery("/start", async ctx => {
    try {
        const { status } = await api.getChatMember(app_config.CHANNEL.ID, ctx.from.id);
        if (status != "administrator" && status != "creator" && status != "member") {
            const key = [
                [{ text: "✅ Join the Channel", url: `https://t.me/${app_config.CHANNEL.USERNAME}` }],
                [{ text: "🔎 Verify", callback_data: "/start" }]
            ]
            ctx.deleteMessage();
            return await ctx.reply(`<b>🔎 You must be a member of channels/chats to continue</b>`, {
                ...options,
                reply_markup: {
                    inline_keyboard: key
                }
            });
        }
        const { text, keyboard } = startMessage();
        return await ctx.editMessageText(text, {
            ...options,
            reply_markup: {
                inline_keyboard: keyboard
            }
        });
    } catch (err) {
        return await ctx.answerCallbackQuery({
            text: "❌ System Error: Action could not be completed.",
            show_alert: true
        })   
    }
})

bot.callbackQuery(/^\/my_profile$/, async ctx => {
    try {
        const userId = ctx.from.id;

        // Parallel data fetching for premium performance
        const [user, assets, reviewsReceived, reviewsWritten] = await Promise.all([
            UserModel.findOne({ id: userId }),
            AssetModel.find({ owner: userId, status: "approved" }),
            ReviewModel.find({ owner: userId }), // Reviews others left for YOU
            ReviewModel.find({ user_id: userId }) // Reviews YOU wrote
        ]);

        if (!user) return await ctx.answerCallbackQuery({ text: "Profile not found.", show_alert: true });

        // Calculate Average Rating Received
        const receivedCount = reviewsReceived.length;
        const writtenCount = reviewsWritten.length;
        const avgRating = receivedCount > 0
            ? (reviewsReceived.reduce((acc, r) => acc + r.rating, 0) / receivedCount)
            : 0;

        // Categorize Assets
        const botCount = assets.filter(a => a.asset_type === 'bot').length;
        const channelCount = assets.filter(a => a.asset_type === 'channel').length;
        const groupCount = assets.filter(a => a.asset_type === 'chat').length;

        const text = `<b>✧ Personal Dashboard ✧</b>\n──────────────\n👤 <b>User:</b> ${user_mention(ctx.from)}\n🆔 <b>ID:</b> <code>${userId}</code>\n──────────────\n📊 <b>Platform Activity</b>\n├ <b>Total Assets:</b> ${assets.length}\n│  ├ 🤖 Bots: ${botCount}\n│  ├ 📢 Channels: ${channelCount}\n│  └ 👥 Chats: ${groupCount}\n├ <b>Reviews Written:</b> ${writtenCount}\n├ <b>Reviews Received:</b> ${receivedCount}\n├ <b>Avg. Rating Received:</b> ${avgRating.toFixed(1)} / 5.0 ⭐\n└ <b>Trust Score:</b> ${receivedCount > 20 && avgRating >= 4 ? "Verified Merchant ✅" : "Standard User 🛡️"}\n──────────────\n<i>Stats are updated in real-time.</i>`;

        const keyboard = [
            [{ text: "📂 My Assets", callback_data: "/my_assets 0" }, { text: "📜 My Reviews", callback_data: "/my_reviews_written 0" }],
            [{ text: "🔙 Back", callback_data: "/start" }]
        ];

        return await ctx.editMessageText(text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });

    } catch (err) {
        return await ctx.reply(`<b>❌ System Error:</b> Action could not be completed.`, options);
    }
});

bot.callbackQuery(/^\/create_listing$/, async ctx => {
    try {
        const user = await UserModel.findOne({ id: ctx.from.id });

        if (!user) return await ctx.answerCallbackQuery({
            text: "Access Denied: Your profile is not registered in our database.",
            show_alert: true
        });

        if(user.banned) return await ctx.answerCallbackQuery({
            text: "🚫 Access Denied: You are banned from using this bot.",
            show_alert: true
        });

        return await ctx.conversation.enter("createListing");
    } catch (err) {
        return await ctx.answerCallbackQuery({
            text: "❌ An error occurred",
            show_alert: true
        })   
    }
})

bot.callbackQuery(/^\/bot_info (\d+)$/, async ctx => {
    try {
        const id = ctx.match[1];
        const asset = await AssetModel.findOne({ asset_id: Number(id), status: "approved" });
        if(!asset) return await ctx.answerCallbackQuery({
            text: "❌ Entry not found in our records.",
            show_alert: true
        });
        const { text, keyboard } = await getBotInfo(asset);
        return await ctx.editMessageText(text, {
            ...options,
            reply_markup: {
                inline_keyboard: keyboard
            }
        })
    } catch (err) {
        return await ctx.answerCallbackQuery({
            text: "❌ System Error: Action could not be completed.",
            show_alert: true
        })   
    }
})

bot.callbackQuery(/^\/add_review (\d+)$/, async ctx => {
    try {
        const user = await UserModel.findOne({ id: ctx.from.id });

        if (!user) return await ctx.answerCallbackQuery({
            text: "Access Denied: Your profile is not registered in our database.",
            show_alert: true
        });

        if(user.is_banned) return await ctx.answerCallbackQuery({
            text: "🚫 Access Denied: You are banned from using this bot.",
            show_alert: true
        })

        const id = ctx.match[1];
        const asset = await AssetModel.findOne({ asset_id: Number(id), status: "approved" });

        if (!asset) return await ctx.answerCallbackQuery({
            text: "❌Entry not found in our records.",
            show_alert: true
        });

        const prev = await ReviewModel.findOne({ asset_id: Number(id), user_id: ctx.from.id });

        const key = [1, 2, 3, 4, 5].map(star => ({
            text: `${star} ⭐`,
            callback_data: `/add_review_comment ${id} ${star}`
        }));
        const text = `<b>✧ Submit Your Review ✧</b>\nShare your experience with <b>@${asset.username}</b>. Your feedback helps maintain our community standards.\n---\n<b>✦ Your Previous Rating</b>\n<b>Score:</b> ${prev ? `${prev.rating.toFixed(1)} / 5.0` : "<i>No previous rating</i>"}\n<b>Review:</b> <i>${prev?.comment || "No comment provided"}</i>\n---\n<b>Select a rating to proceed:</b>`;
        return await ctx.editMessageText(text, {
            ...options,
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    key,
                    [{ text: "🔙 Back", callback_data: `/bot_info ${id}` }]
                ]
            }
        });

    } catch (err) {
        console.error(err);
        return await ctx.answerCallbackQuery({
            text: `❌ System Error: Action could not be completed.`,
            show_alert: true
        });
    }
});

bot.callbackQuery(/^\/add_review_comment (\d+) (\d+)$/, async ctx => {
    try {
        const [_, id, rating] = ctx.match;
        const asset = await AssetModel.findOne({ asset_id: Number(id), status: "approved" });
        if(!asset) return await ctx.answerCallbackQuery({
            text: "❌ Entry not found in our records.",
            show_alert: true
        });
        const review = await ReviewModel.findOne({ asset_id: Number(id), user_id: ctx.from.id });
        if (review) {
            review.rating = Number(rating);
            await review.save();
        } else {
            const res = await ReviewModel.create({
                asset_id: Number(id),
                user_id: ctx.from.id,
                rating: Number(rating),
                owner: asset.owner
            });
            if(!res) return await ctx.answerCallbackQuery({
                text: "❌ System Error: Action could not be completed.",
                show_alert: true
            });
            const updated = await UserModel.findOneAndUpdate({ id: ctx.from.id }, { $inc: { reputation: 1 } });
            ctx.answerCallbackQuery({
                text: "⭐ Reputation Updated\nYour Current Reputation: " + (updated.reputation + 1),
                show_alert: true
            })
        }
        const avgRating = await ReviewModel.aggregate([
            { $match: { asset_id: Number(id) } },
            { $group: { _id: "$asset_id", avg: { $avg: "$rating" } } }
        ])
        asset.rating = avgRating[0]?.avg || 0;
        await asset.save();
        return await ctx.conversation.enter("addReviewComment");
    } catch (err) {
        return await ctx.answerCallbackQuery({
            text: "❌ System Error: Action could not be completed.",
            show_alert: true
        });
    }
});

bot.callbackQuery(/^\/view_reviews (\d+) (-?\d+)$/, async ctx => {
    try {
        const id = ctx.match[1];
        const skip = parseInt(ctx.match[2]);
        const limit = 5; 

        if (skip < 0) {
            return await ctx.answerCallbackQuery({
                text: "❌ No more reviews to display.",
                show_alert: true
            });
        }

        const reviews = await ReviewModel.find({ asset_id: Number(id) })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        if (reviews.length === 0) {
            return await ctx.answerCallbackQuery({
                text: "❌ No more reviews to display.",
                show_alert: true
            });
        }

        let text = `<b>✧ Community Feedback ✧</b>\n`;
        text += `──────────────`;

        const userIds = reviews.map(r => r.user_id);
        const users = await UserModel.find({ id: { $in: userIds } });

        for (const review of reviews) {
            const user = users.find(u => u.id == review.user_id);
            const name = user ? `${user_mention({ id: user.id, username: user.username, first_name: user.first_name })}` : "User";
            const stars = "⭐".repeat(Math.round(review.rating));

            text += `\n\n👤 <b>${name}</b> ${stars}\n`;
            text += `💬 <i>"${review.comment || "No comment provided"}"</i>`;
        }

        text += `\n──────────────`;

        const keyboard = [];
        const navRow = [];

        if (skip > 0) {
            navRow.push({ text: "⬅️ Previous", callback_data: `/view_reviews ${id} ${skip - limit}` });
        }

        if (reviews.length === limit) {
            navRow.push({ text: "Next ➡️", callback_data: `/view_reviews ${id} ${skip + limit}` });
        }

        if (navRow.length > 0) keyboard.push(navRow);
        keyboard.push([{ text: "🔙 Back to Asset", callback_data: `/bot_info ${id}` }]);

        return await ctx.editMessageText(text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });

    } catch (err) {
        return await ctx.answerCallbackQuery("An error occurred loading reviews.");
    }
});

bot.callbackQuery(/^\/view_ranks$/, async ctx => {
    try {
        const assets = await AssetModel.find({ status: "approved" }).sort({ rating: -1, createdAt: 1 }).limit(10);
        let text = `<b>✧ Top 10 Ranked Assets ✧\n\nCurrently Ranked Assets: ${assets.length}</b>`;
        const keyboard = assets.map((asset, index) => {
            const rank = index + 1 == 1 ? "🥇" : index + 1 == 2 ? "🥈" : index + 1 == 3 ? "🥉" : (index + 1 < 10 ? `0${index + 1}` : index + 1);
            return [{
                text: `${rank} - @${asset.username} (${asset.asset_type.toUpperCase()}) - ⭐ ${asset.rating.toFixed(1)}/5.0`,
                callback_data: `/bot_info ${asset.asset_id}`
            }]
        })
        return await ctx.editMessageText(text, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    ...keyboard,
                    [{ text: "🔙 Back", callback_data: "/start" }]
                ]
            }
        });
    } catch (err) {
        return await ctx.answerCallbackQuery({
            text: "❌ System Error: Action could not be completed.",
            show_alert: true
        });
    }
});
          
bot.callbackQuery(/^\/my_reviews_written (\d+)$/, async ctx => {
    try {
        const skip = parseInt(ctx.match[1]);
        const limit = 5;

        if (skip < 0) {
            return await ctx.answerCallbackQuery({
                text: "❌ No more reviews to display.",
                show_alert: true
            });
        }

        const reviews = await ReviewModel.find({ user_id: ctx.from.id })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);
        
        if (reviews.length === 0) {
            return await ctx.answerCallbackQuery({
                text: "❌ No more reviews to display.",
                show_alert: true
            });
        }

        let text = `<b>✧ My Reviews ✧</b>\n`;
        text += `──────────────`;

        const assets = await AssetModel.find({ asset_id: { $in: reviews.map(r => r.asset_id) } });

        for (const review of reviews) {
            const asset = assets.find(a => a.asset_id == review.asset_id);
            text += `\n\n👤 <b>@${asset.username} (${asset.asset_type.toUpperCase()})</b>\n`;
            text += `⭐ <b>Rating:</b> ${review.rating.toFixed(1)}/5.0\n`;
            text += `💬 <b>Comment:</b> ${review.comment || "No comment provided"}`;

        }

        text += `\n──────────────`;

        const keyboard = [];
        const navRow = [];

        if (skip > 0) {
            navRow.push({ text: "⬅️ Previous", callback_data: `/my_reviews_written ${skip - limit}` });
        }

        if (reviews.length === limit) {
            navRow.push({ text: "Next ➡️", callback_data: `/my_reviews_written ${skip + limit}` });
        }

        if (navRow.length > 0) keyboard.push(navRow);
        keyboard.push([{ text: "🔙 Back", callback_data: "/my_profile" }]);

        return await ctx.editMessageText(text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        })
    } catch (err) {
        console.log(err)
        return await ctx.answerCallbackQuery({
            text: "❌ System Error: Action could not be completed.",
            show_alert: true
        });
    }
})

bot.callbackQuery(/^\/my_assets (\d+)$/, async ctx => {
    try {
        const skip = Number(ctx.match[1]);
        const limit = 5;

        if (skip < 0) {
            return await ctx.answerCallbackQuery({
                text: "❌ No more assets to display.",
                show_alert: true
            });
        }

        const assets = await AssetModel.find({ owner: ctx.from.id, status: "approved" })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        if (assets.length === 0) {
            return await ctx.answerCallbackQuery({
                text: "❌ No more assets to display.",
                show_alert: true
            });
        }

        let text = `<b>✧ My Assets ✧</b>`;

        const keyboard = assets.map((asset) => {
            return [{
                text: `@${asset.username} (${asset.asset_type.toUpperCase()}) - ⭐ ${asset.rating.toFixed(1)}/5.0`,
                callback_data: `/manage_bot ${asset.asset_id} ${skip}`
            }]
        })

        const navRow = [];

        if (skip > 0) {
            navRow.push({ text: "⬅️ Previous", callback_data: `/my_assets ${skip - limit}` });
        }

        if (assets.length === limit) {
            navRow.push({ text: "Next ➡️", callback_data: `/my_assets ${skip + limit}` });
        }

        if (navRow.length > 0) keyboard.push(navRow);
        keyboard.push([{ text: "🔙 Back", callback_data: "/my_profile" }]);

        return await ctx.editMessageText(text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        })
    } catch (err) {
        return await ctx.answerCallbackQuery({
            text: "❌ System Error: Action could not be completed.",
            show_alert: true
        });
    }
})

bot.callbackQuery(/^\/manage_bot (\d+) (\d+)$/, async ctx => {
    try {
        const id = ctx.match[1];
        const skip = ctx.match[2];
        const asset = await AssetModel.findOne({ asset_id: Number(id), status: "approved" });

        if (!asset) return await ctx.answerCallbackQuery({
            text: "Entry not found in our records.",
            show_alert: true
        });

        const { text, keyboard } = await getBotInfo(asset, `/my_assets ${skip}`);

        if (ctx.from.id === asset.owner) {
            const back = keyboard.pop();
            keyboard.push([
                { text: "🛑 Deactivate", callback_data: `/remove_asset ${asset.asset_id}` },
                ...back
            ]);
        }

        return await ctx.editMessageText(text, {
            ...options,
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [...keyboard]
            }
        });
    } catch (err) {
        return await ctx.answerCallbackQuery({
            text: "❌ Unable to sync with premium servers. Try again later.",
            show_alert: true
        });
    }
})

bot.callbackQuery(/^\/remove_asset (\d+)$/, async ctx => {
    try {
        const id = ctx.match[1];
        const asset = await AssetModel.findOne({ asset_id: Number(id), status: "approved" });

        if (!asset) return await ctx.answerCallbackQuery({
            text: "❌ Entry not found in our records.",
            show_alert: true
        });

        const confirmText = `<b>🛡 Security Confirmation</b>\n\n` +
            `You are requesting to deactivate: <b>@${asset.username}</b>\n\n` +
            `<i>Note: Deactivating this asset will stop all active processes and release the slot.</i>\n\n` +
            `<b>Proceed with deactivation?</b>`;

        return await ctx.editMessageText(confirmText, {
            ...options,
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: "✅ Confirm Deactivation", callback_data: `/remove_asset ${id} confirm` }],
                    [{ text: "❌ Cancel", callback_data: `/remove_asset ${id} cancel` }]
                ]
            }
        });
    } catch (err) {
        return await ctx.answerCallbackQuery({
            text: "❌ Unable to process your request. Please try again later.",
            show_alert: true
        });
    }
})

bot.callbackQuery(/^\/remove_asset (\d+) (confirm|cancel)$/, async ctx => {
    try {
        const id = ctx.match[1];
        const status = ctx.match[2];

        if (status === "confirm") {
            const asset = await AssetModel.findOne({ asset_id: Number(id), status: "approved" });
            if (!asset) return await ctx.answerCallbackQuery({
                text: "❌ Entry not found in our records.",
                show_alert: true
            });

            asset.status = "disabled";
            asset.rating = 0;
            await asset.save();
            await ReviewModel.deleteMany({ asset_id: Number(id) });
            return await ctx.editMessageText(`<b>✅ Asset Deactivated</b>\n\nThe asset deactivation process has been completed.`, {
                ...options,
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "🔙 Return to Assets", callback_data: `/my_assets 0` }],
                        [{ text: "🔙 Return to Profile", callback_data: `/my_profile` }]
                    ]
                }
            });
        }

        return await ctx.editMessageText(`<b>❌ Process Cancelled!</b>\n\nThe process has been cancelled.`, {
            ...options,
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🔙 Return to Assets", callback_data: `/my_assets 0` }]
                ]
            }
        });
    } catch (err) {
        return await ctx.answerCallbackQuery({
            text: "Error finalizing request.",
            show_alert: true
        });
    }
})

bot.callbackQuery(/^\/verify_ownership$/, async ctx => {
    try {
        return await ctx.conversation.enter("verifyOwnership");
    } catch (err) {
        return await ctx.answerCallbackQuery({
            text: "❌ System Error: Action could not be completed.",
            show_alert: true
        })   
    }
})