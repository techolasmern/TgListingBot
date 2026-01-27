import { InlineKeyboard } from "grammy";
import { assetCategories, get_admin, options, user_mention } from "../lib/bot.mjs";
import { AssetModel } from "../models/asset.model.mjs";
import { api } from "../config/bot.config.mjs";
import { ReviewModel } from "../models/review.model.mjs";
import { UserModel } from "../models/user.model.mjs";
import { app_config } from "../config/app.config.mjs";

const UI = {
    separator: "<b>━━━━━━━━━━━━━━━━━━</b>",
    error: "⚠️ <b>PROTOCOL ERROR</b>",
    success: "✅ <b>ENTRY AUTHENTICATED</b>",
    wait: "⏳ <b>PROCESSING REQUEST...</b>"
};

export const createListing = async (conversation, ctx) => {

    try {
        // --- 1. CLASSIFICATION ---
        const typeKeyboard = new InlineKeyboard()
            .text("🤖 Bot", "type_bot")
            .text("💬 Chat", "type_chat")
            .text("🔔 Channel", "type_channel");

        let assetType; let menu;
        while (true) {
            menu = await ctx.reply(
                `<b>Step 1: Classification</b>\n${UI.separator}\nDefine the primary architectural type of the asset.\n\n<i>Use the control panel below, or type <b>/cancel</b> to abort.</i>`,
                { ...options, reply_markup: typeKeyboard }
            );
            const { callbackQuery, message } = await conversation.waitFor(["callback_query:data", "message:text"]);
            if (message?.text === "/cancel") {
                await ctx.api.deleteMessage(ctx.chat.id, menu.message_id);
                return await ctx.reply("<b>❌ Process Cancelled!</b>\n\nThe process has been cancelled.", options);
            }

            if (callbackQuery?.data?.startsWith("type_")) {
                assetType = callbackQuery.data.split("_")[1];
                break;
            }
            await ctx.api.deleteMessage(ctx.chat.id, menu.message_id);
        }

        // --- 2. IDENTITY COLLECTION ---
        let identity = { id: null, username: null, title: null };
        await ctx.api.editMessageText(ctx.chat.id, menu.message_id, `<b>Step 2: Identity Verification</b>\n${UI.separator}\n<b>Selected Type:</b> <code>${assetType.toUpperCase()}</code>\n\n${assetType === 'chat' ? `Enter the <b>@username</b> of the target <code>${assetType.toUpperCase()}</code>:` : `Please <b>forward</b> a message from the target <code>${assetType.toUpperCase()}</code>:\n\n<i>Use the /cancel command to abort.</i>`}`,
            { ...options }
        );
        while (true) {
            const inputCtx = await conversation.waitFor("message");
            if (inputCtx.message?.text === "/cancel") return await ctx.reply("<b>❌ Process Cancelled!</b>\n\nThe process has been cancelled.", options);
            if (!inputCtx.message?.text && !inputCtx.message?.forward_from_chat && !inputCtx.message?.forward_from) {
                await ctx.reply(`${UI.error}\nPlease send correct <b>input</b> for the target <code>${assetType.toUpperCase()}</code>.`, options);
                continue;
            }
            if (assetType === "chat" && inputCtx.message?.text) {
                try {
                    const received_chat = inputCtx.message.text.startsWith("@") ? inputCtx.message.text : `@${inputCtx.message.text}`;
                    const info = await api.getChat(received_chat);
                    if (!["group", "supergroup"].includes(info.type)) {
                        await ctx.reply(`${UI.error}\nTarget must be a <b>Group</b>. Found: <code>${info.type.toUpperCase()}</code>`, options);
                        continue;
                    }
                    identity = { id: info.id, username: info.username, title: info.title };
                    break;
                } catch (e) {
                    await ctx.reply(`${UI.error}\nChat <b>unreachable</b>. Ensure the username of the target <code>${assetType.toUpperCase()}</code> is correct.`, options);
                }
            } else {
                const fwd = inputCtx.message.forward_from_chat || inputCtx.message.forward_from;
                if (fwd) {
                    const isCorrect = (assetType === "channel" && inputCtx.message.forward_from_chat?.type === "channel") ||
                        (assetType === "bot" && inputCtx.message.forward_from?.is_bot);
                    if (!isCorrect) {
                        await ctx.reply(`${UI.error}\n<b>Forward source mismatch.</b> Please forward from a <code>${assetType}</code>.`, options);
                        continue;
                    }
                    identity = { id: fwd.id, username: fwd.username, title: fwd.title || fwd.first_name };
                    break;
                }
                await ctx.reply(`${UI.error}\n<b>Verification failed.</b> Please provide a valid message forward.`, options);
            }
        }

        // --- 3. DUPLICATE CHECK ---
        const existing = await AssetModel.findOne({ asset_id: identity.id });
        if (existing && ["pending", "approved"].includes(existing?.status)) {
            return await ctx.reply(`${UI.error}\nThis asset is already cataloged in our <b>encrypted database</b>.`, options);
        }
        // --- 4. DESCRIPTION & CONFIRMATION ---
        let description;
        while (true) {
            await ctx.reply(`<b>Step 3: Intelligence Brief</b>\n${UI.separator}\nProvide a specialized description for <b>${identity.title}</b>.\n\n<i>Minimum 10 characters required or use the /cancel command to abort.</i>`, options);

            const descCtx = await conversation.waitFor("message:text");
            if (descCtx.message.text === "/cancel") return await ctx.reply("<b>❌ Process Cancelled!</b>\n\nThe process has been cancelled.", options);

            if (descCtx.message.text.length >= 10) {
                const tempDesc = descCtx.message.text;

                const confirmKeyboard = new InlineKeyboard()
                    .text("✅ Confirm", "desc_confirm")
                    .text("✍️ Edit", "desc_edit");

                const confirmMenu = await ctx.reply(
                    `<b>Verify Brief</b>\n${UI.separator}\n<i>${tempDesc}</i>\n\n${UI.separator}\nConfirm this description or re-edit?`,
                    { ...options, reply_markup: confirmKeyboard }
                );

                const { callbackQuery } = await conversation.waitFor("callback_query:data");

                if (callbackQuery.data === "desc_confirm") {
                    description = tempDesc;
                    await ctx.api.deleteMessage(ctx.chat.id, confirmMenu.message_id);
                    break;
                } else {
                    await ctx.api.deleteMessage(ctx.chat.id, confirmMenu.message_id);
                    continue;
                }
            }
            await ctx.reply(`${UI.error}\n<b>Insufficient intelligence.</b> Please provide a longer description.`, options);
        }

        // --- 5. CATEGORY ---
        const catKeyboard = new InlineKeyboard();
        assetCategories.forEach((cat, i) => {
            catKeyboard.text(cat.label, `cat_${cat.id}`);
            if ((i + 1) % 2 === 0) catKeyboard.row();
        });

        let category;
        while (true) {
            menu = await ctx.reply(`<b>Step 4: Classification Sector</b>\n${UI.separator}\nSelect the specialized sector for this asset:\n\n<i>Use the /cancel command to abort.</i>`, { ...options, reply_markup: catKeyboard });
            const catRes = await conversation.waitFor(["callback_query:data", "message:text"]);
            if (catRes.message?.text === "/cancel") {
                await ctx.api.deleteMessage(ctx.chat.id, menu.message_id);
                return await ctx.reply("<b>❌ Process Cancelled!</b>\n\nThe process has been cancelled.", options);
            }
            if (catRes.callbackQuery?.data?.startsWith("cat_")) {
                category = assetCategories.find(c => `cat_${c.id}` === catRes.callbackQuery.data)?.label;
                break;
            }
            await ctx.api.deleteMessage(ctx.chat.id, menu.message_id);
        }

        // --- NEW: STEP 5 FINAL CONFIRMATION ---
        const submissionConfirmKeyboard = new InlineKeyboard()
            .text("📤 Submit Final", "submit_final")
            .text("❌ Abort", "submit_abort");

        const submissionSummary =
            `<b>Review Submission</b>\n${UI.separator}\n` +
            `📦 <b>Identity:</b> <code>${identity.title}</code> (@${identity.username || 'PRIVATE'})\n` +
            `🗂 <b>Type:</b> <code>${assetType.toUpperCase()}</code>\n` +
            `📂 <b>Sector:</b> <code>${category.toUpperCase()}</code>\n` +
            `📝 <b>Brief:</b> <i>${description}</i>\n\n` +
            `${UI.separator}\n<b>Finalize this registration?</b>`;

        const subMenu = await ctx.api.editMessageText(ctx.chat.id, menu.message_id, submissionSummary, { ...options, reply_markup: submissionConfirmKeyboard });

        const finalDecision = await conversation.waitFor("callback_query:data");

        if (finalDecision.callbackQuery.data === "submit_abort") {
            await ctx.api.deleteMessage(ctx.chat.id, subMenu.message_id);
            return await ctx.reply("<b>❌ Process Cancelled!</b>\n\nThe process has been cancelled.", options);
        }

        // --- 6. FINAL SUMMARY & SAVE ---
        await ctx.api.editMessageText(ctx.chat.id, subMenu.message_id, UI.wait, options);

        if (["rejected", "disabled"].includes(existing?.status)) {
            existing.username = identity.username;
            existing.title = identity.title;
            existing.description = description;
            existing.category = category;
            existing.asset_type = assetType;
            existing.owner = ctx.from.id;
            existing.status = "pending";
            await existing.save();
        } else {
            await AssetModel.create({
                asset_id: identity.id,
                username: identity.username,
                title: identity.title,
                description,
                category,
                asset_type: assetType,
                owner: ctx.from.id
            });
        }

        const summary = `<b>${UI.success}</b>\n\n${UI.separator}\n\n📦 <b>ASSET IDENTITY</b>\n\n• <b>Title:</b> <code>${identity.title}</code>\n• <b>Handle:</b> <b>@${identity.username || 'PRIVATE'}</b>\n• <b>ID:</b> <code>${identity.id}</code>\n\n\n🗂 <b>CLASSIFICATION</b>\n\n• <b>Type:</b> <code>${assetType.toUpperCase()}</code>\n• <b>Sector:</b> <code>${category.toUpperCase()}</code>\n\n${UI.separator}\n\n<i>Status: <b>PENDING AUDIT</b> • Entry synchronized.</i>`;

        await ctx.api.editMessageText(ctx.chat.id, subMenu.message_id, summary, options);

        const admin = await get_admin();
        if (!admin) return;
        console.log(identity)
        const adminMarkup = {
            inline_keyboard: [
                [{ text: "📤 Approve", callback_data: `/update_asset_status approve ${identity.username}` }],
                [{ text: "❌ Reject", callback_data: `/update_asset_status reject ${identity.username}` }]
            ]
        }

        const adminReport = `<b>🛡 AUDIT REQUIRED</b>\n${UI.separator}\n\n👤 <b>SUBMITTED BY: ${user_mention(ctx.from)}</b>\n🏷 <b>TITLE:</b> <code>${identity.title}</code>\n🔗 <b>HANDLE:</b> <b>@${identity.username || 'NONE'}</b>\n🗂 <b>TYPE/CAT:</b> <code>${assetType.toUpperCase()}</code> / <code>${category.toUpperCase()}</code>\n\n📝 <b>BRIEF:</b> <i>${description}</i>\n\n\n<b>ACTION PROTOCOL:</b>`;

        return await api.sendMessage(admin.id, adminReport, {
            ...options,
            reply_markup: adminMarkup
        });
    } catch (err) {
        console.log(err)
        return await ctx.reply(`<b>❌ System Error:</b> Action could not be completed.`, options);
    }
}

