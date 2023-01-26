import { Request, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import passport from 'passport';
import { Strategy } from 'passport-jwt';
import { Strategy as SamlStrategy } from '@node-saml/passport-saml';
import { LoggerProxy as Logger } from 'n8n-workflow';
import { JwtPayload } from '../Interfaces';
import type { AuthenticatedRequest } from '@/requests';
import config from '@/config';
import { AUTH_COOKIE_NAME } from '@/constants';
import { issueCookie, resolveJwtContent } from '../auth/jwt';
import { UserService } from '@/user/user.service';
import { readFileSync } from 'fs';

const jwtFromRequest = (req: Request) => {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
	return (req.cookies?.[AUTH_COOKIE_NAME] as string | undefined) ?? null;
};

export const jwtAuth = (): void => {
	const jwtStrategy = new Strategy(
		{
			jwtFromRequest,
			secretOrKey: config.getEnv('userManagement.jwtSecret'),
		},
		async (jwtPayload: JwtPayload, done) => {
			try {
				const user = await resolveJwtContent(jwtPayload);
				return done(null, user);
			} catch (error) {
				Logger.debug('Failed to extract user from JWT payload', { jwtPayload });
				return done(null, false, { message: 'User not found' });
			}
		},
	);

	passport.use(jwtStrategy);
};

/**
 * middleware to refresh cookie before it expires
 */
export const refreshExpiringCookie: RequestHandler = async (
	req: AuthenticatedRequest,
	res,
	next,
) => {
	const cookieAuth = jwtFromRequest(req);
	if (cookieAuth && req.user) {
		const cookieContents = jwt.decode(cookieAuth) as JwtPayload & { exp: number };
		if (cookieContents.exp * 1000 - Date.now() < 259200000) {
			// if cookie expires in < 3 days, renew it.
			await issueCookie(res, req.user);
		}
	}
	next();
};

export const samlAuth = (): void => {
	console.log('setting up saml stuff');

	// const privatekey = readFileSync('/home/krynble/Workspace/Projects/n8n/sp-pvt.key.pem', 'utf8');
	// const cert = readFileSync('/home/krynble/Workspace/Projects/n8n/sp-pub.cert.pem', 'utf8');

	const samlStrategy = new SamlStrategy(
		{
			callbackUrl: 'http://localhost:5678/rest/login/saml/callback',
			cert: 'get it from onelogin to use',
			issuer: 'n8n-app',
			entryPoint:
				'https://n8n.onelogin.com/trust/saml2/http-post/sso/90723edb-ae45-48ef-badb-fdf4f380fbcd',
			// signatureAlgorithm: 'sha256',
			// digestAlgorithm: 'sha256',
			// decryptionPvk: privatekey,
			// privateKey: privatekey,
			wantAuthnResponseSigned: false,
			wantAssertionsSigned: false,
			audience: false,
		},
		async function (profile, done) {
			console.log('trying to find a user based on profile', profile, done);
			// @ts-ignore
			if (!profile?.email) {
				// @ts-ignore
				return done(new Error('Email not found in profile'));
			}
			// @ts-ignore
			const user = await UserService.get({ email: profile.email });

			if (!user) {
				// @ts-ignore
				return done(new Error('User not found'));
				// TODO: Provision user.
			}
			// @ts-ignore
			done(null, user as unknown as Record<string, unknown>);
		},
		function (req, profile, done) {
			console.log('received profile for logout', profile);
			// for logout
			// findByNameID(profile.nameID, function (err, user) {
			// 	if (err) {
			// 		return done(err);
			// 	}
			// 	return done(null, user);
			// });
		},
	);

	passport.use(samlStrategy);
};
