import mongoose from 'mongoose'
import fs from 'fs'
import Product from '../model/product.model.js'
import Category from '../model/category.model.js'
import {
  uploadOnCloudinary,
  deleteFromCloudinary,
  getPublicIdFromUrl
} from '../utils/cloudinary.js'
import { ApiError } from '../utils/ApiError.js'
import { ApiResponse } from '../utils/ApiResponse.js'
import { asyncHandler } from '../utils/asyncHandler.js'

const cleanupTempFiles = async (files) => {
  if (!files || files.length === 0) return
  await Promise.all(
    files.map((file) => fs.promises.unlink(file.path).catch(() => {}))
  )
}
const parsePagination = (page, limit) => {
  const pageNumber = Math.max(parseInt(page, 10) || 1, 1)
  const limitNumber = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100)
  return { pageNumber, limitNumber }
}

const encodeCursor = (doc) => {
  const payload = {
    createdAt: doc.createdAt?.toISOString(),
    id: doc._id?.toString()
  }
  return Buffer.from(JSON.stringify(payload)).toString('base64')
}

const decodeCursor = (value) => {
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64').toString('utf8'))
    if (!decoded?.createdAt || !decoded?.id) {
      throw new ApiError(400, 'Invalid cursor')
    }
    const createdAt = new Date(decoded.createdAt)
    if (Number.isNaN(createdAt.getTime())) {
      throw new ApiError(400, 'Invalid cursor')
    }
    if (!mongoose.isValidObjectId(decoded.id)) {
      throw new ApiError(400, 'Invalid cursor')
    }
    return { createdAt, id: new mongoose.Types.ObjectId(decoded.id) }
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(400, 'Invalid cursor')
  }
}

const buildCursorFilter = (cursor, sortKey) => {
  if (!cursor) return null
  const isOldest = sortKey === 'oldest'
  return isOldest
    ? {
        $or: [
          { createdAt: { $gt: cursor.createdAt } },
          { createdAt: cursor.createdAt, _id: { $gt: cursor.id } }
        ]
      }
    : {
        $or: [
          { createdAt: { $lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, _id: { $lt: cursor.id } }
        ]
      }
}

const combineQuery = (baseQuery, extraQuery) => {
  if (!extraQuery) return baseQuery
  if (!baseQuery || Object.keys(baseQuery).length === 0) return extraQuery
  return { $and: [baseQuery, extraQuery] }
}

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const buildSort = (sortKey) => {
  switch (sortKey) {
    case 'price_asc':
      return { price: 1 }
    case 'price_desc':
      return { price: -1 }
    case 'rating_desc':
      return { rating: -1 }
    case 'oldest':
      return { createdAt: 1 }
    default:
      return { createdAt: -1 }
  }
}

const validateObjectId = (value, message) => {
  if (!mongoose.isValidObjectId(value)) {
    throw new ApiError(400, message)
  }
}

const parseNumber = (value, label) => {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = Number(value)
  if (Number.isNaN(parsed)) {
    throw new ApiError(400, `${label} must be a number`)
  }
  return parsed
}

const parsePositiveInt = (value, label) => {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed) || parsed < 1) {
    throw new ApiError(400, `${label} must be a positive integer`)
  }
  return parsed
}

const parseBoolean = (value) => value === true || value === 'true'

const normalizeArray = (value) => {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return undefined
}

const findCategoryIdByName = async (name) => {
  const trimmed = typeof name === 'string' ? name.trim() : ''
  if (!trimmed) throw new ApiError(400, 'Category name is required')
  const regex = new RegExp(`^${escapeRegex(trimmed)}$`, 'i')
  const category = await Category.findOne({ name: regex })
  if (!category) throw new ApiError(404, 'Category not found')
  return category._id
}

const getDescendantCategoryIds = async (ancestorId, maxDepth, includeSelf) => {
  const ids = []
  let queue = [ancestorId]
  let depth = 0

  if (includeSelf) ids.push(ancestorId)

  while (queue.length > 0) {
    if (maxDepth && depth >= maxDepth) break
    const children = await Category.find(
      { parentCategoryId: { $in: queue } },
      '_id'
    ).lean()

    if (children.length === 0) break

    const childIds = children.map((child) => child._id)
    ids.push(...childIds)
    queue = childIds
    depth += 1
  }

  return ids
}

