import { ProviderContractError } from '../../shared/provider-contract';
import { ProviderError } from '../../shared/provider-error';
import type { ProviderKind } from '../../shared/types';

// One initial generation and at most two retries, including response validation.
const MAX_RESPONSE_ATTEMPTS = 3;

export async function withResponseRetries<T>(
  provider: ProviderKind,
  generateAndValidate: () => Promise<T>
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await generateAndValidate();
    } catch (error) {
      // Transport, authentication, and configuration errors keep their own feedback.
      if (!(error instanceof ProviderContractError)) throw error;
      if (attempt === MAX_RESPONSE_ATTEMPTS) {
        // Do not attach raw provider output or errors, which may contain secrets.
        throw new ProviderError(
          provider, 'invalid-provider-response',
          'The model returned invalid or incomplete output after 3 attempts. Retry the operation or choose another model in Settings.'
        );
      }
    }
  }
}
