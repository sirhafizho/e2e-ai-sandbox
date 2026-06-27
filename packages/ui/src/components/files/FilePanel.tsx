import { useState, useEffect, useRef, useCallback } from 'react';
import { FolderTree, File, Folder, FolderOpen, ChevronRight, ChevronDown, RefreshCw, Save } from 'lucide-react';
import type { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { api } from '../../lib/api.js';

interface FilePanelProps {
  sessionId: string | null;
}

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

/**
 * Dynamically import the CodeMirror language extension for a file.
 * Each language pack is loaded only when first needed.
 */
async function getLanguageExtension(filePath: string): Promise<Extension | null> {
  const ext = filePath.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'js': case 'jsx': case 'mjs': case 'cjs': {
      const { javascript } = await import('@codemirror/lang-javascript');
      return javascript();
    }
    case 'ts': case 'tsx': case 'mts': case 'cts': {
      const { javascript } = await import('@codemirror/lang-javascript');
      return javascript({ typescript: true, jsx: ext.includes('x') });
    }
    case 'json': case 'jsonc': {
      const { json } = await import('@codemirror/lang-json');
      return json();
    }
    case 'py': {
      const { python } = await import('@codemirror/lang-python');
      return python();
    }
    case 'html': case 'htm': case 'svg': {
      const { html } = await import('@codemirror/lang-html');
      return html();
    }
    case 'css': case 'scss': {
      const { css } = await import('@codemirror/lang-css');
      return css();
    }
    case 'md': case 'mdx': {
      const { markdown } = await import('@codemirror/lang-markdown');
      return markdown();
    }
    default:
      return null;
  }
}