export const addReviewComment = async (conversation, ctx) => {
    try {
        const callback_query = ctx.update?.callback_query;
        if(!callback_query) return await ctx.answerCallbackQuery({
            text: "❌ System Error: Action could not be completed.",
            show_alert: true
        })
        const id = callback_query.data.split(" ")[1];
        const user_id = callback_query.from.id;
        const text = `<b>Enter your Comment:</b>\n\n<b>✧ Submit Your Comment ✧\n\n</b><i>Use the /skip command to skip this step.</i>`;
        await ctx.editMessageText(text, {
            ...options
        })
        let comment;
        while (!comment) {
            const response = await conversation.waitFor("message");
            const txt = response?.message?.text;
            if (!txt) {
                await ctx.reply("<b>❌ Comment must be in text format!</b>", {
                    ...options
                });
                continue;
            }
            if (txt == "/skip") {
                return await ctx.reply("<b>✅ Your star rating has been recorded, but comment has been skipped!</b>", {
                    ...options,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "🔙 Back", callback_data: `/bot_info ${id}` }]
                        ]
                    }
                })
            }
            if (txt.length > 10 && txt.length < 180) {
                comment = txt;
                break;
            }
            await ctx.reply("<b>❌ Comment must be between 10 and 180 characters!</b>", {
                ...options
            });
        }
        const review = await ReviewModel.findOne({ asset_id: Number(id), user_id });
        if(!review) return await ctx.reply(`<b>❌ Entry not found in our records.</b>`, {
            ...options,
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🔙 Back", callback_data: `/bot_info ${id}` }]
                ]
            }
        })
        if (!review.comment) {
            const user = await UserModel.findOne({ id: user_id });
            user.reputation += 1;
            await user.save();
            ctx.api.sendMessage(user.id, `<b>⭐ Reputation updated</b>\n<b>Your Current Reputation:</b> <code>${user.reputation}</code>`, options);
        }
        review.comment = comment;
        await review.save();
        return await ctx.reply(`<b>✅ Your star rating and comment has been recorded!</b>`, {
            ...options,
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🔙 Back", callback_data: `/bot_info ${id}` }]
                ]
            }
        });
    } catch (err) {
        return await ctx.reply(`<b>❌ System Error:</b> Action could not be completed.`, options);
    }
}

