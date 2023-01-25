import type { QueryRunner } from 'typeorm';

export type DatabaseType = 'mariadb' | 'postgresdb' | 'mysqldb' | 'sqlite';

export interface MigrationContext {
	queryRunner: QueryRunner;
	tablePrefix: string;
	dbType: DatabaseType;
	dbName: string;
}

type MigrationFn = (ctx: MigrationContext) => Promise<void>;

export interface MigrationInterface {
	up: MigrationFn;
	down: MigrationFn;
}

export interface MigrationClass extends Function {
	prototype: MigrationInterface;
}

export type InsertResult = Array<{ insertId: number }>;
