import { randomBytes } from 'crypto';
import { existsSync } from 'fs';

import express from 'express';
import superagent from 'superagent';
import request from 'supertest';
import { URL } from 'url';
import bodyParser from 'body-parser';
import util from 'util';
import { createTestAccount } from 'nodemailer';
import { set } from 'lodash';
import { CronJob } from 'cron';
import { BinaryDataManager, UserSettings } from 'n8n-core';
import {
	ICredentialType,
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeParameters,
	INodeTypeData,
	INodeTypes,
	ITriggerFunctions,
	ITriggerResponse,
	LoggerProxy,
} from 'n8n-workflow';

import config from '../../../config';
import { AUTHLESS_ENDPOINTS, PUBLIC_API_REST_PATH_SEGMENT, REST_PATH_SEGMENT } from './constants';
import { AUTH_COOKIE_NAME } from '../../../src/constants';
import { addRoutes as authMiddleware } from '../../../src/UserManagement/routes';
import {
	ActiveWorkflowRunner,
	CredentialTypes,
	Db,
	ExternalHooks,
	InternalHooksManager,
	NodeTypes,
} from '../../../src';
import { meNamespace as meEndpoints } from '../../../src/UserManagement/routes/me';
import { usersNamespace as usersEndpoints } from '../../../src/UserManagement/routes/users';
import { authenticationMethods as authEndpoints } from '../../../src/UserManagement/routes/auth';
import { ownerNamespace as ownerEndpoints } from '../../../src/UserManagement/routes/owner';
import { passwordResetNamespace as passwordResetEndpoints } from '../../../src/UserManagement/routes/passwordReset';
import { issueJWT } from '../../../src/UserManagement/auth/jwt';
import { getLogger } from '../../../src/Logger';
import { credentialsController } from '../../../src/credentials/credentials.controller';
import { loadPublicApiVersions } from '../../../src/PublicApi/';
import * as UserManagementMailer from '../../../src/UserManagement/email/UserManagementMailer';
import type { User } from '../../../src/databases/entities/User';
import type {
	ApiPath,
	EndpointGroup,
	PostgresSchemaSection,
	SmtpTestAccount,
	TriggerTime,
} from './types';
import type { N8nApp } from '../../../src/UserManagement/Interfaces';

/**
 * Initialize a test server.
 *
 * @param applyAuth Whether to apply auth middleware to test server.
 * @param endpointGroups Groups of endpoints to apply to test server.
 */
export async function initTestServer({
	applyAuth,
	endpointGroups,
}: {
	applyAuth: boolean;
	endpointGroups?: EndpointGroup[];
}) {
	const testServer = {
		app: express(),
		restEndpoint: REST_PATH_SEGMENT,
		publicApiEndpoint: PUBLIC_API_REST_PATH_SEGMENT,
		externalHooks: {},
	};

	testServer.app.use(bodyParser.json());
	testServer.app.use(bodyParser.urlencoded({ extended: true }));

	config.set('userManagement.jwtSecret', 'My JWT secret');
	config.set('userManagement.isInstanceOwnerSetUp', false);

	if (applyAuth) {
		authMiddleware.apply(testServer, [AUTHLESS_ENDPOINTS, REST_PATH_SEGMENT]);
	}

	if (!endpointGroups) return testServer.app;

	if (endpointGroups.includes('credentials')) {
		testServer.externalHooks = ExternalHooks();
	}

	const [routerEndpoints, functionEndpoints] = classifyEndpointGroups(endpointGroups);

	if (routerEndpoints.length) {
		const { apiRouters } = await loadPublicApiVersions(testServer.publicApiEndpoint);
		const map: Record<string, express.Router | express.Router[]> = {
			credentials: credentialsController,
			publicApi: apiRouters,
		};

		for (const group of routerEndpoints) {
			if (group === 'publicApi') {
				testServer.app.use(...(map[group] as express.Router[]));
			} else {
				testServer.app.use(`/${testServer.restEndpoint}/${group}`, map[group]);
			}
		}
	}

	if (functionEndpoints.length) {
		const map: Record<string, (this: N8nApp) => void> = {
			me: meEndpoints,
			users: usersEndpoints,
			auth: authEndpoints,
			owner: ownerEndpoints,
			passwordReset: passwordResetEndpoints,
		};

		for (const group of functionEndpoints) {
			map[group].apply(testServer);
		}
	}

	return testServer.app;
}

