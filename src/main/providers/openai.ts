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

const API_BASE = 'https://api.openai.com/v1/';

export interface OpenAiKeySource {
  getOpenAiKeyForRequest(): Promise<string | null>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function modelId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError('Select an OpenAI model.');
  return value.trim();
}

function responseContent(value: unknown): unknown {
  if (!isRecord(value) || value.status !== 'completed' || !Array.isArray(value.output)) {
    throw new ProviderContractError('OpenAI did not return a completed response.');
  }
  const messages = value.output.filter((item: unknown) =>
    isRecord(item) && item.type === 'message' && item.role === 'assistant'
  );
  if (messages.length !== 1 || !isRecord(messages[0]) || !Array.isArray(messages[0].content)) {
    throw new ProviderContractError('Malformed OpenAI response.');
  }
  const content = messages[0].content;
  if (content.length !== 1 || !isRecord(content[0])
    || content[0].type !== 'output_text' || typeof content[0].text !== 'string') {
    throw new ProviderContractError('OpenAI did not return story text.');
  }
  try {
    return JSON.parse(content[0].text);
  } catch {
    throw new ProviderContractError('OpenAI returned invalid JSON content.');
  }
}

export class OpenAiAdapter implements StoryProvider {
  readonly kind = 'openai' as const;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly keySource: OpenAiKeySource,
    options: { timeoutMs?: number; fetchImpl?: typeof fetch } = {}
  ) {
    this.timeoutMs = options.timeoutMs ?? 120_000;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1) {
      throw new TypeError('OpenAI timeout must be a positive number of milliseconds.');
    }
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async key(): Promise<string> {
    let value: string | null;
    try {
      value = await this.keySource.getOpenAiKeyForRequest();
    } catch {
      throw new ProviderError('openai', 'authentication-failed', 'Unable to unlock the OpenAI key. Re-enter it in Settings.');
    }
    if (typeof value !== 'string' || !value.trim() || /[\x00-\x1f\x7f]/.test(value.trim())) {
      throw new ProviderError('openai', 'authentication-failed', 'Enter an OpenAI API key in Settings.');
    }
    return value.trim();
  }

  private async request(endpoint: 'models' | 'responses', body?: object): Promise<unknown> {
    const key = await this.key();
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    try {
      const response = await this.fetchImpl(new URL(endpoint, API_BASE), {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          authorization: `Bearer ${key}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' })
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new ProviderError('openai', 'authentication-failed', 'OpenAI rejected the key or its permissions. Check it in Settings.');
        }
        if (endpoint === 'responses' && response.status === 404) {
          throw new ProviderError('openai', 'inaccessible-model', 'OpenAI cannot access the selected model. Choose another model in Settings.');
        }
        throw new ProviderError('openai', 'request-failed', 'OpenAI could not complete the request. Try again.');
      }
      try {
        return await response.json();
      } catch (error) {
        if (timedOut) throw error;
        throw new ProviderContractError('OpenAI returned invalid JSON.');
      }
    } catch (error) {
      if (error instanceof ProviderError || error instanceof ProviderContractError) throw error;
      if (timedOut) {
        throw new ProviderError('openai', 'request-timeout', 'OpenAI did not respond before the timeout. Retry the request.');
      }
      if (error instanceof TypeError) {
        throw new ProviderError('openai', 'unavailable-provider', 'Cannot reach OpenAI. Check the network connection and retry.');
      }
      throw new ProviderError('openai', 'request-failed', 'OpenAI could not complete the request. Try again.');
    } finally {
      clearTimeout(timer);
    }
  }

  async listModels(): Promise<ModelOption[]> {
    const response = await this.request('models');
    if (!isRecord(response) || !Array.isArray(response.data)) {
      throw new ProviderContractError('Malformed OpenAI model list.');
    }
    return parseModelOptions(response.data.map((item: unknown) => {
      if (!isRecord(item)) throw new ProviderContractError('Malformed OpenAI model option.');
      return { id: item.id, label: item.id };
    }));
  }

  private async generate(model: string, messages: ProviderMessage[]): Promise<unknown> {
    const response = await this.request('responses', {
      model: modelId(model),
      input: messages,
      text: { format: { type: 'json_object' } },
      store: false
    });
    return responseContent(response);
  }

  async generateOpening(request: OpeningRequest): Promise<OpeningResponse> {
    return parseOpeningResponse(
      await this.generate(request.modelId, openingMessages(request)), request.choiceTarget
    );
  }

  async assessAction(request: ActionAssessmentRequest): Promise<ActionAssessmentResponse> {
    return parseActionAssessmentResponse(
      await this.generate(request.modelId, assessmentMessages(request)),
      request.choiceTarget, request.attributes
    );
  }

  async narrateCheck(request: CheckedNarrationRequest): Promise<CheckedNarrationResponse> {
    return parseCheckedNarrationResponse(
      await this.generate(request.modelId, checkedNarrationMessages(request)),
      request.choiceTarget, request.check.outcome
    );
  }

  async summarize(request: SummaryRequest): Promise<SummaryResponse> {
    return parseSummaryResponse(await this.generate(request.modelId, summaryMessages(request)));
  }
}
