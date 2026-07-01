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
import { UserRole } from '../user/user.entity';
import { Roles } from 'src/common/decorators/roles.decorator';

// Bắt buộc phải đăng nhập VÀ phải là ADMIN cho toàn bộ controller này
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/users')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // Endpoint: GET /admin/users
  @Get()
  async getAllUsers(
    @Query('page') page: string,
    @Query('limit') limit: string,
  ) {
    return this.adminService.getAllUsers(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 10,
    );
  }

  // Endpoint: PATCH /admin/users/:id/status
  @Patch(':id/status')
  async updateUserStatus(
    @Param('id') id: string,
    @Body() updateUserStatusDto: UpdateUserStatusDto,
  ) {
    return this.adminService.updateUserStatus(id, updateUserStatusDto.status);
  }
}
