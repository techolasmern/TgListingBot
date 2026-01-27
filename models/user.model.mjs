import { model, Schema } from "mongoose";

const schema = new Schema({
    id: { type: Number, required: true, unique: true },
    first_name: { type: String, required: true },
    last_name: { type: String },
    username: { type: String },
    reputation: { type: Number, default: 0 },
    is_admin: { type: Boolean, default: false },
    is_banned: { type: Boolean, default: false },
    broadcasted: { type: Boolean, default: false }
}, {
    timestamps: true
});

export const UserModel = model("users", schema);