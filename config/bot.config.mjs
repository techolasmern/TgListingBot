import { Bot, MemorySessionStorage, session } from "grammy";
import { app_config } from "./app.config.mjs";
import { conversations, createConversation } from "@grammyjs/conversations";
import { addReviewComment, adminMail, adminManageAsset, adminManageUser, createListing, verifyOwnership } from "../bot/conversation.mjs";
import { autoRetry } from "@grammyjs/auto-retry";

export const bot = new Bot(app_config.BOT.TOKEN);

export const api = bot.api;

bot.api.config.use(autoRetry());

bot.use(session({
    initial: () => ({ 
        asset_id: null,
        conversation: {}
    }),
    storage: new MemorySessionStorage()
}));
bot.use(conversations());

bot.use(createConversation(createListing));
bot.use(createConversation(addReviewComment));
bot.use(createConversation(verifyOwnership));
bot.use(createConversation(adminManageUser));
bot.use(createConversation(adminManageAsset));
bot.use(createConversation(adminMail));

bot.start();