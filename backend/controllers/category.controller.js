import Category from "../model/category.model.js";
import mongoose from "mongoose";
import { 
  uploadOnCloudinary, 
  deleteFromCloudinary, 
  getPublicIdFromUrl 
} from "../utils/cloudinary.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import fs from "fs";

const cleanupTempFiles = async (files) => {
  if (!files || files.length === 0) return;
  await Promise.all(
    files.map((file) => fs.promises.unlink(file.path).catch(() => {}))
  );
};

const parsePagination = (page, limit) => {
  const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
  const limitNumber = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
  return { pageNumber, limitNumber };
};

const encodeCursor = (doc) => {
  const payload = {
    createdAt: doc.createdAt?.toISOString(),
    id: doc._id?.toString(),
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64');
};

const decodeCursor = (value) => {
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
    if (!decoded?.createdAt || !decoded?.id) {
      throw new ApiError(400, "Invalid cursor");
    }
    const createdAt = new Date(decoded.createdAt);
    if (Number.isNaN(createdAt.getTime())) {
      throw new ApiError(400, "Invalid cursor");
    }
    if (!mongoose.isValidObjectId(decoded.id)) {
      throw new ApiError(400, "Invalid cursor");
    }
    return { createdAt, id: new mongoose.Types.ObjectId(decoded.id) };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "Invalid cursor");
  }
};

const buildCursorFilter = (cursor, sortKey) => {
  if (!cursor) return null;
  const isOldest = sortKey === "oldest";
  return isOldest
    ? {
        $or: [
          { createdAt: { $gt: cursor.createdAt } },
          { createdAt: cursor.createdAt, _id: { $gt: cursor.id } },
        ],
      }
    : {
        $or: [
          { createdAt: { $lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
        ],
      };
};

const combineQuery = (baseQuery, extraQuery) => {
  if (!extraQuery) return baseQuery;
  if (!baseQuery || Object.keys(baseQuery).length === 0) return extraQuery;
  return { $and: [baseQuery, extraQuery] };
};

const normalizeName = (name) => (typeof name === "string" ? name.trim() : "");

const getDescendantCategoryIds = async (ancestorId, maxDepth) => {
  const ids = [];
  let queue = [ancestorId];
  let depth = 0;

  while (queue.length > 0) {
    if (maxDepth && depth >= maxDepth) break;
    const children = await Category.find(
      { parentCategoryId: { $in: queue } },
      "_id"
    ).lean();

    if (children.length === 0) break;

    const childIds = children.map((child) => child._id);
    ids.push(...childIds);
    queue = childIds;
    depth += 1;
  }

  return ids;
};

/**
 * @desc    Create new category
 * @route   POST /api/v1/categories
 * @access  Private/Admin
 */
export const createCategory = asyncHandler(async (req, res) => {
  const { name, parentCategoryId } = req.body;
  const parentCategoryName = req.body.ParentCategoryName ?? req.body.parentCategoryName;
  const normalizedName = normalizeName(name);

  if (!normalizedName) {
    throw new ApiError(400, "Category name is required");
  }
  if (!req.files || req.files.length === 0) {
    throw new ApiError(400, "At least one image is required");
  }

  const existingCategory = await Category.findOne({ name: normalizedName }).collation({
    locale: "en",
    strength: 2,
  });
  if (existingCategory) {
    await cleanupTempFiles(req.files);
    throw new ApiError(409, "Category with this name already exists");
  }

  if (parentCategoryId) {
    if (!mongoose.isValidObjectId(parentCategoryId)) {
      await cleanupTempFiles(req.files);
      throw new ApiError(400, "Invalid parent category id");
    }
    const parentCategoryExists = await Category.exists({ _id: parentCategoryId });
    if (!parentCategoryExists) {
      await cleanupTempFiles(req.files);
      throw new ApiError(404, "Parent category not found");
    }
  }

  let imageUrls = [];
  try {
    for (const file of req.files) {
      const result = await uploadOnCloudinary(file.path);
      if (result?.secure_url) {
        imageUrls.push(result.secure_url);
      }
    }
  } catch (error) {
    throw new ApiError(500, "Failed to upload images to Cloudinary");
  } finally {
    await cleanupTempFiles(req.files);
  }

  if (imageUrls.length === 0) {
    throw new ApiError(500, "Image upload failed");
  }

  const category = await Category.create({
    name: normalizedName,
    images: imageUrls,
    parentCategoryId: parentCategoryId || null,
    ParentCategoryName: parentCategoryName || "",
  });
  return res
    .status(201)
    .json(new ApiResponse(201, category, "Category created successfully"));
});

/**
 * @desc    Get all categories with pagination and search
 * @route   GET /api/v1/categories
 * @access  Public
 */
export const getAllCategories = asyncHandler(async (req, res) => {
  const { parentCategoryId, search } = req.query;
  const { pageNumber, limitNumber } = parsePagination(req.query.page, req.query.limit);
  const sortKey = req.query.sort;
  const cursorValue = req.query.cursor;
  const query = {};

  if (parentCategoryId) {
    if (!mongoose.isValidObjectId(parentCategoryId)) {
      throw new ApiError(400, "Invalid parent category id");
    }
    query.parentCategoryId = parentCategoryId;
  }

  if (search) {
    query.name = { $regex: search.trim(), $options: "i" };
  }

  if (cursorValue) {
    if (sortKey && sortKey !== "oldest") {
      throw new ApiError(400, "Cursor pagination supports only newest or oldest sorting");
    }
    const cursor = decodeCursor(cursorValue);
    const cursorFilter = buildCursorFilter(cursor, sortKey);
    const finalQuery = combineQuery(query, cursorFilter);
    const cursorSort = sortKey === "oldest" ? { createdAt: 1, _id: 1 } : { createdAt: -1, _id: -1 };

    const categories = await Category.find(finalQuery)
      .populate("parentCategoryId", "name images")
      .sort(cursorSort)
      .limit(limitNumber + 1)
      .lean();

    const hasNextPage = categories.length > limitNumber;
    if (hasNextPage) categories.pop();

    const nextCursor = hasNextPage ? encodeCursor(categories[categories.length - 1]) : null;

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          categories,
          pagination: {
            mode: "cursor",
            limit: limitNumber,
            nextCursor,
            hasNextPage,
          },
        },
        "Categories fetched successfully"
      )
    );
  }

  const skip = (pageNumber - 1) * limitNumber;

  const [categories, total] = await Promise.all([
    Category.find(query)
      .populate("parentCategoryId", "name images")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNumber)
      .lean(),
    Category.countDocuments(query),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200, 
      {
        categories,
        pagination: {
          mode: "offset",
          total,
          page: pageNumber,
          limit: limitNumber,
          totalPages: Math.ceil(total / limitNumber)
        }
      }, 
      "Categories fetched successfully"
    )
  );
});

