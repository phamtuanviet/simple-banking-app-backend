// src/modules/user/dto/update-profile.dto.ts
import { IsString, IsOptional, IsDateString, MaxLength } from 'class-validator';
import { IsMinimumAge } from 'src/validators/is-minimum-age.validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  fullName?: string;

  @IsOptional()
  @IsDateString()
  @IsMinimumAge(18)
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(15)
  phoneNumber?: string;
}