export const verifyOwnership = async (conversation, ctx) => {
    try {
        await ctx.reply("<b>📩 Owner Verification!</b>\nPlease send the <b>@username</b> of the Bot, Channel, or Group.\n\n<i>Use the /cancel command to abort.</i>", {
            ...options
        });
        let username;
        let asset;
        let is_owner = false;
        while (!username) {
            const response = await conversation.waitFor("message");
            const text = response?.message?.text;

            if(!text) {
                await ctx.reply("<b>❌ Username must be in text format!</b>", options);
                continue;
            }

            if (text == "/cancel") {
                return await ctx.reply(`<b>❌ Process Cancelled!</b>\n\nThe process has been cancelled.`, options);
            }

            asset = await AssetModel.findOne({ username: text.replace("@", "") });
            if (!asset) {
                await ctx.reply(`<b>❌ Entry not found in our records.</b>`, options);
                continue;
            }

            username = asset.username;
            break;
        }

        if (asset.asset_type == "bot") {
            let token;
            await ctx.reply(`<b>🤖 Bot Verification Required</b>\n\nTo verify ownership of <b>@${asset.username}</b>, please provide its <b>API Token</b> from @BotFather.\n\n<i>Use the /cancel command to abort.</i>`, options);
            while (!token) {
                const response = await conversation.waitFor("message");
                const text = response?.message?.text;

                if(!text) {
                    await ctx.reply("<b>❌ Token must be in text format!</b>", options);
                    continue;
                }

                if (text == "/cancel") {
                    return await ctx.reply(`<b>❌ Process Cancelled!</b>\n\nThe process has been cancelled.`, options);
                }

                const res = await (await fetch(`https://api.telegram.org/bot${text}/getMe`)).json();
                if (!res.ok) {
                    await ctx.reply("<b>❌ Invalid Token!</b>", options);
                    continue;
                }

                if(res.result.username != asset.username && res.result.asset_id != asset.asset_id) {
                    await ctx.reply(`<b>❌ You're trying to verify ownership of @${asset.username} using the token of @${res.result.username}</b>`, options);
                    continue;
                }

                break;
            }
        } else {
            while (!is_owner) {
                const msg = await ctx.reply(`<b>📩 Channel/Chat Verification Required</b>\n\nTo verify ownership of <b>@${asset.username}, Add @${app_config.BOT.USERNAME} to your chat/channel as an admin. Then click on the verify button.\n\n⚠️ You can remove after verification!</b>`, {
                    ...options,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "✅ Verify", callback_data: `/verify_ownership_of_asset` }]
                        ]
                    }
                });
                const response = await conversation.waitFor(["callback_query:data", "message"]);
                const message = response?.message;
                const data = response?.callbackQuery?.data;
                if (message) {
                    if(message.text == "/cancel") {
                        return await ctx.reply(`<b>❌ Process Cancelled!</b>\n\nThe process has been cancelled.`, options);
                    }
                    await ctx.api.deleteMessage(ctx.chat.id, msg.message_id);
                    continue;
                }
                if (data == "/verify_ownership_of_asset") {
                    try {
                        const { status } = await api.getChatMember(asset.asset_id, ctx.from.id);
                        await ctx.api.deleteMessage(ctx.chat.id, msg.message_id);
                        if (status === "creator") {
                            is_owner = true;
                            break;
                        }
                        return await ctx.answerCallbackQuery({
                            text: "❌ You are not an admin in this chat/channel.",
                            show_alert: true
                        });
                    } catch (err) {
                        await ctx.reply(`<b>❌ Unable to process your request. Please add @${app_config.BOT.USERNAME} as an admin in your chat/channel.</b>`, options);
                    }
                }
            }
        }
        if (is_owner || username) {
            if (asset.owner === ctx.from.id) {
                return await ctx.reply(`<b>❌ You already own this asset.</b>`, options);
            } else {
                const past_owner = asset.owner;
                asset.owner = ctx.from.id;
                await asset.save();
                await ctx.reply(`<b>✅ Ownership successfully verified!</b>`, options);
                return await ctx.api.sendMessage(past_owner, `<b>🚨 Ownership of @${username} has been transferred to verified owner.</b>`, options);
            }
        }
    } catch (err) {
        return await ctx.reply(`<b>❌ System Error:</b> Action could not be completed.`, options);
    }
}

