// src/lib/cloudinary.ts
/* ─────────────────────────────────────────────────────────────
  lib: cloudinary helper
  - upload image from express-fileupload
  - destroy by public_id
─────────────────────────────────────────────────────────────── */
import { v2 as cloudinary } from "cloudinary";
import { UploadedFile } from "express-fileupload";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

type UploadOptions = {
  folder: string;
  public_id?: string;
};

export const uploadFileToCloudinary = async (
  file: UploadedFile,
  options: UploadOptions,
) => {
  const base64 = `data:${file.mimetype};base64,${file.data.toString("base64")}`;

  return cloudinary.uploader.upload(base64, {
    folder: options.folder,
    public_id: options.public_id,
    resource_type: "image",
  });
};

export const deleteCloudinaryAsset = async (publicId?: string) => {
  if (!publicId) return null;

  return cloudinary.uploader.destroy(publicId, {
    resource_type: "image",
  });
};