/**
 * @desc    Get category by ID
 * @route   GET /api/v1/categories/:id
 * @access  Public
 */
export const getCategoryById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    throw new ApiError(400, "Invalid category id");
  }

  const category = await Category.findById(id)
    .populate("parentCategoryId", "name images")
    .lean();

  if (!category) {
    throw new ApiError(404, "Category not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, category, "Category fetched successfully"));
});

/**
 * @desc    Get direct children categories
 * @route   GET /api/v1/categories/:id/children
 * @access  Public
 */
export const getCategoryChildren = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    throw new ApiError(400, "Invalid category id");
  }

  const children = await Category.find({ parentCategoryId: id })
    .sort({ createdAt: -1 })
    .lean();

  return res
    .status(200)
    .json(new ApiResponse(200, children, "Category children fetched successfully"));
});

/**
 * @desc    Get descendant categories (any depth)
 * @route   GET /api/v1/categories/:id/descendants
 * @access  Public
 */
export const getCategoryDescendants = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const maxDepth = req.query.maxDepth ? parseInt(req.query.maxDepth, 10) : undefined;
  const includeSelf = req.query.includeSelf === "true";

  if (!mongoose.isValidObjectId(id)) {
    throw new ApiError(400, "Invalid category id");
  }
  if (maxDepth !== undefined && (Number.isNaN(maxDepth) || maxDepth < 1)) {
    throw new ApiError(400, "maxDepth must be a positive integer");
  }

  const descendants = await getDescendantCategoryIds(id, maxDepth);
  const ids = includeSelf ? [id, ...descendants] : descendants;

  const categories = ids.length
    ? await Category.find({ _id: { $in: ids } })
        .sort({ createdAt: -1 })
        .lean()
    : [];

  return res
    .status(200)
    .json(new ApiResponse(200, categories, "Category descendants fetched successfully"));
});

/**
 * @desc    Update category
 * @route   PATCH /api/v1/categories/:id
 * @access  Private/Admin
 */
