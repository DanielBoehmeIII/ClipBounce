import type { AIProvider } from './AIProvider';
import { MockProvider } from './MockProvider';

const _providers: Map<string, AIProvider> = new Map();

function registerDefaultProviders(): void {
  const mock = new MockProvider();
  _providers.set(mock.name, mock);
}

registerDefaultProviders();

export function getProvider(name?: string): AIProvider {
  if (name && _providers.has(name)) {
    return _providers.get(name)!;
  }
  return _providers.get('Mock Provider')!;
}

export function registerProvider(provider: AIProvider): void {
  _providers.set(provider.name, provider);
}

export function listProviders(): string[] {
  return Array.from(_providers.keys());
}