/**
 * Pre-requisite: Mock the telemetry module before calling.
 */
export function initTestTelemetry() {
	const mockNodeTypes = { nodeTypes: {} } as INodeTypes;

	void InternalHooksManager.init('test-instance-id', 'test-version', mockNodeTypes);
}

/**
 * Classify endpoint groups into `routerEndpoints` (newest, using `express.Router`),
 * and `functionEndpoints` (legacy, namespaced inside a function).
 */
const classifyEndpointGroups = (endpointGroups: string[]) => {
	const routerEndpoints: string[] = [];
	const functionEndpoints: string[] = [];

	endpointGroups.forEach((group) =>
		(group === 'credentials' || group === 'publicApi' ? routerEndpoints : functionEndpoints).push(
			group,
		),
	);

	return [routerEndpoints, functionEndpoints];
};

// ----------------------------------
//          initializers
// ----------------------------------

/**
 * Initialize node types.
 */
export async function initActiveWorkflowRunner(): Promise<ActiveWorkflowRunner.ActiveWorkflowRunner> {
	const workflowRunner = ActiveWorkflowRunner.getInstance();
	workflowRunner.init();
	return workflowRunner;
}

export function gitHubCredentialType(): ICredentialType {
	return {
		name: 'githubApi',
		displayName: 'Github API',
		documentationUrl: 'github',
		properties: [
			{
				displayName: 'Github Server',
				name: 'server',
				type: 'string',
				default: 'https://api.github.com',
				description: 'The server to connect to. Only has to be set if Github Enterprise is used.',
			},
			{
				displayName: 'User',
				name: 'user',
				type: 'string',
				default: '',
			},
			{
				displayName: 'Access Token',
				name: 'accessToken',
				type: 'string',
				default: '',
			},
		],
	};
}

/**
 * Initialize node types.
 */
export async function initCredentialsTypes(): Promise<void> {
	const credentialTypes = CredentialTypes();
	await credentialTypes.init({
		githubApi: {
			type: gitHubCredentialType(),
			sourcePath: '',
		},
	});
}

/**
 * Initialize node types.
 */
