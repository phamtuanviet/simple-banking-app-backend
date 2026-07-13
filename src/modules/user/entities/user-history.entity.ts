import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../user.entity';

@Entity('user_history')
export class UserHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'changed_by_id', type: 'uuid' })
  changedById: string; // Ai là người đổi (Chính user đó hoặc Admin)

  @Column({ name: 'previous_data', type: 'jsonb' })
  previousData: any; // Lưu toàn bộ snapshot data cũ

  @Column({ type: 'varchar', length: 255, nullable: true })
  reason: string; // Lý do đổi (nếu có)

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
