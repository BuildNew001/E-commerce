import mongoose from 'mongoose'

const ordersSchema = mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    orderId: {
      type: String,
      unique: true,
      required: true
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    product_details: {
      name: String,
      image: Array
    },
    payment_Id: {
      type: String,
      required: true
    },
    payment_status: {
      type: String,
      required: true
    },
    delivery_address: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Address',
      required: true
    },
    subTotal: {
      type: Number,
      required: true
    },
    total: {
      type: Number,
      required: true
    },
    invoice_receipt: {
      type: String,
      required: true
    }
  },
  { timestamps: true }
)
const ordersModel = mongoose.model('Order', ordersSchema)
export default ordersModel