export async function initNodeTypes() {
	const types: INodeTypeData = {
		'n8n-nodes-base.start': {
			sourcePath: '',
			type: {
				description: {
					displayName: 'Start',
					name: 'start',
					group: ['input'],
					version: 1,
					description: 'Starts the workflow execution from this node',
					defaults: {
						name: 'Start',
						color: '#553399',
					},
					inputs: [],
					outputs: ['main'],
					properties: [],
				},
				execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
					const items = this.getInputData();

					return this.prepareOutputData(items);
				},
			},
		},
		'n8n-nodes-base.cron': {
			sourcePath: '',
			type: {
				description: {
					displayName: 'Cron',
					name: 'cron',
					icon: 'fa:calendar',
					group: ['trigger', 'schedule'],
					version: 1,
					description: 'Triggers the workflow at a specific time',
					eventTriggerDescription: '',
					activationMessage:
						'Your cron trigger will now trigger executions on the schedule you have defined.',
					defaults: {
						name: 'Cron',
						color: '#00FF00',
					},
					inputs: [],
					outputs: ['main'],
					properties: [
						{
							displayName: 'Trigger Times',
							name: 'triggerTimes',
							type: 'fixedCollection',
							typeOptions: {
								multipleValues: true,
								multipleValueButtonText: 'Add Time',
							},
							default: {},
							description: 'Triggers for the workflow',
							placeholder: 'Add Cron Time',
							options: [
								{
									name: 'item',
									displayName: 'Item',
									values: [
										{
											displayName: 'Mode',
											name: 'mode',
											type: 'options',
											options: [
												{
													name: 'Every Minute',
													value: 'everyMinute',
												},
												{
													name: 'Every Hour',
													value: 'everyHour',
												},
												{
													name: 'Every Day',
													value: 'everyDay',
												},
												{
													name: 'Every Week',
													value: 'everyWeek',
												},
												{
													name: 'Every Month',
													value: 'everyMonth',
												},
												{
													name: 'Every X',
													value: 'everyX',
												},
												{
													name: 'Custom',
													value: 'custom',
												},
											],
											default: 'everyDay',
											description: 'How often to trigger.',
										},
										{
											displayName: 'Hour',
											name: 'hour',
											type: 'number',
											typeOptions: {
												minValue: 0,
												maxValue: 23,
											},
											displayOptions: {
												hide: {
													mode: ['custom', 'everyHour', 'everyMinute', 'everyX'],
												},
											},
											default: 14,
											description: 'The hour of the day to trigger (24h format).',
										},
										{
											displayName: 'Minute',
											name: 'minute',
											type: 'number',
											typeOptions: {
												minValue: 0,
												maxValue: 59,
											},
											displayOptions: {
												hide: {
													mode: ['custom', 'everyMinute', 'everyX'],
												},
											},
											default: 0,
											description: 'The minute of the day to trigger.',
										},
										{
											displayName: 'Day of Month',
											name: 'dayOfMonth',
											type: 'number',
											displayOptions: {
												show: {
													mode: ['everyMonth'],
												},
											},
											typeOptions: {
												minValue: 1,
												maxValue: 31,
											},
											default: 1,
											description: 'The day of the month to trigger.',
										},
										{
											displayName: 'Weekday',
											name: 'weekday',
											type: 'options',
											displayOptions: {
												show: {
													mode: ['everyWeek'],
												},
											},
											options: [
												{
													name: 'Monday',
													value: '1',
												},
												{
													name: 'Tuesday',
													value: '2',
												},
												{
													name: 'Wednesday',
													value: '3',
												},
												{
													name: 'Thursday',
													value: '4',
												},
												{
													name: 'Friday',
													value: '5',
												},
												{
													name: 'Saturday',
													value: '6',
												},
												{
													name: 'Sunday',
													value: '0',
												},
											],
											default: '1',
											description: 'The weekday to trigger.',
										},
										{
											displayName: 'Cron Expression',
											name: 'cronExpression',
											type: 'string',
											displayOptions: {
												show: {
													mode: ['custom'],
												},
											},
											default: '* * * * * *',
											description:
												'Use custom cron expression. Values and ranges as follows:<ul><li>Seconds: 0-59</li><li>Minutes: 0 - 59</li><li>Hours: 0 - 23</li><li>Day of Month: 1 - 31</li><li>Months: 0 - 11 (Jan - Dec)</li><li>Day of Week: 0 - 6 (Sun - Sat)</li></ul>.',
										},
										{
											displayName: 'Value',
											name: 'value',
											type: 'number',
											typeOptions: {
												minValue: 0,
												maxValue: 1000,
											},
											displayOptions: {
												show: {
													mode: ['everyX'],
												},
											},
											default: 2,
											description: 'All how many X minutes/hours it should trigger.',
										},
										{
											displayName: 'Unit',
											name: 'unit',
											type: 'options',
											displayOptions: {
												show: {
													mode: ['everyX'],
												},
											},
											options: [
												{
													name: 'Minutes',
													value: 'minutes',
												},
												{
													name: 'Hours',
													value: 'hours',
												},
											],
											default: 'hours',
											description: 'If it should trigger all X minutes or hours.',
										},
									],
								},
							],
						},
					],
				},
				async trigger(this: ITriggerFunctions): Promise<ITriggerResponse> {
					const triggerTimes = this.getNodeParameter('triggerTimes') as unknown as {
						item: TriggerTime[];
					};

					// Define the order the cron-time-parameter appear
					const parameterOrder = [
						'second', // 0 - 59
						'minute', // 0 - 59
						'hour', // 0 - 23
						'dayOfMonth', // 1 - 31
						'month', // 0 - 11(Jan - Dec)
						'weekday', // 0 - 6(Sun - Sat)
					];

					// Get all the trigger times
					const cronTimes: string[] = [];
					let cronTime: string[];
					let parameterName: string;
					if (triggerTimes.item !== undefined) {
						for (const item of triggerTimes.item) {
							cronTime = [];
							if (item.mode === 'custom') {
								cronTimes.push(item.cronExpression as string);
								continue;
							}
							if (item.mode === 'everyMinute') {
								cronTimes.push(`${Math.floor(Math.random() * 60).toString()} * * * * *`);
								continue;
							}
							if (item.mode === 'everyX') {
								if (item.unit === 'minutes') {
									cronTimes.push(
										`${Math.floor(Math.random() * 60).toString()} */${item.value} * * * *`,
									);
								} else if (item.unit === 'hours') {
									cronTimes.push(
										`${Math.floor(Math.random() * 60).toString()} 0 */${item.value} * * *`,
									);
								}
								continue;
							}

							for (parameterName of parameterOrder) {
								if (item[parameterName] !== undefined) {
									// Value is set so use it
									cronTime.push(item[parameterName] as string);
								} else if (parameterName === 'second') {
									// For seconds we use by default a random one to make sure to
									// balance the load a little bit over time
									cronTime.push(Math.floor(Math.random() * 60).toString());
								} else {
									// For all others set "any"
									cronTime.push('*');
								}
							}

							cronTimes.push(cronTime.join(' '));
						}
					}

					// The trigger function to execute when the cron-time got reached
					// or when manually triggered
					const executeTrigger = () => {
						this.emit([this.helpers.returnJsonArray([{}])]);
					};

					const timezone = this.getTimezone();

					// Start the cron-jobs
					const cronJobs: CronJob[] = [];
					for (const cronTime of cronTimes) {
						cronJobs.push(new CronJob(cronTime, executeTrigger, undefined, true, timezone));
					}

					// Stop the cron-jobs
					async function closeFunction() {
						for (const cronJob of cronJobs) {
							cronJob.stop();
						}
					}

					async function manualTriggerFunction() {
						executeTrigger();
					}

					return {
						closeFunction,
						manualTriggerFunction,
					};
				},
			},
		},
		'n8n-nodes-base.set': {
			sourcePath: '',
			type: {
				description: {
					displayName: 'Set',
					name: 'set',
					icon: 'fa:pen',
					group: ['input'],
					version: 1,
					description: 'Sets values on items and optionally remove other values',
					defaults: {
						name: 'Set',
						color: '#0000FF',
					},
					inputs: ['main'],
					outputs: ['main'],
					properties: [
						{
							displayName: 'Keep Only Set',
							name: 'keepOnlySet',
							type: 'boolean',
							default: false,
							description:
								'If only the values set on this node should be kept and all others removed.',
						},
						{
							displayName: 'Values to Set',
							name: 'values',
							placeholder: 'Add Value',
							type: 'fixedCollection',
							typeOptions: {
								multipleValues: true,
								sortable: true,
							},
							description: 'The value to set.',
							default: {},
							options: [
								{
									name: 'boolean',
									displayName: 'Boolean',
									values: [
										{
											displayName: 'Name',
											name: 'name',
											type: 'string',
											default: 'propertyName',
											description:
												'Name of the property to write data to. Supports dot-notation. Example: "data.person[0].name"',
										},
										{
											displayName: 'Value',
											name: 'value',
											type: 'boolean',
											default: false,
											description: 'The boolean value to write in the property.',
										},
									],
								},
								{
									name: 'number',
									displayName: 'Number',
									values: [
										{
											displayName: 'Name',
											name: 'name',
											type: 'string',
											default: 'propertyName',
											description:
												'Name of the property to write data to. Supports dot-notation. Example: "data.person[0].name"',
										},
										{
											displayName: 'Value',
											name: 'value',
											type: 'number',
											default: 0,
											description: 'The number value to write in the property.',
										},
									],
								},
								{
									name: 'string',
									displayName: 'String',
									values: [
										{
											displayName: 'Name',
											name: 'name',
											type: 'string',
											default: 'propertyName',
											description:
												'Name of the property to write data to. Supports dot-notation. Example: "data.person[0].name"',
										},
										{
											displayName: 'Value',
											name: 'value',
											type: 'string',
											default: '',
											description: 'The string value to write in the property.',
										},
									],
								},
							],
						},

						{
							displayName: 'Options',
							name: 'options',
							type: 'collection',
							placeholder: 'Add Option',
							default: {},
							options: [
								{
									displayName: 'Dot Notation',
									name: 'dotNotation',
									type: 'boolean',
									default: true,
									description: `<p>By default, dot-notation is used in property names. This means that "a.b" will set the property "b" underneath "a" so { "a": { "b": value} }.<p></p>If that is not intended this can be deactivated, it will then set { "a.b": value } instead.</p>
									`,
								},
							],
						},
					],
				},
				execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
					const items = this.getInputData();

					if (items.length === 0) {
						items.push({ json: {} });
					}

					const returnData: INodeExecutionData[] = [];

					let item: INodeExecutionData;
					let keepOnlySet: boolean;
					for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
						keepOnlySet = this.getNodeParameter('keepOnlySet', itemIndex, false) as boolean;
						item = items[itemIndex];
						const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;

						const newItem: INodeExecutionData = {
							json: {},
						};

						if (keepOnlySet !== true) {
							if (item.binary !== undefined) {
								// Create a shallow copy of the binary data so that the old
								// data references which do not get changed still stay behind
								// but the incoming data does not get changed.
								newItem.binary = {};
								Object.assign(newItem.binary, item.binary);
							}

							newItem.json = JSON.parse(JSON.stringify(item.json));
						}

						// Add boolean values
						(this.getNodeParameter('values.boolean', itemIndex, []) as INodeParameters[]).forEach(
							(setItem) => {
								if (options.dotNotation === false) {
									newItem.json[setItem.name as string] = !!setItem.value;
								} else {
									set(newItem.json, setItem.name as string, !!setItem.value);
								}
							},
						);

						// Add number values
						(this.getNodeParameter('values.number', itemIndex, []) as INodeParameters[]).forEach(
							(setItem) => {
								if (options.dotNotation === false) {
									newItem.json[setItem.name as string] = setItem.value;
								} else {
									set(newItem.json, setItem.name as string, setItem.value);
								}
							},
						);

						// Add string values
						(this.getNodeParameter('values.string', itemIndex, []) as INodeParameters[]).forEach(
							(setItem) => {
								if (options.dotNotation === false) {
									newItem.json[setItem.name as string] = setItem.value;
								} else {
									set(newItem.json, setItem.name as string, setItem.value);
								}
							},
						);

						returnData.push(newItem);
					}

					return this.prepareOutputData(returnData);
				},
			},
		},
	};

	await NodeTypes().init(types);
}

