import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

cloudinary.config({
  cloud_name: process.env.cloudinary_Config_Cloud_name,
  api_key: process.env.cloudinary_Config_API_Key,
  api_secret: process.env.cloudinary_Config_API_Secret,
});

const uploadOnCloudinary = async (localFilePath, folder = "categories") => {
  try {
    if (!localFilePath) return null;
    const response = await cloudinary.uploader.upload(localFilePath, {
      folder: folder,
      resource_type: "auto",
      public_id: `category_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    });
    fs.unlinkSync(localFilePath);
    return response;
  } catch (error) {
    if (fs.existsSync(localFilePath)) {
      fs.unlinkSync(localFilePath);
    }
    return null;
  }
};

const deleteFromCloudinary = async (publicId, folder = "categories") => {
  try {
    if (!publicId) return null;
    const response = await cloudinary.uploader.destroy(`${folder}/${publicId}`);
    return response;
  } catch (error) {
    console.error("Cloudinary delete error:", error);
    return null;
  }
};

const getPublicIdFromUrl = (url) => {
  if (!url) return null;
  const parts = url.split("/");
  const fileName = parts.pop();
  const publicId = fileName.split(".")[0];
  return publicId;
};

export { uploadOnCloudinary, deleteFromCloudinary, getPublicIdFromUrl };
