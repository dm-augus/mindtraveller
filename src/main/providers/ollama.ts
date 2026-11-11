import {
  ProviderContractError,
  parseActionAssessmentResponse,
  parseCheckedNarrationResponse,
  parseModelOptions,
  parseOpeningResponse,
  parseSummaryResponse,
  type ActionAssessmentRequest,
  type ActionAssessmentResponse,
  type CheckedNarrationRequest,
  type CheckedNarrationResponse,
  type OpeningRequest,
  type OpeningResponse,
  type StoryProvider,
  type SummaryRequest,
  type SummaryResponse
} from '../../shared/provider-contract';
import { ProviderError } from '../../shared/provider-error';
import type { ModelOption } from '../../shared/types';
import {
  assessmentMessages,
  checkedNarrationMessages,
  openingMessages,
  summaryMessages,
  type ProviderMessage
} from './story-prompts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeOllamaAddress(input: string): string {
  if (typeof input !== 'string' || !input.trim()) throw new TypeError('Enter an Ollama server address.');
  const address = input.trim();
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(address) ? address : `http://${address}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new TypeError('Enter a valid Ollama server address.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TypeError('Ollama server address must use HTTP or HTTPS.');
  }
  if (!url.hostname || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new TypeError('Ollama server address must be a server origin without credentials or a path.');
  }
  return url.origin;
}

function modelId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError('Select an Ollama model.');
  return value.trim();
}

function chatContent(value: unknown): unknown {
  if (!isRecord(value) || value.done !== true || !isRecord(value.message)
    || value.message.role !== 'assistant' || typeof value.message.content !== 'string') {
    throw new ProviderContractError('Malformed Ollama chat response.');
  }
  try {
    return JSON.parse(value.message.content);
  } catch {
    throw new ProviderContractError('Ollama returned invalid JSON content.');
  }
}

export class OllamaAdapter implements StoryProvider {
  readonly kind = 'ollama' as const;
  readonly address: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(address: string, options: { timeoutMs?: number; fetchImpl?: typeof fetch } = {}) {
    this.address = normalizeOllamaAddress(address);
    this.timeoutMs = options.timeoutMs ?? 120_000;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1) {
      throw new TypeError('Ollama timeout must be a positive number of milliseconds.');
    }
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async request(endpoint: '/api/tags' | '/api/chat', body?: object): Promise<unknown> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    try {
      const response = await this.fetchImpl(new URL(endpoint, this.address), {
        method: body === undefined ? 'GET' : 'POST',
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal
      });
      if (!response.ok) {
        if (endpoint === '/api/chat' && response.status === 404) {
          throw new ProviderError(
            'ollama', 'inaccessible-model',
            'Ollama could not find the selected model. Choose or pull an available model.'
          );
        }
        throw new ProviderError('ollama', 'request-failed', 'Ollama could not complete the request. Try again.');
      }
      try {
        return await response.json();
      } catch (error) {
        if (timedOut) throw error;
        throw new ProviderContractError('Ollama returned invalid JSON.');
      }
    } catch (error) {
      if (error instanceof ProviderError || error instanceof ProviderContractError) throw error;
      if (timedOut) {
        throw new ProviderError('ollama', 'request-timeout', 'Ollama did not respond before the timeout. Retry the request.');
      }
      if (error instanceof TypeError) {
        throw new ProviderError(
          'ollama', 'unavailable-provider',
          'Cannot reach Ollama. Check that the server is running and its address is correct.'
        );
      }
      throw new ProviderError('ollama', 'request-failed', 'Ollama could not complete the request. Try again.');
    } finally {
      clearTimeout(timer);
    }
  }

  async listModels(): Promise<ModelOption[]> {
    const response = await this.request('/api/tags');
    if (!isRecord(response) || !Array.isArray(response.models)) {
      throw new ProviderContractError('Malformed Ollama model list.');
    }
    const models = response.models.map((entry: unknown) => {
      if (!isRecord(entry)) throw new ProviderContractError('Malformed Ollama model option.');
      const id = typeof entry.model === 'string' && entry.model.trim() ? entry.model : entry.name;
      const label = typeof entry.name === 'string' && entry.name.trim() ? entry.name : id;
      return { id, label };
    });
    return parseModelOptions(models);
  }

  private async chat(model: string, messages: ProviderMessage[]): Promise<unknown> {
    const response = await this.request('/api/chat', {
      model: modelId(model),
      messages,
      stream: false,
      format: 'json'
    });
    return chatContent(response);
  }

  async generateOpening(request: OpeningRequest): Promise<OpeningResponse> {
    const content = await this.chat(request.modelId, openingMessages(request));
    return parseOpeningResponse(content, request.choiceTarget);
  }

  async assessAction(request: ActionAssessmentRequest): Promise<ActionAssessmentResponse> {
    const content = await this.chat(request.modelId, assessmentMessages(request));
    return parseActionAssessmentResponse(content, request.choiceTarget, request.attributes);
  }

  async narrateCheck(request: CheckedNarrationRequest): Promise<CheckedNarrationResponse> {
    const content = await this.chat(request.modelId, checkedNarrationMessages(request));
    return parseCheckedNarrationResponse(content, request.choiceTarget, request.check.outcome);
  }

  async summarize(request: SummaryRequest): Promise<SummaryResponse> {
    const content = await this.chat(request.modelId, summaryMessages(request));
    return parseSummaryResponse(content);
  }
}
