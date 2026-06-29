import { IsNotEmpty } from 'class-validator';

export class RefreshTokenDto {
  @IsNotEmpty({ message: 'Refresh Token không được để trống' })
  refreshToken: string;
}
