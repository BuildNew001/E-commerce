import User from "../model/user.model.js";
import { uploadOnCloudinary, deleteFromCloudinary } from "../utils/cloudinary.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
export const getprofile = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(new ApiResponse(200, req.user, "User profile fetched successfully"));
});

export const updateProfile = asyncHandler(async (req, res) => {
  const { name, mobile_number } = req.body;
  
  const updateData = {};
  if (name) updateData.name = name;
  if (mobile_number) updateData.mobile_number = mobile_number;

  const updatedUser = await User.findByIdAndUpdate(
    req.user._id, 
    { $set: updateData }, 
    { new: true, runValidators: true }
  ).select("-password -refreshToken");

  if (!updatedUser) {
    throw new ApiError(404, "User not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, updatedUser, "Profile updated successfully"));
});

export const uploadProfileImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, "No file uploaded");
  }

  const result = await uploadOnCloudinary(req.file.path, "avatar");
  
  if (!result) {
    throw new ApiError(500, "Error uploading image to Cloudinary");
  }

  const updatedUser = await User.findByIdAndUpdate(
    req.user._id,
    { $set: { avatar: result.secure_url } },
    { new: true }
  ).select("-password -refreshToken");

  return res
    .status(200)
    .json(new ApiResponse(200, updatedUser, "Profile image uploaded successfully"));
});

export const deleteProfileImage = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  
  if (user.avatar) {
    const publicId = `user_${req.user._id}`;
    await deleteFromCloudinary(publicId, "avatar");
  }
  const updatedUser = await User.findByIdAndUpdate(
    req.user._id,
    { $set: { avatar: '' } },
    { new: true }
  ).select("-password -refreshToken");

  return res
    .status(200)
    .json(new ApiResponse(200, updatedUser, "Profile image deleted successfully"));
});
