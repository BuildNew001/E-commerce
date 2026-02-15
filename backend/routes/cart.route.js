import { Router } from 'express'
import { protectedRoute } from '../middleware/auth.middleware.js'
import {
  addToCartItemController,
  clearCartController,
  getCartItemController,
  updateCartItemQuantityController,
  deleteCartItemQuantityController
} from '../controllers/cart.controller.js'

const router = Router()

router.post('/add', protectedRoute, addToCartItemController)
router.get('/', protectedRoute, getCartItemController)
router.delete('/', protectedRoute, clearCartController)
router.put('/:cartItemId', protectedRoute, updateCartItemQuantityController)
router.delete('/:cartItemId', protectedRoute, deleteCartItemQuantityController)

export default router
