import { Module } from '@nestjs/common';
import { NotificationGateway } from './notification.gateway';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationListener } from './notification.listener';
import { Notification } from './notification.entity';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification]),
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_ACCESS_SECRET,
        signOptions: {
          // Thêm "as any" ở đây để báo với TypeScript rằng: "Tôi biết tôi đang làm gì, cứ cho qua đi"
          expiresIn: (process.env.JWT_ACCESS_EXPIRES_IN || '15m') as any,
        },
      }),
    }),
  ],
  controllers: [NotificationController],
  providers: [NotificationGateway, NotificationListener, NotificationService],
  exports: [NotificationGateway], // BẮT BUỘC PHẢI CÓ DÒNG NÀY
})
export class NotificationModule {}