export const updateCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, parentCategoryId } = req.body;
  const parentCategoryName = req.body.ParentCategoryName ?? req.body.parentCategoryName;
  const normalizedName = normalizeName(name);

  if (!mongoose.isValidObjectId(id)) {
    await cleanupTempFiles(req.files);
    throw new ApiError(400, "Invalid category id");
  }

  const category = await Category.findById(id);
  if (!category) {
    await cleanupTempFiles(req.files);
    throw new ApiError(404, "Category not found");
  }

  if (normalizedName && normalizedName !== category.name) {
    const existingCategory = await Category.findOne({
      name: normalizedName,
      _id: { $ne: id },
    }).collation({ locale: "en", strength: 2 });
    if (existingCategory) {
      await cleanupTempFiles(req.files);
      throw new ApiError(409, "Category with this name already exists");
    }
  }

  const updateData = {};
  if (normalizedName) updateData.name = normalizedName;
  if (parentCategoryName !== undefined) {
    updateData.ParentCategoryName = parentCategoryName;
  }

  if (parentCategoryId !== undefined) {
    if (parentCategoryId) {
      if (!mongoose.isValidObjectId(parentCategoryId)) {
        await cleanupTempFiles(req.files);
        throw new ApiError(400, "Invalid parent category id");
      }
      const parentCategoryExists = await Category.exists({ _id: parentCategoryId });
      if (!parentCategoryExists) {
        await cleanupTempFiles(req.files);
        throw new ApiError(404, "Parent category not found");
      }
    }
    updateData.parentCategoryId = parentCategoryId || null;
  }

  const hasUpdateBody = Object.keys(updateData).length > 0;
  const hasImageUploads = req.files && req.files.length > 0;

  if (!hasUpdateBody && !hasImageUploads) {
    throw new ApiError(400, "No update fields provided");
  }

  // Handle image updates
  if (hasImageUploads) {
    let newImageUrls = [];
    try {
      for (const file of req.files) {
        const result = await uploadOnCloudinary(file.path);
        if (result?.secure_url) {
          newImageUrls.push(result.secure_url);
        }
      }
    } catch (error) {
      throw new ApiError(500, "Failed to upload images to Cloudinary");
    } finally {
      await cleanupTempFiles(req.files);
    }

    if (newImageUrls.length === 0) {
      throw new ApiError(500, "Image upload failed");
    }
    // Delete old images from Cloudinary
    for (const imageUrl of category.images) {
      const publicId = getPublicIdFromUrl(imageUrl);
      if (publicId) await deleteFromCloudinary(publicId);
    }
    updateData.images = newImageUrls;
  }

  const updatedCategory = await Category.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  }).populate("parentCategoryId", "name images");

  return res
    .status(200)
    .json(new ApiResponse(200, updatedCategory, "Category updated successfully"));
});

/**
 * @desc    Delete category
 * @route   DELETE /api/v1/categories/:id
 * @access  Private/Admin
 */
export const deleteCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    throw new ApiError(400, "Invalid category id");
  }

  const category = await Category.findById(id);
  if (!category) {
    throw new ApiError(404, "Category not found");
  }

  const hasChildren = await Category.exists({ parentCategoryId: id });
  if (hasChildren) {
    throw new ApiError(409, "Category has child categories");
  }

  // Delete images from Cloudinary
  for (const imageUrl of category.images) {
    const publicId = getPublicIdFromUrl(imageUrl);
    if (publicId) await deleteFromCloudinary(publicId);
  }

  await Category.findByIdAndDelete(id);

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Category deleted successfully"));
});

/**
 * @desc    Upload category images
 * @route   POST /api/v1/categories/:id/images
 * @access  Private/Admin
 */
export const uploadCategoryImages = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    await cleanupTempFiles(req.files);
    throw new ApiError(400, "Invalid category id");
  }

  if (!req.files || req.files.length === 0) {
    throw new ApiError(400, "No files uploaded");
  }

  const category = await Category.findById(id);
  if (!category) {
    await cleanupTempFiles(req.files);
    throw new ApiError(404, "Category not found");
  }

  let uploadedImages = [];
  try {
    for (const file of req.files) {
      const result = await uploadOnCloudinary(file.path);
      if (result?.secure_url) {
        uploadedImages.push(result.secure_url);
      }
    }
  } catch (error) {
    throw new ApiError(500, "Failed to upload images to Cloudinary");
  } finally {
    await cleanupTempFiles(req.files);
  }

  if (uploadedImages.length === 0) {
    throw new ApiError(500, "Image upload failed");
  }

  if (uploadedImages.length > 0) {
    category.images = [...category.images, ...uploadedImages];
    await category.save();
  }

  return res
    .status(200)
    .json(new ApiResponse(200, category, "Images uploaded successfully"));
});

/**
 * @desc    Delete category image by URL
 * @route   DELETE /api/v1/categories/:id/images
 * @access  Private/Admin
 */
export const deleteCategoryImage = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { imageUrl } = req.body;

  if (!mongoose.isValidObjectId(id)) {
    throw new ApiError(400, "Invalid category id");
  }

  if (!imageUrl) {
    throw new ApiError(400, "Image URL is required");
  }

  const category = await Category.findById(id);
  if (!category) {
    throw new ApiError(404, "Category not found");
  }

  if (category.images.length <= 1) {
    throw new ApiError(400, "Cannot delete the last image of a category");
  }

  if (!category.images.includes(imageUrl)) {
    throw new ApiError(404, "Image not found in this category");
  }

  const publicId = getPublicIdFromUrl(imageUrl);
  if (publicId) {
    await deleteFromCloudinary(publicId);
  }

  category.images = category.images.filter((img) => img !== imageUrl);
  await category.save();

  return res
    .status(200)
    .json(new ApiResponse(200, category, "Image deleted successfully"));
});
