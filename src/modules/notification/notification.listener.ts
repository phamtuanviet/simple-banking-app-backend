import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationGateway } from './notification.gateway';
import { Notification, NotificationStatus } from './notification.entity';

@Injectable()
export class NotificationListener {
  // Sử dụng Logger của NestJS để ghi log chuyên nghiệp hơn console.log
  private readonly logger = new Logger(NotificationListener.name);

  constructor(
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
    private notificationGateway: NotificationGateway,
  ) {}

  // Đặt async: true để quá trình lắng nghe chạy trên một luồng tách biệt,
  // không chặn (block) luồng xử lý chính của ứng dụng.
  @OnEvent('notification.created', { async: true })
  async handleNotificationCreatedEvent(payload: {
    notificationId: string;
    userId: string;
  }) {
    try {
      // 1. Lấy thông tin chi tiết của thông báo vừa được lưu ở Transaction
      const notification = await this.notificationRepository.findOne({
        where: { id: payload.notificationId },
      });

      if (!notification) {
        this.logger.warn(
          `Không tìm thấy thông báo với ID: ${payload.notificationId}`,
        );
        return;
      }

      // 2. Gói gọn dữ liệu gửi xuống Frontend (đủ thông tin để vẽ UI ngay lập tức)
      const socketPayload = {
        id: notification.id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        amount: notification.amount
          ? parseFloat(notification.amount.toString())
          : null,
        balanceAfterTransaction: notification.balanceAfterTransaction
          ? parseFloat(notification.balanceAfterTransaction.toString())
          : null,
        isRead: notification.isRead,
        createdAt: notification.createdAt,
        // Dùng transactionId để Frontend làm link điều hướng nếu cần
        transactionId: notification.transaction?.id,
      };

      // 3. Đẩy thông báo qua Socket.io (chỉ gửi tới đúng phòng của User đó)
      this.notificationGateway.notifyUser(
        payload.userId,
        'new_notification', // Đổi tên event thành chuẩn để Frontend dễ hứng
        socketPayload,
      );

      // 4. Nếu đẩy thành công, cập nhật trạng thái trong DB thành SENT
      await this.notificationRepository.update(notification.id, {
        status: NotificationStatus.SENT,
      });

      this.logger.log(
        `Đã gửi thông báo Socket thành công cho User ID: ${payload.userId}`,
      );
    } catch (error) {
      // Bắt mọi lỗi liên quan đến mạng mẽo của Socket
      this.logger.error(
        `Lỗi gửi thông báo Socket cho User ID ${payload.userId}:`,
        error,
      );

      // QUAN TRỌNG: Chúng ta KHÔNG ném lỗi (throw error) ở đây.
      // Việc không cập nhật trạng thái sẽ giữ thông báo ở mức PENDING.
      // Cron Job sẽ tự động quét và thử gửi lại vào chu kỳ tiếp theo!
    }
  }
}
