import * as Db from '@/Db';
import type { Role } from '@db/entities/Role';
import type { User } from '@db/entities/User';

export function isInstanceOwner(user: User): boolean {
	return user.globalRole.name === 'owner';
}

export async function getWorkflowOwnerRole(): Promise<Role['id']> {
	return Db.repositories.Role.findWorkflowOwnerRoleIdOrFail();
}
