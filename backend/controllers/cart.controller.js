import mongoose from 'mongoose'
import CartProduct from '../model/cartproduct.model.js'
import Product from '../model/product.model.js'
import User from '../model/user.model.js'
import { ApiError } from '../utils/ApiError.js'
import { ApiResponse } from '../utils/ApiResponse.js'
import { asyncHandler } from '../utils/asyncHandler.js'

const normalizeQuantity = (value) => {
  const quantity = Number(value)
  if (!Number.isFinite(quantity)) return null
  return Math.floor(quantity)
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

export const addToCartItemController = asyncHandler(async (req, res) => {
  const { productId, quantity } = req.body
  const normalizedQuantity = normalizeQuantity(quantity) ?? 1
  if (!mongoose.isValidObjectId(productId)) {
    throw new ApiError(400, 'Invalid product id')
  }
  if (!normalizedQuantity || normalizedQuantity < 1) {
    throw new ApiError(400, 'Quantity must be at least 1')
  }
  const product = await Product.findById(productId).select('countInstock')
  if (!product) {
    throw new ApiError(404, 'Product not found')
  }

  const existingCartItem = await CartProduct.findOne({
    userId: req.user._id,
    productId
  })

  if (existingCartItem) {
    const updatedQuantity = existingCartItem.quantity + normalizedQuantity
    if (updatedQuantity > product.countInstock) {
      throw new ApiError(400, 'Requested quantity exceeds available stock')
    }
    existingCartItem.quantity = updatedQuantity
    await existingCartItem.save()
    return res
      .status(200)
      .json(new ApiResponse(200, existingCartItem, 'Cart item quantity updated'))
  }
  if (normalizedQuantity > product.countInstock) {
    throw new ApiError(400, 'Requested quantity exceeds available stock')
  }
  try {
    const cartItem = await CartProduct.create({
      userId: req.user._id,
      productId,
      quantity: normalizedQuantity
    })

    await User.findByIdAndUpdate(req.user._id, {
      $addToSet: { shopping_cart: cartItem._id }
    })

    return res
      .status(201)
      .json(new ApiResponse(201, cartItem, 'Item added to cart'))
  } catch (error) {
    if (error?.code === 11000) {
      const conflictItem = await CartProduct.findOne({
        userId: req.user._id,
        productId
      })

      if (!conflictItem) {
        throw new ApiError(409, 'Cart item already exists')
      }

      const updatedQuantity = conflictItem.quantity + normalizedQuantity
      if (updatedQuantity > product.countInstock) {
        throw new ApiError(400, 'Requested quantity exceeds available stock')
      }

      conflictItem.quantity = updatedQuantity
      await conflictItem.save()

      return res
        .status(200)
        .json(new ApiResponse(200, conflictItem, 'Cart item quantity updated'))
    }

    throw new ApiError(500, 'Failed to add item to cart')
  }
})

export const getCartItemController = asyncHandler(async (req, res) => {
  const { pageNumber, limitNumber } = parsePagination(req.query.page, req.query.limit)
  const sortKey = req.query.sort
  const cursorValue = req.query.cursor
  const baseQuery = { userId: req.user._id }

  if (cursorValue) {
    if (sortKey && sortKey !== 'oldest') {
      throw new ApiError(400, 'Cursor pagination supports only newest or oldest sorting')
    }
    const cursor = decodeCursor(cursorValue)
    const cursorFilter = buildCursorFilter(cursor, sortKey)
    const finalQuery = combineQuery(baseQuery, cursorFilter)
    const cursorSort = sortKey === 'oldest' ? { createdAt: 1, _id: 1 } : { createdAt: -1, _id: -1 }

    const cartItems = await CartProduct.find(finalQuery)
      .populate('productId', 'name price images countInstock')
      .sort(cursorSort)
      .limit(limitNumber + 1)
      .lean()

    const hasNextPage = cartItems.length > limitNumber
    if (hasNextPage) cartItems.pop()

    const nextCursor = hasNextPage ? encodeCursor(cartItems[cartItems.length - 1]) : null

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          cartItems,
          pagination: {
            mode: 'cursor',
            limit: limitNumber,
            nextCursor,
            hasNextPage
          }
        },
        'Cart items fetched successfully'
      )
    )
  }

  const skip = (pageNumber - 1) * limitNumber

  const [cartItems, total] = await Promise.all([
    CartProduct.find(baseQuery)
      .populate('productId', 'name price images countInstock')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNumber)
      .lean(),
    CartProduct.countDocuments(baseQuery)
  ])

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        cartItems,
        pagination: {
          mode: 'offset',
          total,
          page: pageNumber,
          limit: limitNumber,
          totalPages: Math.ceil(total / limitNumber)
        }
      },
      'Cart items fetched successfully'
    )
  )
})

export const updateCartItemQuantityController = asyncHandler(async (req, res) => {
  const { cartItemId } = req.params
  const { quantity } = req.body
  const normalizedQuantity = normalizeQuantity(quantity)

  if (!mongoose.isValidObjectId(cartItemId)) {
    throw new ApiError(400, 'Invalid cart item id')
  }
  if (!normalizedQuantity || normalizedQuantity < 1) {
    throw new ApiError(400, 'Quantity must be at least 1')
  }

  const cartItem = await CartProduct.findOne({
    _id: cartItemId,
    userId: req.user._id
  })

  if (!cartItem) {
    throw new ApiError(404, 'Cart item not found')
  }

  const product = await Product.findById(cartItem.productId).select('countInstock')
  if (!product) {
    throw new ApiError(404, 'Product not found')
  }
  if (normalizedQuantity > product.countInstock) {
    throw new ApiError(400, 'Requested quantity exceeds available stock')
  }

  cartItem.quantity = normalizedQuantity
  await cartItem.save()

  return res
    .status(200)
    .json(new ApiResponse(200, cartItem, 'Cart item quantity updated'))
})

export const deleteCartItemQuantityController = asyncHandler(async (req, res) => {
  const { cartItemId } = req.params

  if (!mongoose.isValidObjectId(cartItemId)) {
    throw new ApiError(400, 'Invalid cart item id')
  }

  const cartItem = await CartProduct.findOneAndDelete({
    _id: cartItemId,
    userId: req.user._id
  })

  if (!cartItem) {
    throw new ApiError(404, 'Cart item not found')
  }

  await User.findByIdAndUpdate(req.user._id, {
    $pull: { shopping_cart: cartItem._id }
  })

  return res
    .status(200)
    .json(new ApiResponse(200, cartItem, 'Cart item removed'))
})

export const clearCartController = asyncHandler(async (req, res) => {
  const result = await CartProduct.deleteMany({ userId: req.user._id })

  await User.findByIdAndUpdate(req.user._id, {
    $set: { shopping_cart: [] }
  })

  return res
    .status(200)
    .json(
      new ApiResponse(200, { deletedCount: result.deletedCount }, 'Cart cleared')
    )
})
