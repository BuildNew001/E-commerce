import jwt from 'jsonwebtoken';
import User from '../model/user.model.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const protectedRoute = asyncHandler(async (req, res, next) => {
  const accessToken = req.cookies.accessToken;

  if (!accessToken) {
    throw new ApiError(401, "No access token provided");
  }

  try {
    const decoded = jwt.verify(accessToken, process.env.JWT_ACCESS_SECRET);
    
    const user = await User.findById(decoded.id).select("-password -refreshToken");
    
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    if (user.status !== 'active') {
      throw new ApiError(403, "User account is suspended");
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new ApiError(401, "Access token expired");
    }
    throw new ApiError(403, error.message || "Invalid access token");
  }
});

export const isAdmin = asyncHandler(async (req, res, next) => {
  if (req.user?.role !== 'admin') {
    throw new ApiError(403, "Access denied. Admin only.");
  }
  next();
});
