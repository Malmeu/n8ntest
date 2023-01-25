import type { MigrationContext, MigrationInterface } from '@db/types';

export class MessageEventBusDestinations1671535397530 implements MigrationInterface {
	async up({ queryRunner, tablePrefix }: MigrationContext) {
		await queryRunner.query(
			`CREATE TABLE "${tablePrefix}event_destinations" (` +
				'"id"	varchar(36) PRIMARY KEY NOT NULL,' +
				'"destination" text NOT NULL,' +
				"\"createdAt\"	datetime(3) NOT NULL DEFAULT 'STRFTIME(''%Y-%m-%d %H:%M:%f'', ''NOW'')'," +
				"\"updatedAt\"	datetime(3) NOT NULL DEFAULT 'STRFTIME(''%Y-%m-%d %H:%M:%f'', ''NOW'')'" +
				');',
		);
	}

	async down({ queryRunner, tablePrefix }: MigrationContext) {
		await queryRunner.query(`DROP TABLE "${tablePrefix}event_destinations"`);
	}
}
