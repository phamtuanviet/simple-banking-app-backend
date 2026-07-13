import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Post,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { UserRole, UserStatus } from '../user/user.entity';
import { Roles } from 'src/common/decorators/roles.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { ApproveTransactionDto } from '../transaction/dto/approve-transaction.dto';
import { ReversalDto } from '../transaction/dto/reversal.dto';
import { TellerTransferDto } from '../transaction/dto/teller-transfer.dto';
import { FilterUserHistoryDto } from '../user/dto/filter-user-history.dto';

// Bắt buộc phải đăng nhập VÀ phải là ADMIN cho toàn bộ controller này
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // Endpoint: GET /admin/users
  @Get('users')
  @Roles(UserRole.ADMIN, UserRole.TELLER)
  async getAllUsers(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('search') search?: string,
    @Query('status') status?: UserStatus,
    @Query('role') role?: UserRole,
    @Query('isEmailVerified') isEmailVerified?: string,
    @Query('id') id?: string,
  ) {
    // Chuyển đổi string 'true'/'false' từ query URL sang boolean
    let isVerified: boolean | undefined = undefined;
    if (isEmailVerified === 'true') isVerified = true;
    if (isEmailVerified === 'false') isVerified = false;

    return this.adminService.getAllUsers(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 10,
      { id, search, status, role, isEmailVerified: isVerified },
    );
  }

  // Endpoint: PATCH /admin/users/:id/status
  @Patch('users/:id/status')
  @Roles(UserRole.ADMIN, UserRole.TELLER)
  async updateUserStatus(
    @Param('id') id: string,
    @Body() updateUserStatusDto: UpdateUserStatusDto,
  ) {
    return this.adminService.updateUserStatus(id, updateUserStatusDto.status);
  }

  @Post('transactions/approve/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN) // Chỉ Admin/Manager được duyệt
  async approveTransaction(
    @CurrentUser() admin,
    @Param('id') transactionId: string,
    @Body() approveDto: ApproveTransactionDto,
  ) {
    return await this.adminService.approveTransaction(
      admin.id,
      transactionId,
      approveDto,
    );
  }

  @Get('transactions')
  @Roles(UserRole.ADMIN, UserRole.TELLER)
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

  @Post('transactions/reverse')
  @Roles(UserRole.ADMIN) // Chỉ quản lý cấp cao mới được gọi API này
  async reverseTransaction(@Body() dto: ReversalDto) {
    return await this.adminService.reverseTransfer(dto);
  }

  @Post('teller-transfer')
  @Roles(UserRole.TELLER, UserRole.ADMIN) // Chỉ nhân viên quầy và Admin được dùng
  async tellerTransfer(@Body() dto: TellerTransferDto) {
    return await this.adminService.tellerTransfer(dto);
  }

  @Get('user-history')
  @Roles(UserRole.ADMIN, UserRole.TELLER) // Tùy chỉnh Role theo nghiệp vụ của bạn
  async getUserHistories(@Query() filterDto: FilterUserHistoryDto) {
    return await this.adminService.findAllForAdmin(filterDto);
  }
}
