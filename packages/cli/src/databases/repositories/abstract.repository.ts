import type { DataSource, EntityManager, EntityTarget, ObjectLiteral, Repository } from 'typeorm';

export abstract class AbstractRepository<Entity extends ObjectLiteral> {
	protected repo: Repository<Entity>;

	protected constructor(private connection: DataSource, entityClass: EntityTarget<Entity>) {
		this.repo = connection.getRepository(entityClass);
	}

	// TODO: make this protected after moving all add db code into repositories
	async transaction<T>(fn: (entityManager: EntityManager) => Promise<T>): Promise<T> {
		return this.connection.manager.transaction(fn);
	}
}
