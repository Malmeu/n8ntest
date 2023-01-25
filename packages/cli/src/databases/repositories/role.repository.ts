import type { DataSource, FindOneOptions } from 'typeorm';
import type { RoleNames, RoleScopes } from '../entities/Role';
import { Role } from '../entities/Role';
import { AbstractRepository } from './abstract.repository';

export class RoleRepository extends AbstractRepository<Role> {
	constructor(connection: DataSource) {
		super(connection, Role);
	}

	async findGlobalOwnerRoleIdOrFail(): Promise<Role['id']> {
		return this.findRoleIdOrFail('global', 'owner');
	}

	async findGlobalMemberRoleId(): Promise<Role['id'] | undefined> {
		return this.findRoleId('global', 'member');
	}

	async findGlobalMemberRoleIdOrFail(): Promise<Role['id']> {
		return this.findRoleIdOrFail('global', 'member');
	}

	async findWorkflowOwnerRoleId(): Promise<Role['id'] | undefined> {
		return this.findRoleId('workflow', 'owner');
	}

	async findWorkflowOwnerRoleIdOrFail(): Promise<Role['id']> {
		return this.findRoleIdOrFail('workflow', 'owner');
	}

	async findCredentialOwnerRoleId(): Promise<Role['id'] | undefined> {
		return this.findRoleId('credential', 'owner');
	}

	async findCredentialOwnerRoleIdOrFail(): Promise<Role['id']> {
		return this.findRoleIdOrFail('credential', 'owner');
	}

	async findCredentialUserRoleId(): Promise<Role['id'] | undefined> {
		return this.findRoleId('credential', 'user');
	}

	private async findRoleId(scope: RoleScopes, name: RoleNames) {
		const role = await this.repo.findOne(this.findIdOptions(scope, name));
		return role?.id;
	}

	private async findRoleIdOrFail(scope: RoleScopes, name: RoleNames) {
		const role = await this.repo.findOneOrFail(this.findIdOptions(scope, name));
		return role.id;
	}

	private findIdOptions(scope: RoleScopes, name: RoleNames): FindOneOptions<Role> {
		return {
			select: ['id'],
			where: { scope, name },
		};
	}
}
