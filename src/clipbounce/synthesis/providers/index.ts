import type { AIProvider } from './AIProvider';
import type { ProviderConfig } from '../../types';
import { MockProvider } from './MockProvider';
import { RemoteProvider } from './RemoteProvider';

const _providers: Map<string, AIProvider> = new Map();
const _remoteProvider = new RemoteProvider('http://localhost:8787');

function registerDefaultProviders(): void {
  _providers.set('Mock Provider', new MockProvider());
  _providers.set(_remoteProvider.name, _remoteProvider);
}

registerDefaultProviders();

export function getProvider(name?: string): AIProvider {
  if (name && _providers.has(name)) {
    return _providers.get(name)!;
  }
  return _providers.get('Mock Provider')!;
}

export function getProviderForConfig(config: ProviderConfig): AIProvider {
  if (config.mode === 'local') {
    _remoteProvider.setBackendUrl(config.backendUrl);
    return _remoteProvider;
  }
  return _providers.get('Mock Provider')!;
}

export function getRemoteProvider(): RemoteProvider {
  return _remoteProvider;
}

export function registerProvider(provider: AIProvider): void {
  _providers.set(provider.name, provider);
}

export function listProviders(): string[] {
  return Array.from(_providers.keys());
}
