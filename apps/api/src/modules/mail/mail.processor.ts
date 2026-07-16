import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { AppConfigService } from '../../config/config.module';
import { EMAIL_QUEUE, type PasswordResetEmailJob } from './mail.service';

/**
 * Consumes the `email` queue. In dev (MAIL_TRANSPORT=console) it prints the email
 * to the log; SMTP delivery is wired here when MAIL_TRANSPORT=smtp (later task).
 */
@Processor(EMAIL_QUEUE)
export class MailProcessor extends WorkerHost {
  private readonly logger = new Logger(MailProcessor.name);

  constructor(private readonly config: AppConfigService) {
    super();
  }

  async process(job: Job<PasswordResetEmailJob>): Promise<void> {
    const { to, resetLink } = job.data;
    if (this.config.get('MAIL_TRANSPORT') === 'console') {
      this.logger.log(
        `[console mail] To: ${to} — Reset your password: ${resetLink} (from ${this.config.get('MAIL_FROM')})`,
      );
      return;
    }
    // SMTP transport is implemented in a later task.
    this.logger.warn(`SMTP transport not implemented; skipped email to ${to}`);
  }
}
