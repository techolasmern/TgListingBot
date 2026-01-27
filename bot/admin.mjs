import { app_config } from "../config/app.config.mjs";
import { bot } from "../config/bot.config.mjs";
import { get_admin, options, sendBroadcast } from "../lib/bot.mjs";
import { AssetModel } from "../models/asset.model.mjs";
import { UserModel } from "../models/user.model.mjs";

bot.callbackQuery(/^\/update_asset_status (approve|reject|approved|rejected) (\w+)$/, async ctx => {
    try {
        const admin = await get_admin();
        if(!admin || admin.id !== ctx.from.id) return await ctx.answerCallbackQuery({
            text: "❌ Access Denied",
            show_alert: true
        })
        const type = ctx.match[1];
        const username = ctx.match[2];
        const asset = await AssetModel.findOne({ username: username.replace("@", "") });
        const id = asset.asset_id;
        if(!asset) return await ctx.answerCallbackQuery({
            text: "❌ Asset not found",
            show_alert: true
        });
        if (asset.status !== "pending") return await ctx.answerCallbackQuery({
            text: `❌ Asset current status: ${asset.status}`,
            show_alert: true
        });
        if (type === "approve" || type === "approved") {
            asset.status = "approved";
            const user = await UserModel.findOne({ id: asset.owner });
            if (user) {
                user.reputation += 2;
                await user.save();
                ctx.api.sendMessage(user.id, `<b>⭐ Reputation updated</b>\n<b>Your Current Reputation:</b> <code>${user.reputation}</code>`, options);
            }
        } else if (type === "reject" || type === "rejected") {
            asset.status = "rejected";
        }
        await asset.save();
        const key = [
            [{ text: "🔎 More Requests", callback_data: "/admin_review_pending"}]
        ]
        await ctx.editMessageText(`<b>✅ Asset status updated</b>\n<b>Asset ID:</b> <code>${id}</code>\n<b>Asset Type:</b> <code>${asset.asset_type}</code>\n<b>Asset Status:</b> <code>${asset.status}</code>`, {
            ...options,
            reply_markup: {
                inline_keyboard: key
            }
        });
        return await ctx.api.sendMessage(asset.owner, `<b>🚨 New asset status updated</b>\n<b>Asset ID:</b> <code>${id}</code>\n<b>Asset Type:</b> <code>${asset.asset_type}</code>\n<b>Asset Status:</b> <code>${asset.status}</code>`, options);
    } catch (err) {
        return await ctx.reply(`<b>❌ System Error:</b> Action could not be completed.`, options);
    }
})

bot.command("dev", async ctx => {
    try {
        const admin = await get_admin();

        if (admin && admin.id === ctx.from.id) {
            // Optional: Fetch stats to make it look "Premium"
            const totalUsers = await UserModel.countDocuments();
            const pendingAssets = await AssetModel.countDocuments({ status: "pending" });

            const text = `<b>🛠️ PREMIUM ADMIN DASHBOARD</b>\n\n` +
                `<b>👤 Active Users:</b> <code>${totalUsers}</code>\n` +
                `<b>📦 Pending Assets:</b> <code>${pendingAssets}</code>\n` +
                `<b>📅 Server Status:</b> <code>Operational ✅</code>\n\n` +
                `<i>Select a management module below:</i>`;

            const keyboard = [
                [
                    { text: "📤 Broadcast Mail", callback_data: "/admin_mail" }
                ],[
                    { text: "👤 Manage User", callback_data: "/admin_manage_user" },
                    { text: "📦 Manage Asset", callback_data: "/admin_manage_asset" }
                ], [
                    { text: "⌛ Pending Assets List", callback_data: "/admin_review_pending" },
                ]
            ];

            return await ctx.reply(text, {
                parse_mode: "HTML",
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });
        }

        // Standard response for non-admins
        return ctx.reply(`<b>🎟️ Our Admin/Dev: @${admin.username}</b>`, options);

    } catch (err) {
        console.error(err);
        return await ctx.reply(`<b>❌ System Error:</b> Action could not be completed.`, options);
    }
});

bot.callbackQuery(/^\/admin_manage_user$/, async ctx => {
    try {
        return await ctx.conversation.enter("adminManageUser");
    } catch (err) {
        return await ctx.answerCallbackQuery({
            text: "❌ System Error: Action could not be completed.",
            show_alert: true
        })   
    }
})

bot.callbackQuery(/^\/admin_manage_asset$/, async ctx => {
    try {
        return await ctx.conversation.enter("adminManageAsset");
    } catch (err) {
        return await ctx.answerCallbackQuery({
            text: "❌ System Error: Action could not be completed.",
            show_alert: true
        })
    }
})

