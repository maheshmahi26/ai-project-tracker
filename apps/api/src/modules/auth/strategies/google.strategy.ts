import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20';
import { AppConfigService } from '../../../config/config.module';
import { AuthService } from '../auth.service';

/**
 * Registered only when GOOGLE_CLIENT_ID/SECRET are configured (see AuthModule
 * factory). validate() provisions/links the user and returns the full AuthResult
 * as req.user, which the callback controller turns into a cookie + redirect.
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    config: AppConfigService,
    private readonly auth: AuthService,
  ) {
    super({
      clientID: config.get('GOOGLE_CLIENT_ID') as string,
      clientSecret: config.get('GOOGLE_CLIENT_SECRET') as string,
      callbackURL: config.get('GOOGLE_CALLBACK_URL'),
      scope: ['email', 'profile'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): Promise<void> {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      done(new Error('Google account has no email'), undefined);
      return;
    }
    try {
      const result = await this.auth.loginWithGoogleProfile(
        {
          googleId: profile.id,
          email,
          name: profile.displayName || email,
          avatarUrl: profile.photos?.[0]?.value ?? null,
        },
        {},
      );
      done(null, result);
    } catch (error) {
      done(error as Error, undefined);
    }
  }
}
