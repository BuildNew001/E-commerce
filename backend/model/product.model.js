import mongoose from 'mongoose'

const ProductSchema = mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },
        description: {
            type: String,
            required: true,
            trim: true
        },
        images: {
            type: [String],
            validate: {
                validator: (value) => Array.isArray(value) && value.length > 0,
                message: 'At least one image is required'
            }
        },
        brand: {
            type: String,
            default: '',
            trim: true
        },
        price: {
            type: Number,
            required: true,
            min: 0
        },
        oldPrice: {
            type: Number,
            min: 0,
            validate: {
                validator: function (value) {
                    if (value === undefined || value === null) return true
                    return value >= this.price
                },
                message: 'oldPrice must be greater than or equal to price'
            }
        },
        category: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Category',
            required: true
        },
        countInstock: {
            type: Number,
            required: true,
            min: 0
        },
        rating: {
            type: Number,
            default: 0,
            min: 0,
            max: 5
        },
        numReviews: {
            type: Number,
            default: 0,
            min: 0
        },
        isfeatured: {
            type: Boolean,
            default: false
        },
        discount: {
            type: Number,
            default: 0,
            min: 0,
            max: 100
        },
        productRam: {
            type: [String],
            validate: {
                validator: (value) => value == null || value.length > 0,
                message: 'productRam must include at least one value'
            }
        },
        size: {
            type: [String],
            validate: {
                validator: (value) => value == null || value.length > 0,
                message: 'size must include at least one value'
            }
        },
        productWeight: {
            type: [String],
            validate: {
                validator: (value) => value == null || value.length > 0,
                message: 'productWeight must include at least one value'
            }
        },
        dateCreated: {
            type: Date,
            default: Date.now
        }
    },
    { timestamps: true }
)

ProductSchema.index({ name: 'text', description: 'text' })
ProductSchema.index({ category: 1, price: 1 })

const Product = mongoose.model('Product', ProductSchema)
export default Product