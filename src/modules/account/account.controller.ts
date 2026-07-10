import { Controller, Get, UseGuards, Req, Param } from '@nestjs/common';
import { AccountService } from './account.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard) // Bảo vệ route, yêu cầu JWT hợp lệ
@Controller('accounts')
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Get('me')
  async getMyAccount(@Req() req) {
    // req.user được gán từ JwtStrategy sau khi verify token thành công
    const userId = req.user.id;
    return this.accountService.getMyAccount(userId);
  }

  @Get('info/:accountNumber')
  async getRecipientInfo(@Param('accountNumber') accountNumber: string) {
    // Trả về data bọc trong object chuẩn API response (tương tự định dạng bạn dùng ở FE)
    return await this.accountService.getRecipientInfo(accountNumber);
  }
}
