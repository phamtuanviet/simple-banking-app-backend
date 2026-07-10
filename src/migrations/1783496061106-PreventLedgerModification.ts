import { MigrationInterface, QueryRunner } from 'typeorm';

export class PreventLedgerModification1783496061106 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {}

  public async down(queryRunner: QueryRunner): Promise<void> {}
}
