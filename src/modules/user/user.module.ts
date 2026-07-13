import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { User } from './user.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OtpVerification } from '../transaction/entities/otp-verification.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { MailModule } from '../mail/mail.module';
import { UserHistory } from './entities/user-history.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      OtpVerification,
      RefreshToken,
      UserHistory,
    ]),
    CloudinaryModule, // Import module chứa CloudinaryService
    MailModule, // Import module chứa MailService
  ],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
