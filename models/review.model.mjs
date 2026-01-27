import { model, Schema } from "mongoose";

const schema = new Schema({
    asset_id: {
        type: Number,
        required: true
    },
    user_id: {
        type: Number,
        required: true
    },
    rating: {
        type: Number,
        required: true
    },
    comment: {
        type: String
    },
    owner: {
        type: Number
    }
}, {
    timestamps: true
})

export const ReviewModel = model("reviews", schema);