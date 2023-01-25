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
			cert: 'MIICmzCCAYMCBgGFoTGBXjANBgkqhkiG9w0BAQsFADARMQ8wDQYDVQQDDAZuOG5hcHAwHhcNMjMwMTExMTQxNTU0WhcNMzMwMTExMTQxNzM0WjARMQ8wDQYDVQQDDAZuOG5hcHAwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDbCr9sxmIqOBIK1h0K+ztpjDjJjwMVLlu+2bTWPO9zipjQGNGxPFW7Pmv16Xoaw2BrtdUj5Qn133tUvXVgLm4LY0bGW63M0D4XeG/Ti6H2mmgyD8Ad/R/14KE8PD5Dpdv/HG/4DPWxMMgbVPhHwYFSRXy+0+HKTCPNFPEJ1BnN9P/J4NgiPrrX2Hk1EHL8qRnWFBbcBMc3BnStUGbKg18vXVVu08gqhLukqUdRg4eNJuwAjSK7fyi3y6NWH+KH4sPKqWcC9KjcmtJyoU5MyKriG3qMoCvdFyd2Z32v+eCujG8rztjti8FLPesVGvsHt961WHMqEpKwMe434UjPKpdXAgMBAAEwDQYJKoZIhvcNAQELBQADggEBAEFOjylC8xOobkh6o8c69g+bOkASfUsxuYD9C4tinP9zN/D+zoxtQOC2GYxQeaV7QOikK5gPizt1Wzd86VRg29RAXWdkPoF3m5n0zQkQWX80b9ZV4QTiCTpWUOZu3VJ0WHUuWjFv8sMmTOaGJxskP3b2ID3CgekwW3ywZ+8rae5s1zVLcsJ6VHF/ScdV/ZGsFsOY5oopECI51MdiI2HK+ahzprPCC7lCiGfotqtZxtojQsxkoEVJjBkerGmqPSrPhag8HTCSSaWWpPAmg40IDlkXYpjWXRrr4L2aXA37zuBd+u9fa1FrYxk4Ijr/54+tU57IJWWAq2tDUYgn0cW2G/I=',
			issuer: 'n8napp',
			entryPoint: 'http://localhost:8080/realms/n8nio/protocol/saml',
			signatureAlgorithm: 'sha256',
			digestAlgorithm: 'sha256',
			// decryptionPvk: privatekey,
			// privateKey: privatekey,
		},
		async function (req, profile, done) {
			console.log('trying to find a user based on profile', profile);
			if (!profile?.email) {
				return done(new Error('Email not found in profile'));
			}

			const user = await UserService.get({ email: profile.email });

			if (!user) {
				return done(new Error('User not found'));
				// TODO: Provision user.
			}

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
