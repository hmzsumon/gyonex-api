// src/controllers/kyc.controller.ts
import {
  deleteCloudinaryAsset,
  uploadFileToCloudinary,
} from "@/lib/cloudinary";
import { AdminNotification } from "@/models/AdminNotification.model";
import { Notification } from "@/models/Notification.model";
import Kyc from "@/models/kyc.model";
import { User } from "@/models/user.model";
import { sendEmail } from "@/services/email/emailService";
import { kycStatusTemplate } from "@/services/email/templates/kycStatusTemplate";
import { typeHandler } from "@/types/express";
import { ApiError } from "@/utils/ApiError";
import { catchAsync } from "@/utils/catchAsync";
import { UploadedFile } from "express-fileupload";

/* ── helper: get/create kyc ───────────────────────────────── */
const getOrCreateKyc = async (userId: string) => {
  let kyc = await Kyc.findOne({ user: userId });

  if (!kyc) {
    kyc = await Kyc.create({
      user: userId,
      status: "draft",
    });
  }

  return kyc;
};

/* ── helper: notify all admins ────────────────────────────── */
const notifyAdminsForKycRequest = async (user: any, kyc: any) => {
  const adminNotification = await AdminNotification.create({
    title: "New KYC Request",
    category: "kyc",
    message: `${user.name || "A user"} submitted a KYC request.`,
    url: `/kyc/${String(kyc._id)}`,
  });

  if ((global as any).io) {
    (global as any).io.emit("admin-notification", {
      success: true,
      message: "New KYC Request",
      notification: adminNotification,
    });
  }
};

/* ── helper: notify one user ──────────────────────────────── */
const notifyUserKycStatus = async ({
  user,
  title,
  message,
  url,
}: {
  user: any;
  title: string;
  message: string;
  url?: string;
}) => {
  const notification = await Notification.create({
    user_id: user._id,
    role: user.role,
    category: "kyc",
    title,
    message,
    url: url || "/settings/profile",
  });

  if ((global as any).io) {
    (global as any).io
      .to(String(user._id))
      .emit("notifications:new", notification);

    const unread = await Notification.countDocuments({
      user_id: user._id,
      is_read: false,
    });

    (global as any).io
      .to(String(user._id))
      .emit("notifications:count", { count: unread });

    (global as any).io.to(String(user._id)).emit("user-notification", {
      success: true,
      message,
      notification,
    });
  }
};

/* ────────── user: get my kyc ────────── */
export const getMyKyc: typeHandler = catchAsync(async (req, res, next) => {
  const userId = String(req.user?._id || "");
  if (!userId) return next(new ApiError(401, "User not authenticated"));

  const kyc = await Kyc.findOne({ user: userId });

  res.status(200).json({
    success: true,
    kyc,
  });
});

/* ────────── user: save kyc profile ────────── */
export const saveKycProfile: typeHandler = catchAsync(
  async (req, res, next) => {
    const userId = String(req.user?._id || "");
    if (!userId) return next(new ApiError(401, "User not authenticated"));

    const {
      firstName,
      lastName,
      dateOfBirth,
      countryOfBirth,
      gender,
      residentialAddress,
    } = req.body;

    if (
      !firstName ||
      !lastName ||
      !dateOfBirth ||
      !countryOfBirth ||
      !gender ||
      !residentialAddress
    ) {
      return next(
        new ApiError(400, "Please provide all required KYC profile fields"),
      );
    }

    const user = await User.findById(userId);
    if (!user) return next(new ApiError(404, "User not found"));

    const kyc = await getOrCreateKyc(userId);

    kyc.first_name = String(firstName).trim();
    kyc.last_name = String(lastName).trim();
    kyc.date_of_birth = String(dateOfBirth).trim();
    kyc.country_of_birth = String(countryOfBirth).trim();
    kyc.gender = String(gender).trim();
    kyc.residential_address = String(residentialAddress).trim();

    if (kyc.status !== "approved" && kyc.status !== "pending") {
      kyc.status = "draft";
    }

    await kyc.save();

    user.kyc_id = kyc._id as any;
    user.kyc_step = 1;
    user.name = `${String(firstName).trim()} ${String(lastName).trim()}`.trim();

    if (!user.country) {
      user.country = String(countryOfBirth).trim();
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: "KYC profile saved successfully",
      kyc,
    });
  },
);

