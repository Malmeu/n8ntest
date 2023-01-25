import type { EntityManager } from 'typeorm';
import { In } from 'typeorm';
import * as Db from '@/Db';
import { User } from '@db/entities/User';

export class UserService {
	static async getById(id: User['id']): Promise<User | null> {
		return Db.repositories.User.findById(id, { includeRole: true });
	}

	static async getByIds(transaction: EntityManager, ids: string[]) {
		return transaction.find(User, { where: { id: In(ids) } });
	}
}
