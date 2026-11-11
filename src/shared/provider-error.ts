import type { ProviderKind } from './types';

export type ProviderFailureCode =
  | 'unavailable-provider'
  | 'authentication-failed'
  | 'inaccessible-model'
  | 'request-timeout'
  | 'invalid-provider-response'
  | 'request-failed';

export class ProviderError extends Error {
  constructor(
    readonly provider: ProviderKind,
    readonly code: ProviderFailureCode,
    message: string
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