export const adminManageUser = async (conversation, ctx) => {
    try {
        const admin = await get_admin();
        if (admin && admin.id !== ctx.from.id) {
            return await ctx.answerCallbackQuery({
                text: "❌ Access Denied: Admin privileges required",
                show_alert: true
            });
        }

        await ctx.editMessageText(
            `<b>🛠️ USER SEARCH SYSTEM</b>\n\n` +
            `<i>Please send the Telegram ID of the user you wish to inspect.</i>\n\n` +
            `👉 <b>/cancel</b> to abort`,
            { parse_mode: "HTML" }
        );

        let user;
        while (!user) {
            const { message } = await conversation.waitFor("message:text");
            const text = message.text;

            if (text === "/cancel") {
                return await ctx.reply("<b>❌ Process Cancelled</b>\n\nThe process has been cancelled.", options);
            }

            if (isNaN(text)) {
                await ctx.reply("<b>⚠️ Invalid Format:</b> Please send a numeric User ID.", options);
                continue;
            }

            user = await UserModel.findOne({ id: Number(text) });

            if (!user) {
                await ctx.reply("<b>🔎 User not found</b> in the local database. Try again:", options);
                continue;
            }
        }

        // --- PREMIUM USER REPORT ---
        const report =
            `<b>🔎 User Found:</b> ${user.first_name}\n` +
            `<b>━━━━━━━━━━━━━━━━━━━━</b>\n` +
            `<b>🆔 ID:</b> <code>${user.id}</code>\n` +
            `<b>🏷️ Mention:</b> ${user_mention({ id: user.id, first_name: user.first_name, username: user.username })}\n` +
            `<b>⭐ Reputation:</b> <code>${user.reputation || 0}</code>\n` +
            `<b>📅 Joined:</b> <code>${new Date(user.createdAt).toLocaleDateString()}</code>\n` +
            `<b>━━━━━━━━━━━━━━━━━━━━</b>\n` +
            `<i>Select an administrative action:</i>`;

        const keyboard = [
            [{ text: `🔄️ Ban Status: ${user.is_banned ? "Banned 🚫" : "Not Banned ✅"}`, callback_data: `/admin_ban_user ${user.id}` }],
        ];

        return await ctx.reply(report, {
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: keyboard }
        });

    } catch (err) {
        return await ctx.reply(`<b>❌ System Error:</b> Action could not be completed.`, options);
    }
}

