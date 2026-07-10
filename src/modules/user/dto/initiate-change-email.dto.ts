import { IsString, IsEmail } from 'class-validator';
export class InitiateChangeEmailDto {
  @IsString()
  currentPassword: string;

  @IsEmail({}, { message: 'Email không đúng định dạng' })
  newEmail: string;
}
