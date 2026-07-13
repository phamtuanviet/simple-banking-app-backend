import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { UserRole } from '../user/user.entity';
import { FilterLedgerDto } from './dto/filter-ledger.dto';
import { Roles } from 'src/common/decorators/roles.decorator';
import { LedgerService } from './ledger-entry.service';

@Controller('admin/ledgers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LedgerController {
  constructor(private readonly ledgerService: LedgerService) {}

  @Get()
  @Roles(UserRole.ADMIN) // Chặn chặt chẽ bằng RBAC Guard
  async getLedgerEntries(@Query() filterDto: FilterLedgerDto) {
    return await this.ledgerService.findAllForAdmin(filterDto);
  }
}
