import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { FilterAuditLogDto } from './dto/filter-audit-log.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { UserRole } from '../user/user.entity';
import { Roles } from 'src/common/decorators/roles.decorator';

@Controller('admin/audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @Roles(UserRole.ADMIN) // Chỉ quản lý cấp cao được xem log hệ thống
  async getAuditLogs(@Query() filterDto: FilterAuditLogDto) {
    return await this.auditLogService.findAllLogs(filterDto);
  }
}