/**
 * Initialize a logger for test runs.
 */
export function initTestLogger() {
	LoggerProxy.init(getLogger());
}

/**
 * Initialize a BinaryManager for test runs.
 */
export async function initBinaryManager() {
	const binaryDataConfig = config.getEnv('binaryDataManager');
	await BinaryDataManager.init(binaryDataConfig);
}

/**
 * Initialize a user settings config file if non-existent.
 */
export function initConfigFile() {
	const settingsPath = UserSettings.getUserSettingsPath();

	if (!existsSync(settingsPath)) {
		const userSettings = { encryptionKey: randomBytes(24).toString('base64') };
		UserSettings.writeUserSettings(userSettings, settingsPath);
	}
}

// ----------------------------------
//           request agent
// ----------------------------------

/**
 * Create a request agent, optionally with an auth cookie.
 */
export function createAgent(
	app: express.Application,
	options?: { auth: boolean; user: User; apiPath?: ApiPath; version?: string | number },
) {
	const agent = request.agent(app);

	if (options?.apiPath === undefined || options?.apiPath === 'internal') {
		agent.use(prefix(REST_PATH_SEGMENT));
		if (options?.auth && options?.user) {
			const { token } = issueJWT(options.user);
			agent.jar.setCookie(`${AUTH_COOKIE_NAME}=${token}`);
		}
	}

	if (options?.apiPath === 'public') {
		agent.use(prefix(`${PUBLIC_API_REST_PATH_SEGMENT}/v${options?.version}`));

		if (options?.auth && options?.user.apiKey) {
			agent.set({ 'X-N8N-API-KEY': options.user.apiKey });
		}
	}

	return agent;
}

