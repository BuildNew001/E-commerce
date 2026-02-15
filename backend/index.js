import express from "express"
import dotenv from "dotenv"
import cookieParser from 'cookie-parser'
import morgan from "morgan"
import helmet from "helmet"
import cors from "cors"
import { ConnectDB } from "./lib/db.lib.js"
import authRoutes from "./routes/auth.route.js"
import userRoutes from "./routes/user.route.js"
import categoryRoutes from "./routes/category.route.js"
import productRoutes from "./routes/product.route.js"
import cartRoutes from "./routes/cart.route.js"
import { ApiError } from "./utils/ApiError.js"

dotenv.config()

const app = express()
ConnectDB();
app.use(cors())
app.use(express.json())
app.use(cookieParser())
app.use(morgan('dev'))
app.use(helmet({
    crossOriginResourcePolicy:false,
}))
app.use("/api/v1/auth", authRoutes)
app.use("/api/v1/user", userRoutes)
app.use("/api/v1/categories", categoryRoutes)
app.use("/api/v1/products", productRoutes)
app.use("/api/v1/cart", cartRoutes)

// Error handling middleware
app.use((err, req, res, next) => {
    if (err instanceof ApiError) {
        return res.status(err.statusCode).json({
            success: err.success,
            message: err.message,
            errors: err.errors,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }

    return res.status(500).json({
        success: false,
        message: err.message || "Internal Server Error",
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server is running on PORT ${PORT}`)
})
