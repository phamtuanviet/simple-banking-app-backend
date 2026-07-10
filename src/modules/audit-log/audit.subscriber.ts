import {
  EventSubscriber,
  EntitySubscriberInterface,
  UpdateEvent,
  DataSource,
} from 'typeorm';
import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import { AuditLog } from './entities/audit-log.entity';
import { UserStatus } from '../user/user.entity';
import { TransactionStatus } from '../transaction/entities/transaction.entity';
import { InsertEvent } from 'typeorm/browser';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { InjectDataSource } from '@nestjs/typeorm';

@EventSubscriber()
@Injectable()
export class AuditSubscriber implements EntitySubscriberInterface {
  constructor(
    private readonly cls: ClsService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {
    this.dataSource.subscribers.push(this);
  }

  // Lắng nghe nhiều entity cùng lúc (nếu muốn bắt tất cả thì bỏ hàm này)

  async beforeInsert(event: InsertEvent<any>) {
    if (!event.entity || event.entity.constructor.name === 'AuditLog') return;

    const entityClassName = event.entity.constructor.name;

    // Bắt hành động tạo Refresh Token = Đăng nhập thành công
    if (entityClassName === 'RefreshToken') {
      const newData = event.entity as RefreshToken;
      const isClsActive = this.cls.isActive();

      // Lấy ID: Lấy từ CLS trước, nếu không có thì lấy từ newData.user
      const clsUserId = isClsActive ? this.cls.get('userId') : undefined;
      const actorId = clsUserId || newData?.user?.id;

      if (!actorId) return;

      const auditRepo = event.manager.getRepository(AuditLog);

      await auditRepo.insert({
        actorId: actorId,
        action: 'LOGIN_SUCCESS',
        entity: 'users',
        entityId: actorId,
        ipAddress: isClsActive ? this.cls.get('ip') : 'system',
        userAgent: isClsActive ? this.cls.get('userAgent') : 'system',
        beforeData: null as any,
        afterData: { note: 'Generated new refresh token' } as any,
      });
    }
  }

  async beforeUpdate(event: UpdateEvent<any>) {
    if (!event.entity || event.entity.constructor.name === 'AuditLog') return;

    const entityClassName = event.entity.constructor.name;
    const previousData = event.databaseEntity;
    const newData = event.entity;

    if (!previousData || !newData) return;

    const isClsActive = this.cls.isActive();
    const actorId = isClsActive ? this.cls.get('userId') : null;
    const ipAddress = isClsActive ? this.cls.get('ip') : 'system';
    const userAgent = isClsActive ? this.cls.get('userAgent') : 'system';
    let action = '';

    // ==========================================
    // 1. NGHIỆP VỤ: KHÓA / MỞ KHÓA TÀI KHOẢN (Bảng users)
    // ==========================================
    if (entityClassName === 'User') {
      // Nhớ viết hoa chữ cái đầu cho khớp tên Entity
      const isStatusChanged = event.updatedColumns.some(
        (col) => col.propertyName === 'status',
      );
      if (isStatusChanged && previousData.status !== newData.status) {
        if (newData.status === UserStatus.LOCKED) action = 'LOCK_ACCOUNT';
        if (newData.status === UserStatus.ACTIVE) action = 'UNLOCK_ACCOUNT';
        if (newData.status === UserStatus.BANNED) action = 'BAN_ACCOUNT';
      }

      const isPasswordChanged = event.updatedColumns.some(
        (col) => col.propertyName === 'passwordHash',
      );
      if (
        isPasswordChanged &&
        previousData.passwordHash !== newData.passwordHash
      ) {
        action = 'CHANGE_PASSWORD';
      }

      const isFailedAttemptsChanged = event.updatedColumns.some(
        (col) => col.propertyName === 'failedLoginAttempts',
      );
      if (
        isFailedAttemptsChanged &&
        newData.failedLoginAttempts > previousData.failedLoginAttempts
      ) {
        action = 'LOGIN_FAILED';
      }
    }

    // ==========================================
    // 2. NGHIỆP VỤ: ADMIN DUYỆT GIAO DỊCH LỚN (Bảng transactions)
    // ==========================================
    if (entityClassName === 'Transaction') {
      // Nhớ viết hoa chữ cái đầu cho khớp tên Entity
      const isStatusChanged = event.updatedColumns.some(
        (col) => col.propertyName === 'status',
      );
      if (
        isStatusChanged &&
        previousData.status === TransactionStatus.PENDING_APPROVAL
      ) {
        if (
          newData.status === TransactionStatus.PROCESSING ||
          newData.status === TransactionStatus.COMPLETED
        ) {
          action = 'APPROVE_LARGE_TRANSACTION';
        }
        if (newData.status === TransactionStatus.FAILED) {
          action = 'REJECT_LARGE_TRANSACTION';
        }
      }
    }

    if (!action) return;

    // ==========================================
    // THỰC THI GHI AUDIT LOG
    // ==========================================
    const auditRepo = event.manager.getRepository(AuditLog);
    await auditRepo.insert({
      actorId: actorId || null,
      action: action,
      entity: entityClassName.toLowerCase(), // Lưu xuống dạng chữ thường
      entityId: previousData.id,
      ipAddress: ipAddress,
      userAgent: userAgent,
      beforeData: previousData,
      afterData: newData,
    });
  }
}
