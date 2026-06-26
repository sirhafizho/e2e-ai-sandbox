import { useState, useEffect, useCallback } from 'react';
import { Save, TestTube, Check, X, Loader2 } from 'lucide-react';
import { api } from '../lib/api.js';
import type { ProviderSettings, DockerSettings } from '../lib/api.js';

const DEFAULT_PROVIDER: ProviderSettings = {
  type: 'ollama',
  base_url: 'http://localhost:11434',
  api_key: '',
  model: 'qwen2.5-coder:7b',
};

const DEFAULT_DOCKER: DockerSettings = {
  image: 'forge-sandbox:base',
  cpuLimit: 2,
  memoryLimitGb: 4,
};

const PROVIDER_DEFAULTS: Record<ProviderSettings['type'], { base_url: string; model: string }> = {
  ollama: { base_url: 'http://localhost:11434', model: 'qwen2.5-coder:7b' },
  openai: { base_url: 'https://api.openai.com/v1', model: 'gpt-4o' },
  anthropic: { base_url: 'https://api.anthropic.com', model: 'claude-sonnet-4-20250514' },
  'openai-compatible': { base_url: '', model: '' },
};

export function SettingsPage() {
  const [provider, setProvider] = useState<ProviderSettings>(DEFAULT_PROVIDER);
  const [docker, setDocker] = useState<DockerSettings>(DEFAULT_DOCKER);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Load settings from server on mount
  useEffect(() => {
    api.settings.get()
      .then((res) => {
        setProvider(res.settings.provider);
        setDocker(res.settings.docker);
      })
      .catch(() => {
        // Server may not be available — use defaults
      })
      .finally(() => setLoading(false));
  }, []);

  const handleProviderTypeChange = useCallback((type: ProviderSettings['type']) => {
    const defaults = PROVIDER_DEFAULTS[type];
    setProvider((prev) => ({
      ...prev,
      type,
      base_url: defaults.base_url,
      model: defaults.model,
    }));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await api.settings.update({ provider, docker });
      setProvider(res.settings.provider);
      setDocker(res.settings.docker);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setTestResult({ ok: false, message: 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  }, [provider, docker]);

  const handleTestConnection = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        setTestResult({ ok: true, message: 'Server is healthy' });
      } else {
        setTestResult({ ok: false, message: `Server returned ${res.status}` });
      }
    } catch {
      setTestResult({ ok: false, message: 'Cannot reach server at localhost:3001' });
    } finally {
      setTesting(false);
    }
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-zinc-800 px-6 py-4">
        <h1 className="text-xl font-semibold text-zinc-100">Settings</h1>
        <p className="text-sm text-zinc-500">Configure LLM providers, Docker, and more</p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
            <span className="ml-2 text-sm text-zinc-500">Loading settings...</span>
          </div>
        ) : (
        <div className="mx-auto max-w-2xl space-y-8">
          {/* LLM Provider Section */}
          <section>
            <h2 className="mb-4 text-lg font-medium text-zinc-200">LLM Provider</h2>
            <div className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-400">Provider Type</label>
                <select
                  value={provider.type}
                  onChange={(e) => handleProviderTypeChange(e.target.value as ProviderSettings['type'])}
                  className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 focus:border-blue-500 focus:outline-none"
                >
                  <option value="ollama">Ollama (Local)</option>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="openai-compatible">OpenAI-Compatible</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-400">Base URL</label>
                <input
                  type="text"
                  value={provider.base_url}
                  onChange={(e) => setProvider((p) => ({ ...p, base_url: e.target.value }))}
                  placeholder="https://api.example.com/v1"
                  className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:border-blue-500 focus:outline-none"
                />
              </div>

              {provider.type !== 'ollama' && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-400">API Key</label>
                  <input
                    type="password"
                    value={provider.api_key}
                    onChange={(e) => setProvider((p) => ({ ...p, api_key: e.target.value }))}
                    placeholder="sk-..."
                    className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-400">Model</label>
                <input
                  type="text"
                  value={provider.model}
                  onChange={(e) => setProvider((p) => ({ ...p, model: e.target.value }))}
                  placeholder="model-name"
                  className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
          </section>

          {/* Docker Section */}
          <section>
            <h2 className="mb-4 text-lg font-medium text-zinc-200">Docker Sandbox</h2>
            <div className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-400">Sandbox Image</label>
                <input
                  type="text"
                  value={docker.image}
                  onChange={(e) => setDocker((d) => ({ ...d, image: e.target.value }))}
                  className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-400">CPU Limit</label>
                  <input
                    type="number"
                    min={1}
                    max={16}
                    value={docker.cpuLimit}
                    onChange={(e) => setDocker((d) => ({ ...d, cpuLimit: Number(e.target.value) }))}
                    className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-400">Memory (GB)</label>
                  <input
                    type="number"
                    min={1}
                    max={32}
                    value={docker.memoryLimitGb}
                    onChange={(e) => setDocker((d) => ({ ...d, memoryLimitGb: Number(e.target.value) }))}
                    className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              {saving ? 'Saving...' : saved ? 'Saved' : 'Save Settings'}
            </button>

            <button
              onClick={handleTestConnection}
              disabled={testing}
              className="flex items-center gap-2 rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors disabled:opacity-50"
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube className="h-4 w-4" />}
              Test Connection
            </button>

            {testResult && (
              <span className={`flex items-center gap-1 text-sm ${testResult.ok ? 'text-green-400' : 'text-red-400'}`}>
                {testResult.ok ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                {testResult.message}
              </span>
            )}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