export function createAuthAgent(app: express.Application) {
	return (user: User) => createAgent(app, { auth: true, user });
}

/**
 * Plugin to prefix a path segment into a request URL pathname.
 *
 * Example: http://127.0.0.1:62100/me/password → http://127.0.0.1:62100/rest/me/password
 */
export function prefix(pathSegment: string) {
	return function (request: superagent.SuperAgentRequest) {
		const url = new URL(request.url);

		// enforce consistency at call sites
		if (url.pathname[0] !== '/') {
			throw new Error('Pathname must start with a forward slash');
		}

		url.pathname = pathSegment + url.pathname;
		request.url = url.toString();
		return request;
	};
}

/**
 * Extract the value (token) of the auth cookie in a response.
 */
export function getAuthToken(response: request.Response, authCookieName = AUTH_COOKIE_NAME) {
	const cookies: string[] = response.headers['set-cookie'];

	if (!cookies) return undefined;

	const authCookie = cookies.find((c) => c.startsWith(`${authCookieName}=`));

	if (!authCookie) return undefined;

	const match = authCookie.match(new RegExp(`(^| )${authCookieName}=(?<token>[^;]+)`));

	if (!match || !match.groups) return undefined;

	return match.groups.token;
}

// ----------------------------------
//            settings
// ----------------------------------

