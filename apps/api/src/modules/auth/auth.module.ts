import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AppConfigService } from '../../config/config.module';
import { MailModule } from '../mail/mail.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { GoogleStrategy } from './strategies/google.strategy';

@Module({
  imports: [
    UsersModule,
    MailModule,
    PassportModule,
    // Secrets/TTLs are supplied per-sign in TokenService, so no static config here.
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    TokenService,
    JwtStrategy,
    LocalStrategy,
    JwtAuthGuard,
    LocalAuthGuard,
    GoogleAuthGuard,
    {
      // Register Google OAuth only when configured to avoid a boot-time crash.
      provide: GoogleStrategy,
      useFactory: (config: AppConfigService, auth: AuthService) =>
        config.get('GOOGLE_CLIENT_ID') && config.get('GOOGLE_CLIENT_SECRET')
          ? new GoogleStrategy(config, auth)
          : undefined,
      inject: [AppConfigService, AuthService],
    },
  ],
  exports: [AuthService, TokenService, PasswordService],
})
export class AuthModule {}
