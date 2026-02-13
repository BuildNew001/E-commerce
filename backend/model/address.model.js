import mongoose from 'mongoose'

const addressSchema = mongoose.Schema(
  {
    address_line: {
      type: String,
      required: true
    },
    city: {
      type: String,
      required: true
    },
    state: {
      type: String,
      required: true
    },
    country: {
      type: String,
      required: true
    },
    pincode: {
      type: Number,
      required: true
    },
    mobile: {
      type: Number,
      required: true
    },
    status: {
      type: Boolean,
      default: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      default: ''
    }
  },
  { timestamps: true }
)
const AddressModel = mongoose.model('Address', addressSchema)
export default AddressModel
