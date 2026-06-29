import { IsEmail, IsNotEmpty, MinLength, MaxLength } from 'class-validator';

export class RegisterDto {
  @IsNotEmpty({ message: 'Tên không được để trống' })
  fullName: string;

  @IsEmail({}, { message: 'Email không đúng định dạng' })
  email: string;

  @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
  @MinLength(6, { message: 'Mật khẩu phải có ít nhất 6 ký tự' })
  @MaxLength(50, { message: 'Mật khẩu tối đa 50 ký tự' })
  password: string;
}
