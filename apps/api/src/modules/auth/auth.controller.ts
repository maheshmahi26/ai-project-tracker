import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  type AuthResult,
  type ForgotPasswordInput,
  type PublicUser,
  type RefreshInput,
  type RegisterInput,
  type ResetPasswordInput,
} from '@ai-projectos/shared';
import { getRequestId } from '../../common/request/request-context';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AppConfigService } from '../../config/config.module';
import { Passthrough } from '../../common/decorators/passthrough.decorator';
import { AppException } from '../../common/errors/app-exception';
import { AuthService, type RequestMeta } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { UsersService } from '../users/users.service';
import type { AuthenticatedUser, RequestWithAuth } from './auth.types';
import { parseDurationToSeconds } from './token.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
    private readonly config: AppConfigService,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Create a local account and start a session' })
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResult> {
    const result = await this.auth.register(body, this.meta(req));
    this.setRefreshCookie(res, result.tokens.refreshToken);
    return result;
  }

  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with email + password' })
  async login(
    // Body is documented for Swagger; LocalStrategy performs the actual check.
    @Body(new ZodValidationPipe(loginSchema)) _body: unknown,
    @Req() req: RequestWithAuth,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResult> {
    const result = await this.auth.login(req.user as AuthenticatedUser, this.meta(req));
    this.setRefreshCookie(res, result.tokens.refreshToken);
    return result;
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate tokens using the refresh token (cookie or body)' })
  async refresh(
    @Body(new ZodValidationPipe(refreshSchema)) body: RefreshInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResult> {
    const token = this.readRefreshToken(req, body);
    const result = await this.auth.refresh(token, this.meta(req));
    this.setRefreshCookie(res, result.tokens.refreshToken);
    return result;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke the current session' })
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ success: true }> {
    await this.auth.logout(user.userId, this.meta(req));
    this.clearRefreshCookie(res);
    return { success: true };
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Email a single-use password reset link' })
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) body: ForgotPasswordInput,
    @Req() req: Request,
  ): Promise<{ success: true }> {
    await this.auth.forgotPassword(body.email, this.meta(req));
    return { success: true };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set a new password using a reset token' })
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordInput,
    @Req() req: Request,
  ): Promise<{ success: true }> {
    await this.auth.resetPassword(body.token, body.password, this.meta(req));
    return { success: true };
  }

  @Get('me')
  @ApiOperation({ summary: 'Get the current authenticated user' })
  getMe(@CurrentUser() user: AuthenticatedUser): Promise<PublicUser> {
    return this.users.getPublicByIdOrThrow(user.userId);
  }

  @Public()
  @UseGuards(GoogleAuthGuard)
  @Get('google')
  @Passthrough()
  @ApiOperation({ summary: 'Begin Google OAuth login' })
  google(): void {
    // Guard redirects to Google; this body never executes.
  }

  @Public()
  @UseGuards(GoogleAuthGuard)
  @Get('google/callback')
  @Passthrough()
  @ApiOperation({ summary: 'Google OAuth callback — sets session cookie and redirects' })
  googleCallback(@Req() req: RequestWithAuth, @Res() res: Response): void {
    const result = req.user as unknown as AuthResult | undefined;
    if (!result) throw AppException.unauthenticated('Google sign-in failed');
    this.setRefreshCookie(res, result.tokens.refreshToken);
    res.redirect(`${this.config.get('WEB_APP_URL')}/auth/callback`);
  }

  private meta(req: Request): RequestMeta {
    return {
      requestId: getRequestId(req),
      ip: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    };
  }

  private readRefreshToken(req: Request, body: RefreshInput): string | undefined {
    const cookieName = this.config.get('REFRESH_COOKIE_NAME');
    const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
    return body.refreshToken ?? cookies?.[cookieName];
  }

  private setRefreshCookie(res: Response, token: string): void {
    res.cookie(this.config.get('REFRESH_COOKIE_NAME'), token, {
      httpOnly: true,
      secure: this.config.isProduction,
      sameSite: 'strict',
      path: '/api/v1/auth',
      maxAge: parseDurationToSeconds(this.config.get('JWT_REFRESH_TTL')) * 1000,
    });
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(this.config.get('REFRESH_COOKIE_NAME'), { path: '/api/v1/auth' });
  }
}
