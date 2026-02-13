import express from "express";
import { protectedRoute } from "../middleware/auth.middleware.js";
import {
  getprofile,
  updateProfile,
  uploadProfileImage,
  deleteProfileImage,
} from '../controllers/user.controller.js'
import upload from '../middleware/multer.middleware.js'

const userRoutes = express.Router()

userRoutes.put('/update-profile', protectedRoute, updateProfile)
userRoutes.get('/profile', protectedRoute, getprofile)
userRoutes.post(
  '/upload-profile-image',
  protectedRoute,
  upload.single('avatar'),
  uploadProfileImage
)
userRoutes.delete('/profile-image', protectedRoute, deleteProfileImage)

export default userRoutes
