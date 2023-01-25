import * as Db from '@/Db';
import { Reset } from '@/commands/user-management/reset';
import type { Role } from '@db/entities/Role';
import * as testDb from '../shared/testDb';

let globalOwnerRole: Role;

beforeAll(async () => {
	await testDb.init();

	globalOwnerRole = await testDb.getGlobalOwnerRole();
});

beforeEach(async () => {
	await testDb.truncate(['User']);
	await testDb.createUser({ globalRole: globalOwnerRole });
});

afterAll(async () => {
	await testDb.terminate();
});

test('user-management:reset should reset DB to default user state', async () => {
	await Reset.run();

	const user = await Db.repositories.User.findByRole('global', 'owner');

	if (!user) {
		fail('No owner found after DB reset to default user state');
	}

	expect(user.email).toBeNull();
	expect(user.firstName).toBeNull();
	expect(user.lastName).toBeNull();
	expect(user.password).toBeNull();
	expect(user.resetPasswordToken).toBeNull();
	expect(user.resetPasswordTokenExpiration).toBeNull();
	expect(user.personalizationAnswers).toBeNull();
});
