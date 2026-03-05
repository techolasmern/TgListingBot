import { connect } from "mongoose";
import env from "dotenv"
env.config()

export const db = {
    config: async () => {
        try {
            const { connection } = await connect(process.env.DATABASE_URI, {
                dbName: process.env.DATABASE_NAME
            }); 
            return console.log(`Connected to database: ${connection.db.databaseName}`);
        } catch (err) {
            return console.log(err.message);
        }
    }
}