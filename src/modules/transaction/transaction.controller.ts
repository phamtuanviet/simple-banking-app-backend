import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import { TransactionService } from './transaction.service';
import { TransferDto } from './dto/transfer.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { UserRole } from '../user/user.entity';
import { Roles } from 'src/common/decorators/roles.decorator';
import { ApprovalAction } from './entities/transaction-approval.entity';
import { CashTransactionDto } from './dto/cash-transaction.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('transactions')
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  @Post('transfer/initiate')
  async initiateTransfer(
    @CurrentUser() user,
    @Body() transferDto: TransferDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException(
        'Thiếu header Idempotency-Key để thực hiện giao dịch an toàn.',
      );
    }
    return await this.transactionService.initiateTransfer(
      user.id,
      transferDto,
      idempotencyKey,
    );
  }

  // 2. Xác thực OTP (Dành cho luồng rủi ro trung bình)
  @Post('transfer/confirm-otp')
  async confirmTransferOtp(
    @CurrentUser() user,
    @Body() confirmDto: { transactionId: string; otpCode: string },
  ) {
    return await this.transactionService.confirmOtpTransfer(
      user.id,
      confirmDto.transactionId,
      confirmDto.otpCode,
    );
  }

  @Post('transfer/resend-otp')
  async resendOtp(
    @CurrentUser() user,
    @Body() resendOtpDto: { transactionId: string },
  ) {
    return await this.transactionService.resendOtp(
      user.id,
      resendOtpDto.transactionId,
    );
  }

  // 3. Phê duyệt giao dịch lớn (Chỉ dành cho ADMIN/TELLER)
  @Post('transfer/approve')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN) // Kích hoạt RBAC
  async approveTransfer(
    @CurrentUser() admin,
    @Body()
    approveDto: {
      transactionId: string;
      action: ApprovalAction;
      remarks?: string;
    },
  ) {
    return await this.transactionService.approveTransfer(
      admin.id,
      approveDto.transactionId,
      approveDto.action,
      approveDto.remarks,
    );
  }

  @Get()
  async getHistory(
    @CurrentUser() user,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('flow') flow?: 'in' | 'out',
  ) {
    const userId = user.id;
    return await this.transactionService.getTransactionHistory(
      userId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 10,
      { status, startDate, endDate, flow },
    );
  }

  @Post('deposit')
  @Roles(UserRole.TELLER, UserRole.ADMIN) // Kích hoạt RBAC phân quyền chặt chẽ tại quầy
  async deposit(@Body() dto: CashTransactionDto) {
    return await this.transactionService.deposit(dto);
  }

  @Post('withdraw')
  @Roles(UserRole.TELLER, UserRole.ADMIN)
  async withdraw(@Body() dto: CashTransactionDto) {
    return await this.transactionService.withdraw(dto);
  }
}
