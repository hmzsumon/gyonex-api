import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import { Request } from 'express';
import { AppError } from './error.middleware';

const createStorage = (folder: string) =>
  multer.diskStorage({
    destination: (_req: Request, _file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
      cb(null, path.join(process.cwd(), 'uploads', folder));
    },
    filename: (_req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
      const ext  = path.extname(file.originalname).toLowerCase();
      const name = crypto.randomBytes(16).toString('hex');
      cb(null, `${name}${ext}`);
    },
  });

const imageFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb:   multer.FileFilterCallback,
) => {
  const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
  const ext     = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new AppError('Only image files are allowed (jpg, jpeg, png, webp, gif)', 400) as unknown as null, false);
  }
};

export const uploadKYC = multer({
  storage:    createStorage('kyc'),
  fileFilter: imageFilter,
  limits:     { fileSize: 5 * 1024 * 1024 }, // 5MB
});

export const uploadRankImage = multer({
  storage:    createStorage('ranks'),
  fileFilter: imageFilter,
  limits:     { fileSize: 10 * 1024 * 1024 }, // 10MB
});

export const uploadAvatar = multer({
  storage:    createStorage('avatars'),
  fileFilter: imageFilter,
  limits:     { fileSize: 2 * 1024 * 1024 }, // 2MB
});

export const uploadP2P = multer({
  storage:    createStorage('p2p'),
  fileFilter: imageFilter,
  limits:     { fileSize: 5 * 1024 * 1024 },
});

export const uploadLoan = multer({
  storage:    createStorage('loans'),
  fileFilter: imageFilter,
  limits:     { fileSize: 8 * 1024 * 1024 }, // 8MB
});

export const getFileUrl = (folder: string, filename: string): string => {
  const baseUrl = process.env.API_URL || 'http://localhost:5000';
  return `${baseUrl}/uploads/${folder}/${filename}`;
};