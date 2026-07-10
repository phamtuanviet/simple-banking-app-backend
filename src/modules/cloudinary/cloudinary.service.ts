import { Injectable } from '@nestjs/common';
import {
  v2 as cloudinary,
  UploadApiResponse,
  UploadApiErrorResponse,
} from 'cloudinary';
import * as streamifier from 'streamifier';

@Injectable()
export class CloudinaryService {
  uploadFile(
    file: Express.Multer.File,
  ): Promise<UploadApiResponse | UploadApiErrorResponse> {
    return new Promise((resolve, reject) => {
      // Đẩy ảnh vào thư mục 'simple_banking_avatars' trên Cloudinary cho gọn
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: 'simple_banking_avatars' },
        (error, result) => {
          if (error) return reject(error);
          if (result) {
            resolve(result);
          } else {
            // Trường hợp này cực hiếm nhưng cần thiết để làm hài lòng TypeScript
            reject(new Error('Cloudinary upload failed: No result returned'));
          }
        },
      );

      // Chuyển buffer nhận được từ request thành stream và đẩy lên Cloudinary
      streamifier.createReadStream(file.buffer).pipe(uploadStream);
    });
  }

  async deleteFile(publicId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      cloudinary.uploader.destroy(publicId, (error, result) => {
        if (error) return reject(error);
        resolve(result);
      });
    });
  }
}
