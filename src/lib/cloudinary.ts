// src/lib/cloudinary.ts
/* ─────────────────────────────────────────────────────────────
  lib: cloudinary / local upload helper
  - Cloudinary ENV থাকলে Cloudinary তে upload হবে
  - Local/dev এ Cloudinary ENV না থাকলে uploads/kyc ফোল্ডারে save হবে
  - KYC submit যেন Internal Server Error এ আটকে না থাকে
─────────────────────────────────────────────────────────────── */
import { v2 as cloudinary } from "cloudinary";
import { UploadedFile } from "express-fileupload";
import fs from "fs/promises";
import path from "path";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

type UploadOptions = {
  folder: string;
  public_id?: string;
};

type UploadResult = {
  secure_url: string;
  public_id: string;
};

/* ── Cloudinary ENV check ─────────────────────────────────── */
const isCloudinaryReady = () =>
  Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET,
  );

/* ── API base url for local fallback image url ────────────── */
const getApiBaseUrl = () => {
  const raw =
    process.env.API_URL ||
    process.env.SERVER_URL ||
    `http://localhost:${process.env.PORT || 5000}`;

  return raw.replace(/\/$/, "");
};

/* ── file extension resolve ───────────────────────────────── */
const getFileExtension = (file: UploadedFile) => {
  const byName = path.extname(file.name || "").toLowerCase();
  if (byName) return byName;

  if (file.mimetype === "image/png") return ".png";
  if (file.mimetype === "image/webp") return ".webp";
  return ".jpg";
};

/* ── local fallback upload ────────────────────────────────── */
const uploadFileToLocal = async (
  file: UploadedFile,
  options: UploadOptions,
): Promise<UploadResult> => {
  const safeFolder = options.folder.replace(/^\/+|\.\./g, "");
  const uploadDir = path.join(process.cwd(), "uploads", safeFolder);
  await fs.mkdir(uploadDir, { recursive: true });

  const filename = `${options.public_id || `kyc-${Date.now()}`}${getFileExtension(file)}`;
  const filepath = path.join(uploadDir, filename);

  await fs.writeFile(filepath, file.data);

  return {
    secure_url: `${getApiBaseUrl()}/uploads/${safeFolder}/${filename}`,
    public_id: `local:${safeFolder}/${filename}`,
  };
};

/* ── upload image ─────────────────────────────────────────── */
export const uploadFileToCloudinary = async (
  file: UploadedFile,
  options: UploadOptions,
): Promise<UploadResult> => {
  if (!file?.data || !file?.mimetype?.startsWith("image/")) {
    throw new Error("Invalid image file. Please upload a valid image.");
  }

  /* Local/dev fallback: env না থাকলে submit fail করবে না */
  if (!isCloudinaryReady()) {
    console.warn(
      "[KYC_UPLOAD] Cloudinary env missing. Saving image locally in uploads folder.",
    );
    return uploadFileToLocal(file, options);
  }

  try {
    const base64 = `data:${file.mimetype};base64,${file.data.toString("base64")}`;

    const result = await cloudinary.uploader.upload(base64, {
      folder: options.folder,
      public_id: options.public_id,
      resource_type: "image",
    });

    return {
      secure_url: result.secure_url,
      public_id: result.public_id,
    };
  } catch (error: any) {
    console.error(
      "[KYC_UPLOAD] Cloudinary upload failed:",
      error?.message || error,
    );

    /* Cloudinary issue হলে local fallback দিয়ে KYC submit complete করা হবে */
    return uploadFileToLocal(file, options);
  }
};

/* ── delete image ─────────────────────────────────────────── */
export const deleteCloudinaryAsset = async (publicId?: string) => {
  if (!publicId) return null;

  try {
    if (publicId.startsWith("local:")) {
      const relativePath = publicId.replace("local:", "");
      const filepath = path.join(process.cwd(), "uploads", relativePath);
      await fs.unlink(filepath).catch(() => null);
      return null;
    }

    if (!isCloudinaryReady()) return null;

    return cloudinary.uploader.destroy(publicId, {
      resource_type: "image",
    });
  } catch (error: any) {
    console.warn("[KYC_UPLOAD] Delete asset failed:", error?.message || error);
    return null;
  }
};
