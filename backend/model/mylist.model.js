import mongoose from 'mongoose'

const myListSchema = mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  { timestamps: true }
)

myListSchema.index({ userId: 1, productId: 1 }, { unique: true })
myListSchema.index({ userId: 1 })

const MyList = mongoose.model('MyList', myListSchema)

export default MyList
