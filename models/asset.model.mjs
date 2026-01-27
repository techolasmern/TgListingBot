import { Schema, model } from "mongoose";

const schema = new Schema({
    asset_id: { type: Number },
    username: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    category: { type: String, required: true },
    owner: { type: Number },
    asset_type: { type: String, required: true },
    rating: { type: Number, default: 0 },
    status: { type: String, default: "pending", enum: ["pending", "approved", "rejected", "disabled"] },
}, {
    timestamps: true
});

export const AssetModel = model("listings", schema);