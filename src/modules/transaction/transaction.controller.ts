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

@UseGuards(JwtAuthGuard)
@Controller('transactions')
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  @Post('transfer')
  async transferFunds(
    @CurrentUser() user,
    @Body() transferDto: TransferDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException(
        'Thiếu header Idempotency-Key để thực hiện giao dịch an toàn.',
      );
    }
    const userId = user.id;
    return this.transactionService.transferFunds(
      userId,
      transferDto,
      idempotencyKey,
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
    return this.transactionService.getTransactionHistory(
      userId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 10,
      { status, startDate, endDate, flow },
    );
  }
}