/* ────────── user: submit kyc documents ────────── */
export const submitKycDocuments: typeHandler = catchAsync(
  async (req, res, next) => {
    const userId = String(req.user?._id || "");
    if (!userId) return next(new ApiError(401, "User not authenticated"));

    const { docType, issuingCountry } = req.body;

    const files = req.files as
      | {
          frontImage?: UploadedFile | UploadedFile[];
          backImage?: UploadedFile | UploadedFile[];
          selfieImage?: UploadedFile | UploadedFile[];
        }
      | undefined;

    const frontImageRaw = files?.frontImage;
    const backImageRaw = files?.backImage;
    const selfieImageRaw = files?.selfieImage;

    const frontImage = Array.isArray(frontImageRaw)
      ? frontImageRaw[0]
      : frontImageRaw;
    const backImage = Array.isArray(backImageRaw)
      ? backImageRaw[0]
      : backImageRaw;
    const selfieImage = Array.isArray(selfieImageRaw)
      ? selfieImageRaw[0]
      : selfieImageRaw;

    if (!docType || !issuingCountry) {
      return next(
        new ApiError(400, "Document type and issuing country are required"),
      );
    }

    if (!frontImage) {
      return next(new ApiError(400, "Front image is required"));
    }

    if (!selfieImage) {
      return next(new ApiError(400, "Selfie image is required"));
    }

    const user = await User.findById(userId);
    if (!user) return next(new ApiError(404, "User not found"));

    const kyc = await getOrCreateKyc(userId);

    if (
      !kyc.first_name ||
      !kyc.last_name ||
      !kyc.date_of_birth ||
      !kyc.country_of_birth ||
      !kyc.gender ||
      !kyc.residential_address
    ) {
      return next(new ApiError(400, "Please complete KYC profile first"));
    }

    /* ── old rejected assets থাকলে clear ───────────────────── */
    if (kyc.front_image_public_id) {
      await deleteCloudinaryAsset(kyc.front_image_public_id);
    }
    if (kyc.back_image_public_id) {
      await deleteCloudinaryAsset(kyc.back_image_public_id);
    }
    if (kyc.selfie_image_public_id) {
      await deleteCloudinaryAsset(kyc.selfie_image_public_id);
    }

    const frontUpload = await uploadFileToCloudinary(frontImage, {
      folder: "upbit/kyc/front",
      public_id: `kyc-front-${userId}-${Date.now()}`,
    });

    const selfieUpload = await uploadFileToCloudinary(selfieImage, {
      folder: "upbit/kyc/selfie",
      public_id: `kyc-selfie-${userId}-${Date.now()}`,
    });

    let backUpload: any = null;
    if (backImage) {
      backUpload = await uploadFileToCloudinary(backImage, {
        folder: "upbit/kyc/back",
        public_id: `kyc-back-${userId}-${Date.now()}`,
      });
    }

    kyc.document_type = String(docType).trim();
    kyc.issuing_country = String(issuingCountry).trim();

    kyc.front_image = frontUpload.secure_url;
    kyc.front_image_public_id = frontUpload.public_id;

    kyc.selfie_image = selfieUpload.secure_url;
    kyc.selfie_image_public_id = selfieUpload.public_id;

    kyc.back_image = backUpload?.secure_url || "";
    kyc.back_image_public_id = backUpload?.public_id || "";

    kyc.status = "pending";
    kyc.reject_reason = "";
    kyc.submitted_at = new Date();
    kyc.reviewed_at = null;
    kyc.approved_at = null;
    kyc.rejected_at = null;

    await kyc.save();

    user.kyc_id = kyc._id as any;
    user.kyc_request = true;
    user.kyc_verified = false;
    user.kyc_step = 2;
    await user.save();

    await notifyAdminsForKycRequest(user, kyc);

    res.status(200).json({
      success: true,
      message: "KYC documents submitted successfully",
      kyc,
    });
  },
);

