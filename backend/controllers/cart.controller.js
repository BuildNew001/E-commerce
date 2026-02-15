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
  const cartItems = await CartProduct.find({ userId: req.user._id })
    .populate('productId', 'name price images countInstock')
    .sort({ createdAt: -1 })
    .lean()

  return res
    .status(200)
    .json(new ApiResponse(200, cartItems, 'Cart items fetched successfully'))
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
