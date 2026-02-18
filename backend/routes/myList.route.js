import { Router } from 'express'
import { protectedRoute } from '../middleware/auth.middleware.js'
import {
  addMyListController,
  deleteMyListController,
  getMyListController
} from '../controllers/myList.controller.js'

const router = Router()

router.post('/add', protectedRoute, addMyListController)
router.get('/', protectedRoute, getMyListController)
router.delete('/:myListItemId', protectedRoute, deleteMyListController)

export default router
