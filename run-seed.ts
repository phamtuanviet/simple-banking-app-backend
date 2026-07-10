import { NestFactory } from '@nestjs/core';
import { SeedModule } from './seed.module';
import { SeedService } from './seed.service';
import { Logger } from '@nestjs/common';

const runSeed = async () => {
  const logger = new Logger('RunSeed');
  const app = await NestFactory.createApplicationContext(SeedModule);

  logger.log('Khởi tạo thành công application context cho seeder.');

  try {
    const seeder = app.get(SeedService);
    await seeder.seed();
    logger.log('Hoàn tất quá trình seeding.');
  } catch (error) {
    logger.error('Seeding thất bại!');
  } finally {
    await app.close();
  }
};

runSeed();
