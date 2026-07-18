import { Injectable } from '@nestjs/common';

/**
 * Injectable clock so temporal recall ("yesterday") is deterministic in tests.
 * Production uses the real time; tests can bind a fixed instant.
 */
@Injectable()
export class Clock {
  now(): Date {
    return new Date();
  }
}
