import { IsEmail, IsNotEmpty } from 'class-validator';

export class ResendEmailDto {
  @IsNotEmpty({ message: 'Email không được để trống' })
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  email: string;
}
