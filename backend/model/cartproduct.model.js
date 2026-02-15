import mongoose from 'mongoose'

const cartProductSchema = mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      default: 1
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  { timestamps: true }
)
cartProductSchema.index({ userId: 1, productId: 1 }, { unique: true })
cartProductSchema.index({ userId: 1 })
const cartProductModel = mongoose.model('cartProduct', cartProductSchema)
export default cartProductModel
