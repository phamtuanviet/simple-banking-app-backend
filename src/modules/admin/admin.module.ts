import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../user/user.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, RefreshToken])],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
