import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

// Hàm này nhận vào ConfigService để đọc biến môi trường và trả về object cấu hình
export const getDatabaseConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: configService.get<string>('DB_HOST'),
  port: configService.get<number>('DB_PORT'),
  username: configService.get<string>('DB_USER'),
  password: configService.get<string>('DB_PASSWORD'),
  database: configService.get<string>('DB_NAME'),
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  // Tự động đồng bộ schema (Chỉ dùng cho Dev, lên Production sẽ dùng Migration)
  synchronize: true,
});
