import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { User } from '../user/user.entity'; // Đảm bảo đường dẫn này đúng với project của bạn
import { FilterAuditLogDto } from './dto/filter-audit-log.dto';

@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepo: Repository<AuditLog>,
  ) {}

  async findAllLogs(dto: FilterAuditLogDto) {
    try {
      const {
        action,
        entity,
        email,
        fromDate,
        toDate,
        page = 1,
        limit = 10,
      } = dto;
      const skip = (page - 1) * limit;

      const queryBuilder = this.auditLogRepo
        .createQueryBuilder('audit')
        // Dùng leftJoinAndMapOne vì actorId không được định nghĩa relation @ManyToOne trong entity
        // Lệnh này sẽ tạo ra một trường ảo tên là 'actor' chứa thông tin User
        .leftJoinAndMapOne(
          'audit.actor',
          User,
          'user',
          'user.id = audit.actorId', // Điều kiện nối bảng
        )
        .orderBy('audit.createdAt', 'DESC');

      // 1. Lọc theo action
      if (action) {
        queryBuilder.andWhere('audit.action = :action', { action });
      }

      // 2. Lọc theo tên bảng (entity)
      if (entity) {
        queryBuilder.andWhere('audit.entity = :entity', { entity });
      }

      // 3. Lọc theo email người thao tác (Dựa vào bảng user đã join)
      if (email) {
        queryBuilder.andWhere('user.email = :email', { email });
      }

      // 4. Lọc theo thời gian
      if (fromDate) {
        queryBuilder.andWhere('audit.createdAt >= :fromDate', { fromDate });
      }
      if (toDate) {
        queryBuilder.andWhere('audit.createdAt <= :toDate', { toDate });
      }

      // Sử dụng getManyAndCount để lấy data và tổng số phục vụ phân trang
      const [data, total] = await queryBuilder
        .skip(skip)
        .take(limit)
        .getManyAndCount();

      // Format lại data trước khi trả về để giấu đi các thông tin nhạy cảm của user nếu cần
      const formattedItems = data.map((item: any) => ({
        id: item.id,
        action: item.action,
        entity: item.entity,
        entityId: item.entityId,
        ipAddress: item.ipAddress,
        userAgent: item.userAgent,
        beforeData: item.beforeData,
        afterData: item.afterData,
        createdAt: item.createdAt,
        // Chỉ lấy ra email và họ tên (nếu có) thay vì trả nguyên cục User có chứa passwordHash
        actor: item.actor
          ? {
              id: item.actor.id,
              email: item.actor.email,
              fullName: item.actor.fullName,
            }
          : null,
      }));

      return {
        total,
        page,
        limit,
        items: formattedItems,
      };
    } catch (error) {
      console.error('Lỗi truy vấn Audit Log:', error);
      throw new InternalServerErrorException(
        'Lỗi hệ thống khi tải nhật ký kiểm toán.',
      );
    }
  }
}
