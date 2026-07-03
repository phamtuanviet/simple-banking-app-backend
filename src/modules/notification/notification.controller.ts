import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { NotificationService } from './notification.service';
// Import JwtAuthGuard và Decorator lấy user của bạn vào đây (ví dụ: @CurrentUser hoặc dùng trực tiếp req.user)

@Controller('notifications')
@UseGuards(JwtAuthGuard) // Bật Guard bảo mật lên ở đây
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  // Endpoint: GET /notifications?page=1&limit=10
  @Get()
  async getNotifications(
    @Req() req,
    @Query('page') page: string,
    @Query('limit') limit: string,
  ) {
    const userId = req.user.id;
    return await this.notificationService.getUserNotifications(
      userId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 10,
    );
  }

  // Endpoint: PATCH /notifications/read-all
  // Lưu ý: Đặt route tĩnh này LÊN TRÊN route động :id để tránh xung đột route
  @Patch('read-all')
  async markAllAsRead(@Req() req) {
    const userId = req.user.id;
    return await this.notificationService.markAllAsRead(userId);
  }

  // Endpoint: PATCH /notifications/:id/read
  @Patch(':id/read')
  async markAsRead(@Req() req, @Param('id') id: string) {
    const userId = req.user.id;
    return await this.notificationService.markAsRead(userId, id);
  }
}
