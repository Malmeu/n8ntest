import { Not } from 'typeorm';
import * as Db from '@/Db';
import type { CredentialsEntity } from '@db/entities/CredentialsEntity';
import { BaseCommand } from '../BaseCommand';
import { User } from '@db/entities/User';

const defaultUserProps = {
	firstName: null,
	lastName: null,
	email: null,
	password: null,
	resetPasswordToken: null,
};

export class Reset extends BaseCommand {
	static description = '\nResets the database to the default user state';

	async run(): Promise<void> {
		const owner = await this.getInstanceOwner();

		const ownerWorkflowRoleId = await Db.repositories.Role.findWorkflowOwnerRoleId();
		const ownerCredentialRoleId = await Db.repositories.Role.findCredentialOwnerRoleId();

		await Db.collections.SharedWorkflow.update(
			{ userId: Not(owner.id), roleId: ownerWorkflowRoleId },
			{ userId: owner.id },
		);

		await Db.collections.SharedCredentials.update(
			{ userId: Not(owner.id), roleId: ownerCredentialRoleId },
			{ userId: owner.id },
		);

		await Db.repositories.User.delete({ id: Not(owner.id) });
		await Db.repositories.User.save(Object.assign(owner, defaultUserProps));

		const danglingCredentials: CredentialsEntity[] =
			(await Db.collections.Credentials.createQueryBuilder('credentials')
				.leftJoinAndSelect('credentials.shared', 'shared')
				.where('shared.credentialsId is null')
				.getMany()) as CredentialsEntity[];
		const newSharedCredentials = danglingCredentials.map((credentials) =>
			Db.collections.SharedCredentials.create({
				credentials,
				userId: owner.id,
				roleId: ownerCredentialRoleId,
			}),
		);
		await Db.collections.SharedCredentials.save(newSharedCredentials);

		await Db.collections.Settings.update(
			{ key: 'userManagement.isInstanceOwnerSetUp' },
			{ value: 'false' },
		);
		await Db.collections.Settings.update(
			{ key: 'userManagement.skipInstanceOwnerSetup' },
			{ value: 'false' },
		);

		this.logger.info('Successfully reset the database to default user state.');
	}

	async catch(error: Error): Promise<void> {
		this.logger.error('Error resetting database. See log messages for details.');
		this.logger.error(error.message);
		this.exit(1);
	}

	private async getInstanceOwner(): Promise<User> {
		const globalRoleId = await Db.repositories.Role.findGlobalOwnerRoleIdOrFail();

		const owner = await Db.repositories.User.findByRole('global', 'owner');

		if (owner) return owner;

		const user = new User();

		Object.assign(user, { ...defaultUserProps, globalRoleId });

		await Db.repositories.User.save(user);

		return Db.repositories.User.findByRoleOrFail('global', 'owner');
	}
}
