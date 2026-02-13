import mongoose from "mongoose";

export const ConnectDB = async()=>{
    try{
        const connect = await mongoose.connect(process.env.MONGO_URL);
        console.log(`MongoDB connected: ${connect.connection.host}`)
    }
    catch(err){
        console.log(`Error: ${err.message}`)
        process.exit(1)
    }

}