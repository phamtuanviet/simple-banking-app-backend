import { IsEnum, IsNotEmpty } from 'class-validator';
import { UserStatus } from 'src/modules/user/user.entity';

export class UpdateUserStatusDto {
  @IsNotEmpty({ message: 'Vui lòng cung cấp trạng thái mới' })
  @IsEnum(UserStatus, {
    message: 'Trạng thái không hợp lệ (chỉ chấp nhận active, locked, banned)',
  })
  status: UserStatus;
}
