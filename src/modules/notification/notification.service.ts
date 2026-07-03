import {
  Injectable,
  BadRequestException,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';

import { NotificationGateway } from './notification.gateway';
import { Notification, NotificationStatus } from './notification.entity';

@Injectable()
export class NotificationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
    private notificationGateway: NotificationGateway,
  ) {}

  // Tự động kích hoạt ngay khi server khởi động lại để cứu các thông báo kẹt
  async onApplicationBootstrap() {
    await this.resendPendingNotifications();
  }

  // API 1: Lấy danh sách thông báo phân trang + Đếm số lượng chưa đọc
  async getUserNotifications(
    userId: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const skip = (page - 1) * limit;

    // Chạy song song: lấy data phân trang và đếm tổng số thông báo CHƯA ĐỌC
    const [[notifications, total], unreadCount] = await Promise.all([
      this.notificationRepository.findAndCount({
        where: { user: { id: userId }, status: NotificationStatus.SENT }, // Chỉ lấy những cái đã phát đi thành công
        order: { createdAt: 'DESC' },
        skip,
        take: limit,
      }),
      this.notificationRepository.count({
        where: {
          user: { id: userId },
          isRead: false,
          status: NotificationStatus.SENT,
        },
      }),
    ]);

    // Format dữ liệu phẳng giống giao thức giao dịch trước đó
    const items = notifications.map((nt) => ({
      id: nt.id,
      type: nt.type,
      title: nt.title,
      message: nt.message,
      amount: nt.amount ? parseFloat(nt.amount.toString()) : null,
      balanceAfterTransaction: nt.balanceAfterTransaction
        ? parseFloat(nt.balanceAfterTransaction.toString())
        : null,
      isRead: nt.isRead,
      createdAt: nt.createdAt,
    }));

    return {
      items,
      total,
      page,
      limit,
      unreadCount, // Trả thêm trường này để Frontend vẽ số chấm đỏ trên Quả chuông
    };
  }

  // API 2: Đánh dấu ĐÃ ĐỌC một thông báo cụ thể
  async markAsRead(userId: string, notificationId: string) {
    const notification = await this.notificationRepository.findOne({
      where: { id: notificationId, user: { id: userId } },
    });

    if (!notification) {
      throw new BadRequestException(
        'Không tìm thấy thông báo hoặc bạn không có quyền.',
      );
    }

    notification.isRead = true;
    await this.notificationRepository.save(notification);

    return { success: true, message: 'Đã đánh dấu đọc thông báo.' };
  }

  // API 3: Đánh dấu ĐÃ ĐỌC TẤT CẢ thông báo (Tiện ích UX rất nên có)
  async markAllAsRead(userId: string) {
    await this.notificationRepository.update(
      { user: { id: userId }, isRead: false },
      { isRead: true },
    );
    return { success: true, message: 'Đã đánh dấu đọc tất cả thông báo.' };
  }

  // ==========================================
  // ĐỘI CỨU HỘ: CRON JOB CHẠY NGẦM (OUTBOX PATTERN)
  // ==========================================
  @Cron(CronExpression.EVERY_30_SECONDS) // Quét định kỳ mỗi 30 giây
  async handleCron() {
    await this.resendPendingNotifications();
  }

  private async resendPendingNotifications() {
    const pendingNotifications = await this.notificationRepository.find({
      where: { status: NotificationStatus.PENDING },
      relations: { user: true }, // Lấy thông tin user để biết phòng socket cần gửi
    });

    if (pendingNotifications.length === 0) return;

    this.logger.log(
      `Phát hiện ${pendingNotifications.length} thông báo chưa gửi thành công. Tiến hành đẩy lại...`,
    );

    for (const nt of pendingNotifications) {
      try {
        // Đẩy lại qua cổng mạng Socket
        this.notificationGateway.notifyUser(nt.user.id, 'new_notification', {
          id: nt.id,
          type: nt.type,
          title: nt.title,
          message: nt.message,
          amount: nt.amount ? parseFloat(nt.amount.toString()) : null,
          balanceAfterTransaction: nt.balanceAfterTransaction
            ? parseFloat(nt.balanceAfterTransaction.toString())
            : null,
          isRead: nt.isRead,
          createdAt: nt.createdAt,
        });

        // Đẩy thành công -> Cập nhật trạng thái
        nt.status = NotificationStatus.SENT;
        await this.notificationRepository.save(nt);
      } catch (error) {
        this.logger.error(`Thử lại thất bại cho thông báo ID ${nt.id}:`, error);
      }
    }
  }
}
