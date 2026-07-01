import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TransactionService } from './transaction.service';
import { TransferDto } from './dto/transfer.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('transaction')
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  @Post('transfer')
  async transferFunds(@Req() req, @Body() transferDto: TransferDto) {
    const userId = req.user.id;
    return this.transactionService.transferFunds(userId, transferDto);
  }

  @Get()
  async getHistory(
    @Req() req,
    @Query('page') page: string,
    @Query('limit') limit: string,
  ) {
    const userId = req.user.id;
    return this.transactionService.getTransactionHistory(
      userId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 10,
    );
  }
}