const buildProductQuery = ({
  categoryId,
  categoryIds,
  minPrice,
  maxPrice,
  minRating,
  featured,
  search
}) => {
  const query = {}

  if (categoryIds && categoryIds.length > 0) {
    query.category = { $in: categoryIds }
  } else if (categoryId) {
    query.category = categoryId
  }

  if (minPrice !== undefined || maxPrice !== undefined) {
    query.price = {}
    if (minPrice !== undefined) query.price.$gte = Number(minPrice)
    if (maxPrice !== undefined) query.price.$lte = Number(maxPrice)
  }

  if (minRating !== undefined) {
    query.rating = { $gte: Number(minRating) }
  }

  if (featured !== undefined) {
    query.isfeatured = featured === 'true' || featured === true
  }

  if (search) {
    const regex = new RegExp(escapeRegex(search.trim()), 'i')
    query.name = regex
  }

  return query
}

const listProducts = async (req, res, overrides = {}) => {
  const { pageNumber, limitNumber } = parsePagination(req.query.page, req.query.limit)
  const sortKey = req.query.sort
  const sort = buildSort(sortKey)
  const cursorValue = req.query.cursor

  const categoryId = overrides.categoryId ?? req.query.categoryId
  const ancestorCategoryId = overrides.ancestorCategoryId ?? req.query.ancestorCategoryId
  const ancestorCategoryName = overrides.ancestorCategoryName ?? req.query.ancestorCategoryName

  if (categoryId && (ancestorCategoryId || ancestorCategoryName)) {
    throw new ApiError(400, 'Use either categoryId or ancestorCategoryId, not both')
  }

  if (categoryId) validateObjectId(categoryId, 'Invalid category id')
  if (ancestorCategoryId) {
    validateObjectId(ancestorCategoryId, 'Invalid ancestor category id')
  }

  let categoryIds
  if (ancestorCategoryName) {
    const resolvedId = await findCategoryIdByName(ancestorCategoryName)
    const maxDepth = parsePositiveInt(req.query.maxDepth, 'maxDepth')
    const includeSelf = req.query.includeSelf !== 'false'
    categoryIds = await getDescendantCategoryIds(resolvedId, maxDepth, includeSelf)
  } else if (ancestorCategoryId) {
    const maxDepth = parsePositiveInt(req.query.maxDepth, 'maxDepth')
    const includeSelf = req.query.includeSelf !== 'false'
    categoryIds = await getDescendantCategoryIds(ancestorCategoryId, maxDepth, includeSelf)
  }

  const query = buildProductQuery({
    categoryId,
    categoryIds,
    minPrice: parseNumber(overrides.minPrice ?? req.query.minPrice, 'minPrice'),
    maxPrice: parseNumber(overrides.maxPrice ?? req.query.maxPrice, 'maxPrice'),
    minRating: parseNumber(overrides.minRating ?? req.query.minRating, 'minRating'),
    featured: overrides.featured ?? req.query.featured,
    search: overrides.search ?? req.query.search
  })

  if (cursorValue) {
    if (sortKey && sortKey !== 'oldest') {
      throw new ApiError(400, 'Cursor pagination supports only newest or oldest sorting')
    }
    const cursor = decodeCursor(cursorValue)
    const cursorFilter = buildCursorFilter(cursor, sortKey)
    const finalQuery = combineQuery(query, cursorFilter)
    const cursorSort = sortKey === 'oldest' ? { createdAt: 1, _id: 1 } : { createdAt: -1, _id: -1 }

    const products = await Product.find(finalQuery)
      .populate('category', 'name images')
      .sort(cursorSort)
      .limit(limitNumber + 1)
      .lean()

    const hasNextPage = products.length > limitNumber
    if (hasNextPage) products.pop()

    const nextCursor = hasNextPage ? encodeCursor(products[products.length - 1]) : null

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          products,
          pagination: {
            mode: 'cursor',
            limit: limitNumber,
            nextCursor,
            hasNextPage
          }
        },
        'Products fetched successfully'
      )
    )
  }

  const skip = (pageNumber - 1) * limitNumber

  const [products, total] = await Promise.all([
    Product.find(query)
      .populate('category', 'name images')
      .sort(sort)
      .skip(skip)
      .limit(limitNumber)
      .lean(),
    Product.countDocuments(query)
  ])

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        products,
        pagination: {
          mode: 'offset',
          total,
          page: pageNumber,
          limit: limitNumber,
          totalPages: Math.ceil(total / limitNumber)
        }
      },
      'Products fetched successfully'
    )
  )
}

