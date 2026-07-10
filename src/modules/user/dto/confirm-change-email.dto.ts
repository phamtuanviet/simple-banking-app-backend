import { IsString, MaxLength, MinLength } from 'class-validator';

export class ConfirmChangeEmailDto {
  @IsString()
  @MinLength(6)
  @MaxLength(6)
  otpCode: string;
}
