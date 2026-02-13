import express from "express";
import {
  login,
  logout,
  refreshToken,
  signup,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
} from '../controllers/auth.controller.js'
import {
  createAccountLimiter,
  resendVerificationLimiter
} from '../middleware/rateLimiter.js'

const authRoutes = express.Router()

authRoutes.post('/signup', createAccountLimiter, signup)
authRoutes.get('/verify-email/:token', verifyEmail)
authRoutes.post(
  '/resend-verification',
  resendVerificationLimiter,
  resendVerification
)
authRoutes.post('/login', login)
authRoutes.post('/logout', logout)
authRoutes.post('/refresh-token', refreshToken)
authRoutes.post('/forgot-password', forgotPassword)
authRoutes.post('/reset-password/:token', resetPassword)
export default authRoutes