export const adminManageAsset = async (conversation, ctx) => {
    try {
        // 1. Authorization Check
        // Replace get_admin() with your actual admin verification logic
        const admin = await get_admin();
        if (!admin || admin.id !== ctx.from.id) {
            return await ctx.answerCallbackQuery({
                text: "❌ Access Denied: Admin Privileges Required",
                show_alert: true
            });
        }

        // 2. Initial Prompt
        await ctx.editMessageText(
            `<b>🛠️ ASSET SEARCH SYSTEM</b>\n\n` +
            `<i>Please send the username of the asset you wish to inspect.</i>\n\n` +
            `👉 Type <b>/cancel</b> to abort`,
            { parse_mode: "HTML" }
        );

        while (true) {
            // Wait for a text message
            const { message } = await conversation.wait();

            if (!message?.text) {
                await ctx.reply("<b>⚠️ Invalid Input:</b> Please send a text username.", { parse_mode: "HTML" });
                continue;
            }

            const input = message.text.trim();

            // 3. Exit Condition
            if (input.toLowerCase() === "/cancel") {
                return await ctx.reply("<b>❌ Process Cancelled</b>", { parse_mode: "HTML" });
            }

            // 4. Database Query (Cleaning the '@' if provided)
            const cleanUsername = input.replace("@", "");

            // Use conversation.external for DB calls to keep the conversation state synced
            const asset = await AssetModel.findOne({ username: new RegExp(`^${cleanUsername}$`, "i") })

            if (!asset) {
                await ctx.reply(
                    `<b>🔎 Asset "@${cleanUsername}" not found.</b>\nPlease try again or type /cancel:`,
                    { parse_mode: "HTML" }
                );
                continue;
            }

            // 5. Formatting the Full Details
            const statusEmoji = {
                pending: "⏳",
                approved: "✅",
                rejected: "❌",
                disabled: "🚫"
            }[asset.status] || "ℹ️";

            const details =
                `<b>📊 ASSET REPORT</b>\n` +
                `━━━━━━━━━━━━━━━━━━\n` +
                `<b>🆔 Asset ID:</b> <code>${asset.asset_id || 'N/A'}</code>\n` +
                `<b>👤 Username:</b> @${asset.username}\n` +
                `<b>🏷️ Title:</b> ${asset.title}\n` +
                `<b>📝 Description:</b>\n<i>${asset.description}</i>\n\n` +
                `<b>📂 Category:</b> <code>${asset.category}</code>\n` +
                `<b>💎 Type:</b> ${asset.asset_type}\n` +
                `<b>👑 Owner UID:</b> <code>${asset.owner}</code>\n` +
                `<b>⭐ Rating:</b> ${asset.rating}/5\n` +
                `━━━━━━━━━━━━━━━━━━\n` +
                `<b>📅 Created:</b> ${asset.createdAt.toLocaleString()}\n` +
                `<b>🔄 Updated:</b> ${asset.updatedAt.toLocaleString()}`;

            // 6. Action Buttons
            return await ctx.reply(details, {
                parse_mode: "HTML",
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
            });
        }
    } catch (err) {
        return await ctx.reply(`<b>❌ System Error:</b> Action could not be completed.`, options);
    }
}

