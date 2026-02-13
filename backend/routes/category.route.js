import { Router } from "express";
import {
  createCategory,
  getAllCategories,
  getCategoryById,
  getCategoryChildren,
  getCategoryDescendants,
  updateCategory,
  deleteCategory,
  uploadCategoryImages,
  deleteCategoryImage,
} from "../controllers/category.controller.js";
import upload from "../middleware/multer.middleware.js";
import { protectedRoute, isAdmin } from "../middleware/auth.middleware.js";

const router = Router();

// Public routes
router.get("/", getAllCategories);
router.get("/:id/children", getCategoryChildren);
router.get("/:id/descendants", getCategoryDescendants);
router.get("/:id", getCategoryById);

// Admin routes
router.post("/", protectedRoute, isAdmin, upload.array("images", 5), createCategory);
router.patch("/:id", protectedRoute, isAdmin, upload.array("images", 5), updateCategory);
router.delete("/:id", protectedRoute, isAdmin, deleteCategory);

router.post("/:id/images", protectedRoute, isAdmin, upload.array("images", 5), uploadCategoryImages);
router.delete("/:id/images", protectedRoute, isAdmin, deleteCategoryImage);

export default router;
