import { Command } from '@oclif/core';
import { LoggerProxy } from 'n8n-workflow';
import type { Logger } from '@/Logger';
import { getLogger } from '@/Logger';
import * as Db from '@/Db';
import { inTest } from '@/constants';

export abstract class BaseCommand extends Command {
	logger: Logger;

	/**
	 * Lifecycle methods
	 */

	async init(): Promise<void> {
		this.logger = getLogger();
		LoggerProxy.init(this.logger);

		await Db.init();
	}

	async finally(): Promise<void> {
		if (inTest) return;

		this.exit();
	}
}
