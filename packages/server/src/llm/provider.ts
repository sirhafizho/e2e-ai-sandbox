import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import type { LanguageModel } from 'ai';
import type { LLMProviderConfig } from '@forge/shared';

/**
 * Create a Vercel AI SDK language model from a provider config.
 *
 * Supported providers:
 * - ollama: Uses OpenAI-compatible API at localhost:11434
 * - openai: Direct OpenAI API
 * - anthropic: Direct Anthropic API
 * - openai-compatible: Any OpenAI-compatible endpoint (vLLM, LM Studio, OpenRouter)
 */
export function createProvider(config: LLMProviderConfig): LanguageModel {
  switch (config.type) {
    case 'ollama': {
      const ollama = createOpenAI({
        baseURL: config.base_url ?? 'http://localhost:11434/v1',
        apiKey: 'ollama', // Ollama doesn't need a real key
        name: 'ollama',
      });
      return ollama(config.model);
    }

    case 'openai': {
      const openai = createOpenAI({
        apiKey: config.api_key,
        baseURL: config.base_url,
      });
      return openai(config.model);
    }

    case 'anthropic': {
      const anthropic = createAnthropic({
        apiKey: config.api_key,
        baseURL: config.base_url,
      });
      return anthropic(config.model);
    }

    case 'openai-compatible': {
      if (!config.base_url) {
        throw new Error('base_url is required for openai-compatible provider');
      }
      const compatible = createOpenAI({
        baseURL: config.base_url,
        apiKey: config.api_key ?? 'no-key',
        name: 'openai-compatible',
      });
      return compatible(config.model);
    }

    default: {
      const _exhaustive: never = config.type;
      throw new Error(`Unknown provider type: ${_exhaustive}`);
    }
  }
}