/* ────────── admin: list kyc requests ────────── */
export const getAdminKycRequests: typeHandler = catchAsync(async (req, res) => {
  const status = String(req.query.status || "pending").trim();
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));

  const filter: any = {};
  if (status && status !== "all") {
    filter.status = status;
  }

  const [total, requests] = await Promise.all([
    Kyc.countDocuments(filter),
    Kyc.find(filter)
      .populate(
        "user",
        "name email phone customerId country kyc_verified kyc_request",
      )
      .sort({ submitted_at: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);

  res.status(200).json({
    success: true,
    requests,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    },
  });
});

/* ────────── admin: get single kyc request ────────── */
export const getAdminKycRequestById: typeHandler = catchAsync(
  async (req, res, next) => {
    const { id } = req.params;

    const kyc = await Kyc.findById(id).populate(
      "user",
      "name email phone customerId country kyc_verified kyc_request",
    );

    if (!kyc) {
      return next(new ApiError(404, "KYC request not found"));
    }

    res.status(200).json({
      success: true,
      kyc,
    });
  },
);

/* ────────── admin: approve kyc ────────── */
export const approveKycRequest: typeHandler = catchAsync(
  async (req, res, next) => {
    const { id } = req.params;

    const kyc = await Kyc.findById(id).populate("user");
    if (!kyc) {
      return next(new ApiError(404, "KYC request not found"));
    }

    const user = await User.findById(kyc.user);
    if (!user) {
      return next(new ApiError(404, "User not found"));
    }

    kyc.status = "approved";
    kyc.reject_reason = "";
    kyc.reviewed_at = new Date();
    kyc.approved_at = new Date();
    kyc.rejected_at = null;
    await kyc.save();

    user.kyc_id = kyc._id as any;
    user.kyc_request = false;
    user.kyc_verified = true;
    user.kyc_step = 3;
    await user.save();

    await notifyUserKycStatus({
      user,
      title: "KYC Approved",
      message: "Your KYC verification has been approved successfully.",
      url: "/settings/profile",
    });

    await sendEmail({
      email: user.email,
      subject: "KYC Approved - Capitalise GFX",
      html: kycStatusTemplate({
        name: user.name || "User",
        status: "approved",
      }),
    });

    res.status(200).json({
      success: true,
      message: "KYC approved successfully",
      kyc,
    });
  },
);

/* ────────── admin: reject kyc ────────── */
export const rejectKycRequest: typeHandler = catchAsync(
  async (req, res, next) => {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || String(reason).trim().length < 3) {
      return next(new ApiError(400, "Reject reason is required"));
    }

    const kyc = await Kyc.findById(id).populate("user");
    if (!kyc) {
      return next(new ApiError(404, "KYC request not found"));
    }

    const user = await User.findById(kyc.user);
    if (!user) {
      return next(new ApiError(404, "User not found"));
    }

    /* ── cloudinary assets delete ───────────────────────────── */
    if (kyc.front_image_public_id) {
      await deleteCloudinaryAsset(kyc.front_image_public_id);
    }
    if (kyc.back_image_public_id) {
      await deleteCloudinaryAsset(kyc.back_image_public_id);
    }
    if (kyc.selfie_image_public_id) {
      await deleteCloudinaryAsset(kyc.selfie_image_public_id);
    }

    kyc.front_image = "";
    kyc.front_image_public_id = "";
    kyc.back_image = "";
    kyc.back_image_public_id = "";
    kyc.selfie_image = "";
    kyc.selfie_image_public_id = "";

    kyc.status = "rejected";
    kyc.reject_reason = String(reason).trim();
    kyc.reviewed_at = new Date();
    kyc.rejected_at = new Date();
    kyc.approved_at = null;

    await kyc.save();

    user.kyc_id = kyc._id as any;
    user.kyc_request = false;
    user.kyc_verified = false;
    user.kyc_step = 1;
    await user.save();

    await notifyUserKycStatus({
      user,
      title: "KYC Rejected",
      message: `Your KYC request was rejected. Reason: ${String(reason).trim()}`,
      url: "/settings/profile",
    });

    await sendEmail({
      email: user.email,
      subject: "KYC Rejected - Capitalise GFX",
      html: kycStatusTemplate({
        name: user.name || "User",
        status: "rejected",
        reason: String(reason).trim(),
      }),
    });

    res.status(200).json({
      success: true,
      message: "KYC rejected successfully",
      kyc,
    });
  },
);
