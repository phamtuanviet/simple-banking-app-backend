import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string; // Ai là người thực hiện (User/Admin ID)

  @Column({ type: 'varchar', length: 255 })
  action: string; // Ví dụ: UPDATE_ACCOUNT_STATUS, CHANGE_PASSWORD

  @Column({ type: 'varchar', length: 100 })
  entity: string; // Tên bảng bị tác động (ví dụ: 'accounts')

  @Column({ name: 'entity_id', type: 'uuid' })
  entityId: string; // ID của bản ghi bị tác động

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress: string;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string;

  // Dùng jsonb cho PostgreSQL để tối ưu performance
  @Column({ name: 'before_data', type: 'jsonb', nullable: true })
  beforeData: any;

  @Column({ name: 'after_data', type: 'jsonb', nullable: true })
  afterData: any;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
