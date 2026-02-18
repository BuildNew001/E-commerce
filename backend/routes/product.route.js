import { Router } from 'express'
import {
  createProduct,
  updateProduct,
  deleteProduct,
  getProduct,
  getAllProducts,
  getAllProductsByCatId,
  getAllProductsByCatName,
  getAllProductsByPrice,
  getAllProductsByRating,
  getProductsCount,
  getAllFeaturedProducts,
  uploadProductImages,
  deleteProductImage
} from '../controllers/product.controller.js'
import upload from '../middleware/multer.middleware.js'
import { protectedRoute, isAdmin } from '../middleware/auth.middleware.js'

const router = Router()

// Admin routes
router.post('/', protectedRoute, isAdmin, upload.array('images', 6), createProduct)
router.patch('/:id', protectedRoute, isAdmin, upload.array('images', 6), updateProduct)
router.post('/create', protectedRoute, isAdmin, upload.array('images', 6), createProduct)
router.put('/updateProduct/:id', protectedRoute, isAdmin, upload.array('images', 6), updateProduct)
router.delete('/:id', protectedRoute, isAdmin, deleteProduct)
router.post('/uploadImages', protectedRoute, isAdmin, upload.array('images', 6), uploadProductImages)
router.delete('/deleteImage', protectedRoute, isAdmin, deleteProductImage)

// Public routes
router.get('/', getAllProducts)
router.get('/getAllProducts', getAllProducts)
router.get('/getAllProductsByCatId/:id', getAllProductsByCatId)
router.get('/getAllProductsByCatName', getAllProductsByCatName)
router.get('/getAllProductsByPrice', getAllProductsByPrice)
router.get('/getAllProductsByRating', getAllProductsByRating)
router.get('/getAllProductsCount', getProductsCount)
router.get('/getAllFeaturedProducts', getAllFeaturedProducts)
router.get('/:id', getProduct)

export default router
