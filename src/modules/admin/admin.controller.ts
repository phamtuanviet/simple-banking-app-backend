import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { UserRole, UserStatus } from '../user/user.entity';
import { Roles } from 'src/common/decorators/roles.decorator';

// Bắt buộc phải đăng nhập VÀ phải là ADMIN cho toàn bộ controller này
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // Endpoint: GET /admin/users
  @Get('users')
  async getAllUsers(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('search') search?: string,
    @Query('status') status?: UserStatus,
    @Query('role') role?: UserRole,
    @Query('isEmailVerified') isEmailVerified?: string,
  ) {
    // Chuyển đổi string 'true'/'false' từ query URL sang boolean
    let isVerified: boolean | undefined = undefined;
    if (isEmailVerified === 'true') isVerified = true;
    if (isEmailVerified === 'false') isVerified = false;

    return this.adminService.getAllUsers(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 10,
      {
        search,
        status,
        role,
        isEmailVerified: isVerified,
      },
    );
  }

  // Endpoint: PATCH /admin/users/:id/status
  @Patch('users/:id/status')
  async updateUserStatus(
    @Param('id') id: string,
    @Body() updateUserStatusDto: UpdateUserStatusDto,
  ) {
    return this.adminService.updateUserStatus(id, updateUserStatusDto.status);
  }

  @Get('transactions')
  async getAllTransactions(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.adminService.getAllTransactions(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 10,
      {
        search,
        status,
        startDate,
        endDate,
      },
    );
  }

  @Get('stats')
  async getDashboardStats() {
    return this.adminService.getDashboardStats();
  }
}
