import { Settings } from 'lucide-react';

export function SettingsPage() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-zinc-800 px-6 py-4">
        <h1 className="text-xl font-semibold text-zinc-100">Settings</h1>
        <p className="text-sm text-zinc-500">Configure LLM providers, Docker, and more</p>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center text-zinc-600">
        <Settings className="mb-4 h-12 w-12 text-zinc-700" />
        <p className="text-lg font-medium">Settings</p>
        <p className="text-sm text-zinc-500">Configuration page coming in Sprint 9</p>
      </div>
    </div>
  );
}
