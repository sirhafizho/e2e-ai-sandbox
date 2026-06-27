import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Play, Clock, CircleDot, X } from 'lucide-react';
import { api } from '../lib/api.js';
import type { SessionInfo, CreateSessionOptions } from '../lib/api.js';

export function SessionsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('');

  const { data: sessions, isLoading, error } = useQuery({
    queryKey: ['sessions'],
    queryFn: api.sessions.list,
    refetchInterval: 10_000,
  });

  const createMutation = useMutation({
    mutationFn: (opts?: CreateSessionOptions) => api.sessions.create(opts),
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      setShowCreate(false);
      setRepoUrl('');
      setBranch('');
      navigate(`/sessions/${session.id}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.sessions.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });

  const handleCreate = () => {
    const opts: CreateSessionOptions = {};
    if (repoUrl.trim()) opts.repo_url = repoUrl.trim();
    if (branch.trim()) opts.branch = branch.trim();
    createMutation.mutate(Object.keys(opts).length > 0 ? opts : undefined);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Sessions</h1>
          <p className="text-sm text-zinc-500">Manage your agent sessions</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          disabled={createMutation.isPending}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          New Session
        </button>
      </div>

      {/* Create session form */}
      {showCreate && (
        <div className="border-b border-zinc-800 bg-zinc-900/50 px-6 py-4">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-zinc-500">Repository URL (optional)</label>
              <input
                type="text"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/user/repo"
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="w-40">
              <label className="mb-1 block text-xs text-zinc-500">Branch (optional)</label>
              <input
                type="text"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder="main"
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Creating...' : 'Create'}
            </button>
            <button
              onClick={() => { setShowCreate(false); setRepoUrl(''); setBranch(''); }}
              className="rounded-md bg-zinc-800 p-1.5 text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {createMutation.isError && (
            <p className="mt-2 text-xs text-red-400">
              {createMutation.error?.message ?? 'Failed to create session'}
            </p>
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-blue-500" />
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-800/50 bg-red-950/30 p-4 text-sm text-red-400">
            Failed to load sessions. Is the Forge server running on port 3001?
          </div>
        )}

        {sessions && sessions.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
            <CircleDot className="mb-4 h-12 w-12 text-zinc-700" />
            <p className="text-lg font-medium">No sessions yet</p>
            <p className="text-sm">Create a new session to get started</p>
          </div>
        )}

        {sessions && sessions.length > 0 && (
          <div className="grid gap-3">
            {sessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                onOpen={() => navigate(`/sessions/${session.id}`)}
                onDelete={() => deleteMutation.mutate(session.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SessionCard({
  session,
  onOpen,
  onDelete,
}: {
  session: SessionInfo;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const statusColor = {
    ready: 'text-green-400 bg-green-400/10',
    running: 'text-yellow-400 bg-yellow-400/10',
    paused: 'text-zinc-400 bg-zinc-400/10',
    terminated: 'text-red-400 bg-red-400/10',
    created: 'text-blue-400 bg-blue-400/10',
    booting: 'text-blue-400 bg-blue-400/10',
  }[session.status] ?? 'text-zinc-400 bg-zinc-400/10';

  const created = new Date(session.created_at).toLocaleString();
  const historyCount = (() => {
    try {
      return (JSON.parse(session.history_json) as unknown[]).length;
    } catch {
      return 0;
    }
  })();

  return (
    <div className="flex items-center gap-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 transition-colors hover:border-zinc-700">
      <div className="flex-1 cursor-pointer" onClick={onOpen}>
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm text-zinc-300">{session.id.slice(0, 8)}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor}`}>
            {session.status}
          </span>
        </div>
        <div className="mt-1.5 flex items-center gap-4 text-xs text-zinc-500">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {created}
          </span>
          <span>{session.model}</span>
          {historyCount > 0 && <span>{historyCount} messages</span>}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onOpen}
          className="flex items-center gap-1.5 rounded-md bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-700"
        >
          <Play className="h-3 w-3" />
          Open
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="flex items-center gap-1.5 rounded-md bg-zinc-800 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:bg-red-900/50 hover:text-red-400"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