export const createProduct = asyncHandler(async (req, res) => {
  const {
    name,
    description,
    brand,
    price,
    oldPrice,
    category,
    countInstock,
    rating,
    numReviews,
    isfeatured,
    discount,
    productRam,
    size,
    productWeight
  } = req.body

  if (!name || !description || price === undefined || countInstock === undefined) {
    await cleanupTempFiles(req.files)
    throw new ApiError(400, 'name, description, price, and countInstock are required')
  }

  const categoryId = category || req.body.categoryId
  if (!categoryId) {
    await cleanupTempFiles(req.files)
    throw new ApiError(400, 'category is required')
  }
  validateObjectId(categoryId, 'Invalid category id')
  const categoryExists = await Category.exists({ _id: categoryId })
  if (!categoryExists) {
    await cleanupTempFiles(req.files)
    throw new ApiError(404, 'Category not found')
  }

  let imageUrls = []
  try {
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const result = await uploadOnCloudinary(file.path, 'products')
        if (result?.secure_url) imageUrls.push(result.secure_url)
      }
    }
  } catch (error) {
    throw new ApiError(500, 'Failed to upload images to Cloudinary')
  } finally {
    await cleanupTempFiles(req.files)
  }

  const incomingImages = Array.isArray(req.body.images)
    ? req.body.images
    : req.body.images
    ? [req.body.images]
    : []

  if (imageUrls.length === 0 && incomingImages.length === 0) {
    throw new ApiError(400, 'At least one product image is required')
  }

  if (imageUrls.length === 0) {
    imageUrls = incomingImages
  }

  const product = await Product.create({
    name: name.trim(),
    description: description.trim(),
    brand: brand?.trim() || '',
    price,
    oldPrice,
    images: imageUrls,
    category: categoryId,
    countInstock,
    rating,
    numReviews,
    isfeatured: parseBoolean(isfeatured),
    discount,
    productRam: normalizeArray(productRam),
    size: normalizeArray(size),
    productWeight: normalizeArray(productWeight)
  })

  return res
    .status(201)
    .json(new ApiResponse(201, product, 'Product created successfully'))
})

export const updateProduct = asyncHandler(async (req, res) => {
  const { id } = req.params
  validateObjectId(id, 'Invalid product id')

  const product = await Product.findById(id)
  if (!product) {
    await cleanupTempFiles(req.files)
    throw new ApiError(404, 'Product not found')
  }

  const updateData = {}
  const {
    name,
    description,
    brand,
    price,
    oldPrice,
    category,
    countInstock,
    rating,
    numReviews,
    isfeatured,
    discount,
    productRam,
    size,
    productWeight
  } = req.body

  if (name !== undefined) updateData.name = name.trim()
  if (description !== undefined) updateData.description = description.trim()
  if (brand !== undefined) updateData.brand = brand.trim()
  if (price !== undefined) updateData.price = price
  if (oldPrice !== undefined) updateData.oldPrice = oldPrice
  if (countInstock !== undefined) updateData.countInstock = countInstock
  if (rating !== undefined) updateData.rating = rating
  if (numReviews !== undefined) updateData.numReviews = numReviews
  if (isfeatured !== undefined) updateData.isfeatured = parseBoolean(isfeatured)
  if (discount !== undefined) updateData.discount = discount
  if (productRam !== undefined) updateData.productRam = normalizeArray(productRam)
  if (size !== undefined) updateData.size = normalizeArray(size)
  if (productWeight !== undefined) updateData.productWeight = normalizeArray(productWeight)

  const categoryValue = category ?? req.body.categoryId
  if (categoryValue !== undefined) {
    validateObjectId(categoryValue, 'Invalid category id')
    const categoryExists = await Category.exists({ _id: categoryValue })
    if (!categoryExists) {
      await cleanupTempFiles(req.files)
      throw new ApiError(404, 'Category not found')
    }
    updateData.category = categoryValue
  }

  if (req.files && req.files.length > 0) {
    let newImages = []
    try {
      for (const file of req.files) {
        const result = await uploadOnCloudinary(file.path, 'products')
        if (result?.secure_url) newImages.push(result.secure_url)
      }
    } catch (error) {
      throw new ApiError(500, 'Failed to upload images to Cloudinary')
    } finally {
      await cleanupTempFiles(req.files)
    }

    if (newImages.length === 0) {
      throw new ApiError(500, 'Image upload failed')
    }

    for (const imageUrl of product.images || []) {
      const publicId = getPublicIdFromUrl(imageUrl)
      if (publicId) await deleteFromCloudinary(publicId, 'products')
    }
    updateData.images = newImages
  }

  if (Object.keys(updateData).length === 0) {
    throw new ApiError(400, 'No update fields provided')
  }

  const updatedProduct = await Product.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true
  })
    .populate('category', 'name images')

  return res
    .status(200)
    .json(new ApiResponse(200, updatedProduct, 'Product updated successfully'))
})

