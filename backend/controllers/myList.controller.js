import mongoose from 'mongoose'
import MyList from '../model/mylist.model.js'
import Product from '../model/product.model.js'
import { ApiError } from '../utils/ApiError.js'
import { ApiResponse } from '../utils/ApiResponse.js'
import { asyncHandler } from '../utils/asyncHandler.js'

export const addMyListController = asyncHandler(async (req, res) => {
  const { productId } = req.body

  if (!mongoose.isValidObjectId(productId)) {
    throw new ApiError(400, 'Invalid product id')
  }

  const product = await Product.findById(productId).select('_id')
  if (!product) {
    throw new ApiError(404, 'Product not found')
  }

  const existingItem = await MyList.findOne({
    userId: req.user._id,
    productId
  })

  if (existingItem) {
    return res
      .status(200)
      .json(new ApiResponse(200, existingItem, 'Item already in my list'))
  }

  try {
    const myListItem = await MyList.create({
      userId: req.user._id,
      productId
    })

    return res
      .status(201)
      .json(new ApiResponse(201, myListItem, 'Item added to my list'))
  } catch (error) {
    if (error?.code === 11000) {
      const conflictItem = await MyList.findOne({
        userId: req.user._id,
        productId
      })

      if (conflictItem) {
        return res
          .status(200)
          .json(new ApiResponse(200, conflictItem, 'Item already in my list'))
      }

      throw new ApiError(409, 'Item already in my list')
    }

    throw new ApiError(500, 'Failed to add item to my list')
  }
})

export const deleteMyListController = asyncHandler(async (req, res) => {
  const { myListItemId } = req.params

  if (!mongoose.isValidObjectId(myListItemId)) {
    throw new ApiError(400, 'Invalid my list item id')
  }

  const deletedItem = await MyList.findOneAndDelete({
    _id: myListItemId,
    userId: req.user._id
  })

  if (!deletedItem) {
    throw new ApiError(404, 'My list item not found')
  }

  return res
    .status(200)
    .json(new ApiResponse(200, deletedItem, 'Item removed from my list'))
})

export const getMyListController = asyncHandler(async (req, res) => {
  const myListItems = await MyList.find({ userId: req.user._id })
    .populate('productId', 'name price images countInstock')
    .sort({ createdAt: -1 })
    .lean()

  return res
    .status(200)
    .json(new ApiResponse(200, myListItems, 'My list fetched successfully'))
})
