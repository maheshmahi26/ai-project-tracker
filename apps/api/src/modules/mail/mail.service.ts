import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { AppConfigService } from '../../config/config.module';

export const EMAIL_QUEUE = 'email';

export interface PasswordResetEmailJob {
  type: 'password_reset';
  to: string;
  resetLink: string;
}

/**
 * Enqueues transactional emails onto the BullMQ `email` queue; the worker process
 * actually "sends" them (console transport in dev). Kept behind this interface so
 * AuthService never touches the queue directly and tests can fake it.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    @InjectQueue(EMAIL_QUEUE) private readonly queue: Queue,
    private readonly config: AppConfigService,
  ) {}

  async sendPasswordReset(to: string, token: string): Promise<void> {
    const resetLink = `${this.config.get('WEB_APP_URL')}/reset-password?token=${encodeURIComponent(token)}`;
    await this.queue.add(
      'password_reset',
      { type: 'password_reset', to, resetLink },
      { attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: true },
    );
    this.logger.debug(`Queued password-reset email for ${to}`);
  }
}