export const deleteProduct = asyncHandler(async (req, res) => {
  const { id } = req.params
  validateObjectId(id, 'Invalid product id')

  const product = await Product.findById(id)
  if (!product) {
    throw new ApiError(404, 'Product not found')
  }

  for (const imageUrl of product.images || []) {
    const publicId = getPublicIdFromUrl(imageUrl)
    if (publicId) await deleteFromCloudinary(publicId, 'products')
  }

  await Product.findByIdAndDelete(id)

  return res
    .status(200)
    .json(new ApiResponse(200, null, 'Product deleted successfully'))
})

export const getProduct = asyncHandler(async (req, res) => {
  const { id } = req.params
  validateObjectId(id, 'Invalid product id')

  const product = await Product.findById(id)
    .populate('category', 'name images')
    .lean()

  if (!product) {
    throw new ApiError(404, 'Product not found')
  }

  return res
    .status(200)
    .json(new ApiResponse(200, product, 'Product fetched successfully'))
})

export const getAllProducts = asyncHandler(async (req, res) => {
  return listProducts(req, res)
})

export const getAllProductsByCatId = asyncHandler(async (req, res) => {
  const { id } = req.params
  validateObjectId(id, 'Invalid category id')
  return listProducts(req, res, { categoryId: id })
})

export const getAllProductsByCatName = asyncHandler(async (req, res) => {
  const categoryId = await findCategoryIdByName(req.query.name)
  return listProducts(req, res, { categoryId })
})


export const getAllProductsByPrice = asyncHandler(async (req, res) => {
  const { minPrice, maxPrice } = req.query
  return listProducts(req, res, { minPrice, maxPrice })
})

export const getAllProductsByRating = asyncHandler(async (req, res) => {
  const { minRating } = req.query
  return listProducts(req, res, { minRating })
})

export const getProductsCount = asyncHandler(async (req, res) => {
  const total = await Product.countDocuments()
  return res
    .status(200)
    .json(new ApiResponse(200, { total }, 'Products count fetched successfully'))
})

export const getAllFeaturedProducts = asyncHandler(async (req, res) => {
  return listProducts(req, res, { featured: true })
})

export const uploadProductImages = asyncHandler(async (req, res) => {
  const productId = req.body.productId || req.query.productId
  if (!productId) {
    await cleanupTempFiles(req.files)
    throw new ApiError(400, 'productId is required')
  }
  validateObjectId(productId, 'Invalid product id')

  if (!req.files || req.files.length === 0) {
    throw new ApiError(400, 'No files uploaded')
  }

  const product = await Product.findById(productId)
  if (!product) {
    await cleanupTempFiles(req.files)
    throw new ApiError(404, 'Product not found')
  }

  let uploadedImages = []
  try {
    for (const file of req.files) {
      const result = await uploadOnCloudinary(file.path, 'products')
      if (result?.secure_url) uploadedImages.push(result.secure_url)
    }
  } catch (error) {
    throw new ApiError(500, 'Failed to upload images to Cloudinary')
  } finally {
    await cleanupTempFiles(req.files)
  }

  if (uploadedImages.length === 0) {
    throw new ApiError(500, 'Image upload failed')
  }

  product.images = [...(product.images || []), ...uploadedImages]
  await product.save()

  return res
    .status(200)
    .json(new ApiResponse(200, product, 'Images uploaded successfully'))
})

export const deleteProductImage = asyncHandler(async (req, res) => {
  const productId = req.body.productId || req.query.productId
  const imageUrl = req.body.imageUrl || req.query.imageUrl

  if (!productId || !imageUrl) {
    throw new ApiError(400, 'productId and imageUrl are required')
  }
  validateObjectId(productId, 'Invalid product id')

  const product = await Product.findById(productId)
  if (!product) {
    throw new ApiError(404, 'Product not found')
  }

  if (!product.images || product.images.length === 0) {
    throw new ApiError(400, 'Product has no images')
  }

  if (!product.images.includes(imageUrl)) {
    throw new ApiError(404, 'Image not found in this product')
  }

  if (product.images.length <= 1) {
    throw new ApiError(400, 'Cannot delete the last image of a product')
  }

  const publicId = getPublicIdFromUrl(imageUrl)
  if (publicId) await deleteFromCloudinary(publicId, 'products')

  product.images = product.images.filter((img) => img !== imageUrl)
  await product.save()

  return res
    .status(200)
    .json(new ApiResponse(200, product, 'Image deleted successfully'))
})
