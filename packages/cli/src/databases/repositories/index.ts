/* eslint-disable @typescript-eslint/naming-convention */
import type { IDatabaseCollections } from '@/Interfaces';
import type { RoleRepository } from './role.repository';
import type { UserRepository } from './user.repository';

export { RoleRepository } from './role.repository';
export { UserRepository } from './user.repository';

export interface Repositories extends Omit<IDatabaseCollections, 'Role' | 'User'> {
	Role: RoleRepository;
	User: UserRepository;
}