export const adminMail = async (conversation, ctx) => {
    try {
        // 1. Auth Check
        const admin = await get_admin();
        if (!admin || admin.id !== ctx.from.id) {
            return await ctx.answerCallbackQuery({
                text: "❌ Access Denied: Admin privileges required",
                show_alert: true
            });
        }

        // 2. Initial Instructions
        await ctx.editMessageText(
            `<b>📧 MAILING SYSTEM</b>\n\n` +
            `Please <b>send</b> or <b>forward</b> the message you want to broadcast.\n\n` +
            `<i>Supports: Text, Photos, Videos, and Stickers.</i>\n` +
            `👉 <b>/cancel</b> to abort`,
            { parse_mode: "HTML" }
        );

        let broadcastMsg;
        while (true) {
            // Wait for any type of message
            const { message } = await conversation.wait();

            // Handle Cancel
            if (message?.text === "/cancel") {
                return await ctx.reply("<b>❌ Process Cancelled</b>", { parse_mode: "HTML" });
            }

            // Validate that we actually have a message to copy
            if (!message) {
                await ctx.reply("<b>⚠️ Error:</b> I couldn't process that message. Please try again.");
                continue;
            }

            broadcastMsg = message;
            break;
        }

        // 3. Preview Logic
        await ctx.reply("<b>👇 PREVIEW OF BROADCAST:</b>", { parse_mode: "HTML" });

        // Use copyMessage so the admin sees exactly what users will see
        await ctx.copyMessage(ctx.from.id, {
            from_chat_id: broadcastMsg.chat.id,
            message_id: broadcastMsg.message_id,
        });

        // 4. Confirmation Menu
        await ctx.reply("<b>⬆️ Above is your preview.</b>\n\nAre you sure you want to broadcast this to all users?", {
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: "🚀 Confirm & Send",
                            callback_data: `/admin_mail_confirm ${broadcastMsg.message_id}`
                        },
                        {
                            text: "❌ Cancel",
                            callback_data: "/admin_mail_cancel"
                        }
                    ]
                ]
            }
        });

    } catch (err) {
        return await ctx.reply(`<b>❌ System Error:</b> Action could not be completed.`, options);
    }
}