bot.callbackQuery(/^\/admin_ban_user (\d+)$/, async ctx => {
    try {
        const user_id = ctx.match[1];
        const user = await UserModel.findOne({ id: user_id });
        if(!user) return await ctx.answerCallbackQuery({
            text: "❌ User not found in our records.",
            show_alert: true
        });
        user.is_banned = !user.is_banned;
        await user.save();
        const keyboard = [
            [{ text: `🔄️ Ban Status: ${user.is_banned ? "Banned 🚫" : "Not Banned ✅"}`, callback_data: `/admin_ban_user ${user.id}` }],
        ];
        return await ctx.editMessageReplyMarkup({
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

bot.callbackQuery(/^\/admin_asset_change_status (\w+) (\d+)$/, async ctx => {
    try {
        const admin = await get_admin();
        if (admin && admin.id !== ctx.from.id) {
            return await ctx.answerCallbackQuery({
                text: "❌ Access Denied: Admin Privileges Required",
                show_alert: true
            });
        }

        const type = ctx.match[1];
        const id = ctx.match[2];
        const asset = await AssetModel.findOne({ asset_id: id });
        if (!asset) {
            return await ctx.answerCallbackQuery({
                text: "❌ Asset not found",
                show_alert: true
            });
        }
        asset.status = type;
        await asset.save();
        return await ctx.editMessageReplyMarkup({
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: `Approved ${asset.status == "approved" ? "{✅}" : ""}`, callback_data: `/admin_asset_change_status approved ${asset.asset_id}` },
                        { text: `Rejected ${asset.status == "rejected" ? "{✅}" : ""}`, callback_data: `/admin_asset_change_status rejected ${asset.asset_id}` }
                    ], [
                        { text: `Disabled ${asset.status == "disabled" ? "{✅}" : ""}`, callback_data: `/admin_asset_change_status disabled ${asset.asset_id}` },
                        { text: `Pending ${asset.status == "pending" ? "{✅}" : ""}`, callback_data: `/admin_asset_change_status pending ${asset.asset_id}` }
                    ]
                ]
            }
        })
    } catch (err) {
        console.log(err)
        return await ctx.answerCallbackQuery({
            text: "❌ System Error: Action could not be completed.",
            show_alert: true
        });
    }
})

bot.callbackQuery(/^\/admin_review_pending$/, async ctx => {
    try {
        const asset = await AssetModel.findOne({ status: "pending" });
        if (!asset) {
            return await ctx.answerCallbackQuery({
                text: "❌ No more assets to display.",
                show_alert: true
            });
        }
        const text = `<b>⌛ Pending Asset List</b>\n\n<b>Username: @${asset.username}</b>\n<b>Type:</b> <code>${asset.asset_type}</code>\n<b>Asset ID:</b> <code>${asset.asset_id}</code>\n\n<b>Category:</b> <code>${asset.category}</code>\n\nDescription: <code>${asset.description}</code>`;
        const keyboard = [
            [
                { text: `👍 Approve`, callback_data: `/update_asset_status approved ${asset.username}` },
                { text: `👎 Reject`, callback_data: `/update_asset_status rejected ${asset.username}` }
            ]
        ];
        return await ctx.editMessageText(text, {
            parse_mode: "HTML",
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

bot.callbackQuery(/^\/admin_mail$/, async ctx => {
    try {
        return await ctx.conversation.enter("adminMail");   
    } catch (err) {
        return await ctx.answerCallbackQuery({
            text: "❌ System Error: Action could not be completed.",
            show_alert: true
        })
    }
})

bot.callbackQuery(/^\/admin_mail_cancel$/, async ctx => {
    try {
        const admin = await get_admin();
        if (admin && admin.id !== ctx.from.id) {
            return await ctx.answerCallbackQuery({
                text: "❌ Access Denied: Admin Privileges Required",
                show_alert: true
            });
        }   
        return await ctx.editMessageText("<b>❌ Process Cancelled</b>\n\nProcess has been cancelled.", options);
    } catch (err) {
        return await ctx.answerCallbackQuery({
            text: "❌ System Error: Action could not be completed.",
            show_alert: true
        })
    }
})

bot.callbackQuery(/^\/admin_mail_confirm (\d+)$/, async ctx => {
    try {
        const message_id = ctx.match[1];
        return await sendBroadcast(ctx.from.id, ctx.callbackQuery.message.message_id, message_id, async message => {
            await UserModel.updateMany({ broadcasted: true }, { $set: { broadcasted: false } });
            await ctx.reply(message, options);
        });
    } catch (err) {
        return await ctx.answerCallbackQuery({
            text: "❌ System Error: Action could not be completed.",
            show_alert: true
        })
    }
})