export function FilePanel({ sessionId }: FilePanelProps) {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [modified, setModified] = useState(false);
  const [saving, setSaving] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  const fetchDirectory = async (path: string) => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/sessions/${sessionId}/files?path=${encodeURIComponent(path)}`);
      if (res.ok) {
        const data = await res.json() as { files: FileNode[] };
        return data.files;
      }
    } catch {
      // API may not be available yet
    }
    return [];
  };

  const fetchFile = async (path: string) => {
    if (!sessionId) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/sessions/${sessionId}/files?path=${encodeURIComponent(path)}`);
      if (res.ok) {
        const data = await res.json() as { content: string };
        setFileContent(data.content);
        setSelectedFile(path);
      }
    } catch {
      setFileContent('Failed to load file');
    } finally {
      setLoading(false);
    }
  };

  const loadRoot = useCallback(async () => {
    const files = await fetchDirectory('/workspace');
    setTree(files ?? []);
  }, [sessionId]);

  const handleSave = useCallback(async () => {
    if (!sessionId || !selectedFile || !viewRef.current) return;
    setSaving(true);
    try {
      const content = viewRef.current.state.doc.toString();
      await api.sessions.writeFile(sessionId, selectedFile, content);
      setModified(false);
    } catch (err) {
      console.error('Failed to save file:', err);
    } finally {
      setSaving(false);
    }
  }, [sessionId, selectedFile]);

  useEffect(() => {
    if (sessionId) {
      loadRoot();
    }
  }, [sessionId, loadRoot]);

  // Create/update CodeMirror editor when file content changes
  useEffect(() => {
    if (!editorRef.current || !selectedFile || loading) return;

    let cancelled = false;

    // Destroy previous editor
    if (viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
    }

    // Dynamically import CodeMirror core + theme, then create editor
    (async () => {
      const [
        { EditorView: EV, keymap },
        { EditorState: ES },
        { oneDark },
        langExt,
      ] = await Promise.all([
        import('@codemirror/view'),
        import('@codemirror/state'),
        import('@codemirror/theme-one-dark'),
        getLanguageExtension(selectedFile),
      ]);

      if (cancelled || !editorRef.current) return;

      const extensions = [
        EV.editable.of(true),
        oneDark,
        EV.lineWrapping,
        EV.theme({
          '&': { height: '100%', fontSize: '12px' },
          '.cm-scroller': { overflow: 'auto', fontFamily: '"JetBrains Mono", "Fira Code", monospace' },
          '.cm-gutters': { backgroundColor: '#09090b', borderRight: '1px solid #27272a' },
          '.cm-activeLineGutter': { backgroundColor: 'transparent' },
          '.cm-content': { padding: '8px 0' },
        }),
        EV.updateListener.of((update) => {
          if (update.docChanged) setModified(true);
        }),
        keymap.of([{
          key: 'Mod-s',
          run: () => { handleSave(); return true; },
        }]),
      ];

      if (langExt) extensions.push(langExt);

      setModified(false);
      const state = ES.create({ doc: fileContent, extensions });
      viewRef.current = new EV({ state, parent: editorRef.current });
    })();

    return () => {
      cancelled = true;
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
    };
  }, [fileContent, selectedFile, loading, handleSave]);

  if (!sessionId) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-zinc-950 text-zinc-600">
        <FolderTree className="mb-2 h-8 w-8" />
        <span className="text-sm">No session active</span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/50 px-3 py-1.5">
        <div className="flex items-center gap-1.5 text-xs text-zinc-400">
          <FolderTree className="h-3 w-3" />
          <span>Files</span>
        </div>
        <button
          onClick={loadRoot}
          className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
          title="Refresh"
        >
          <RefreshCw className="h-3 w-3" />
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Tree */}
        <div className="w-48 flex-shrink-0 overflow-y-auto border-r border-zinc-800 py-1">
          {tree.length === 0 ? (
            <div className="px-3 py-4 text-xs text-zinc-600">No files loaded</div>
          ) : (
            tree.map((node) => (
              <TreeNode
                key={node.path}
                node={node}
                depth={0}
                selectedPath={selectedFile}
                onSelect={(path) => fetchFile(path)}
              />
            ))
          )}
        </div>

        {/* Viewer */}
        <div className="flex-1 overflow-hidden">
          {selectedFile ? (
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/50 px-3 py-1.5 text-xs text-zinc-400">
                <div className="flex items-center gap-1.5">
                  <span>{selectedFile}</span>
                  {modified && (
                    <span className="h-2 w-2 rounded-full bg-yellow-400" title="Unsaved changes" />
                  )}
                </div>
                {modified && (
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-1 rounded px-2 py-0.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-50"
                    title="Save (Cmd+S)"
                  >
                    <Save className="h-3 w-3" />
                    <span>{saving ? 'Saving...' : 'Save'}</span>
                  </button>
                )}
              </div>
              {loading ? (
                <div className="flex flex-1 items-center justify-center text-xs text-zinc-600">
                  Loading...
                </div>
              ) : (
                <div ref={editorRef} className="flex-1 overflow-hidden" />
              )}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-zinc-600">
              Select a file to view
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TreeNode({
  node,
  depth,
  selectedPath,
  onSelect,
}: {
  node: FileNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth === 0);
  const isDir = node.type === 'directory';
  const isSelected = node.path === selectedPath;

  const handleClick = () => {
    if (isDir) {
      setExpanded(!expanded);
    } else {
      onSelect(node.path);
    }
  };

  return (
    <>
      <button
        onClick={handleClick}
        className={`flex w-full items-center gap-1 px-2 py-0.5 text-left text-xs transition-colors hover:bg-zinc-800/50 ${
          isSelected ? 'bg-blue-500/10 text-blue-400' : 'text-zinc-400'
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {isDir ? (
          <>
            {expanded ? (
              <ChevronDown className="h-3 w-3 flex-shrink-0 text-zinc-600" />
            ) : (
              <ChevronRight className="h-3 w-3 flex-shrink-0 text-zinc-600" />
            )}
            {expanded ? (
              <FolderOpen className="h-3 w-3 flex-shrink-0 text-yellow-500" />
            ) : (
              <Folder className="h-3 w-3 flex-shrink-0 text-yellow-600" />
            )}
          </>
        ) : (
          <>
            <span className="w-3" />
            <File className="h-3 w-3 flex-shrink-0 text-zinc-500" />
          </>
        )}
        <span className="truncate">{node.name}</span>
      </button>

      {isDir && expanded && node.children?.map((child) => (
        <TreeNode
          key={child.path}
          node={child}
          depth={depth + 1}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}
