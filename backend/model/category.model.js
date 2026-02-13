import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    images:[
        {
            type: String,
            required: true
        }
    ],
    parentCategoryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
        default: null
    },
    ParentCategoryName:{
        type: String,
        default: ''
    }
},{ timestamps: true});

const Category = mongoose.model('Category', categorySchema);

export default Category;
