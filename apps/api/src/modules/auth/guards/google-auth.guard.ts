import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';
import { AppException } from '../../../common/errors/app-exception';
import { AppConfigService } from '../../../config/config.module';

/** Triggers GoogleStrategy; fails clearly when OAuth is not configured. */
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  constructor(private readonly config: AppConfigService) {
    super();
  }

  override canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    if (!this.config.get('GOOGLE_CLIENT_ID') || !this.config.get('GOOGLE_CLIENT_SECRET')) {
      throw AppException.businessRule('Google sign-in is not configured on this server');
    }
    return super.canActivate(context);
  }
}
