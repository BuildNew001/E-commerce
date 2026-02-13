import mongoose from 'mongoose'
import bycrypt from 'bcryptjs'
import crypto from 'crypto'
import { type } from 'os'
const userSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true
    },
    password: {
      type: String,
      required: true,
      minlength: 6
    },
    email: {
      type: String,
      required: true,
      unique: true
    },
    mobile_number: {
      type: Number,
      default:null
    },
    isEmailVerified: {
      type: Boolean,
      default: false
    },
    emailVerificationToken: {
      type: String
    },
    emailVerificationTokenExpires: {
      type: Date
    },
    passwordResetToken: {
      type: String
    },
    passwordResetTokenExpires: {
      type: Date
    },
    avatar: {
      type: String,
      default: ''
    },
    address_details: [
      {
        type: mongoose.Schema.ObjectId,
        ref: 'Address'
      }
    ],
    orderHistory: [
      {
        type: mongoose.Schema.ObjectId,
        ref: 'Order'
      }
    ],
    shopping_cart: [
      {
        type: mongoose.Schema.ObjectId,
        ref: 'cartProduct'
      }
    ],
    status: {
      type: String,
      enum: ['active','Suspended'],
      default: 'active'
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user'
    },
    refreshToken: {
      type: String
    }
  },
  { timestamps: true }
)
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return
  const salt = await bycrypt.genSalt(10)
  this.password = await bycrypt.hash(this.password, salt)
})
userSchema.methods.isPasswordMatched = async function (enteredPassword) {
  return await bycrypt.compare(enteredPassword, this.password)
}
userSchema.methods.createEmailVerificationToken = function () {
  const verificationToken = crypto.randomBytes(32).toString('hex')
  this.emailVerificationToken = crypto
    .createHash('sha256')
    .update(verificationToken)
    .digest('hex')
  this.emailVerificationTokenExpires = Date.now() + 10 * 60 * 1000
  return verificationToken
}
userSchema.methods.createPasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString('hex')
  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex')
  this.passwordResetTokenExpires = Date.now() + 10 * 60 * 1000
  return resetToken
}
const User = mongoose.model('User', userSchema)
export default User
