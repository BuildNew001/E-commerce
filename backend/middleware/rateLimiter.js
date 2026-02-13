import rateLimit from "express-rate-limit";

export const createAccountLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5, 
  message:
    "Too many accounts created from this IP, please try again after an hour",
});

export const resendVerificationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, 
  max: 5, 
  message:
    "Too many resend attempts from this IP, please try again after an hour",
});
