import { MigrationInterface, QueryRunner } from 'typeorm';

export class PreventLedgerModification1680000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Tạo function ném lỗi khi phát hiện thao tác UPDATE/DELETE
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION prevent_ledger_modification()
      RETURNS TRIGGER AS $$
      BEGIN
        RAISE EXCEPTION 'Bảng ledger_entries là bất biến (immutable). Tuyệt đối không được phép UPDATE hoặc DELETE.';
      END;
      $$ LANGUAGE plpgsql;
    `);

    // 2. Gắn function này thành Trigger chạy TRƯỚC KHI lệnh UPDATE/DELETE thực thi
    await queryRunner.query(`
      CREATE TRIGGER trg_prevent_ledger_modification
      BEFORE UPDATE OR DELETE ON ledger_entries
      FOR EACH ROW
      EXECUTE FUNCTION prevent_ledger_modification();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Phục hồi lại nếu cần rollback migration
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_prevent_ledger_modification ON ledger_entries`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS prevent_ledger_modification`,
    );
  }
}