export async function isInstanceOwnerSetUp() {
	const { value } = await Db.collections.Settings.findOneOrFail({
		key: 'userManagement.isInstanceOwnerSetUp',
	});

	return Boolean(value);
}

// ----------------------------------
//              SMTP
// ----------------------------------

/**
 * Get an SMTP test account from https://ethereal.email to test sending emails.
 */
const getSmtpTestAccount = util.promisify<SmtpTestAccount>(createTestAccount);

export async function configureSmtp() {
	const {
		user,
		pass,
		smtp: { host, port, secure },
	} = await getSmtpTestAccount();

	config.set('userManagement.emails.mode', 'smtp');
	config.set('userManagement.emails.smtp.host', host);
	config.set('userManagement.emails.smtp.port', port);
	config.set('userManagement.emails.smtp.secure', secure);
	config.set('userManagement.emails.smtp.auth.user', user);
	config.set('userManagement.emails.smtp.auth.pass', pass);
}

export async function isTestSmtpServiceAvailable() {
	try {
		await configureSmtp();
		await UserManagementMailer.getInstance();
		return true;
	} catch (_) {
		return false;
	}
}

export function skipSmtpTest(expect: jest.Expect) {
	console.warn(`SMTP service unavailable - Skipping test ${expect.getState().currentTestName}`);
	return;
}

// ----------------------------------
//              misc
// ----------------------------------

/**
 * Categorize array items into two groups based on whether they pass a test.
 */
export const categorize = <T>(arr: T[], test: (str: T) => boolean) => {
	return arr.reduce<{ pass: T[]; fail: T[] }>(
		(acc, cur) => {
			test(cur) ? acc.pass.push(cur) : acc.fail.push(cur);

			return acc;
		},
		{ pass: [], fail: [] },
	);
};

export function getPostgresSchemaSection(
	schema = config.getSchema(),
): PostgresSchemaSection | null {
	for (const [key, value] of Object.entries(schema)) {
		if (key === 'postgresdb') {
			return value._cvtProperties;
		}
	}

	return null;
}
