import { useState, useEffect } from 'react';
import { FolderTree, File, Folder, FolderOpen, ChevronRight, ChevronDown, RefreshCw } from 'lucide-react';

interface FilePanelProps {
  sessionId: string | null;
}

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

export function FilePanel({ sessionId }: FilePanelProps) {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [loading, setLoading] = useState(false);

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

  const loadRoot = async () => {
    const files = await fetchDirectory('/workspace');
    setTree(files ?? []);
  };

  useEffect(() => {
    if (sessionId) {
      loadRoot();
    }
  }, [sessionId]);

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
        <div className="flex-1 overflow-auto">
          {selectedFile ? (
            <div className="h-full">
              <div className="border-b border-zinc-800 bg-zinc-900/50 px-3 py-1.5 text-xs text-zinc-400">
                {selectedFile}
              </div>
              <pre className="p-4 text-xs text-zinc-300 font-mono leading-relaxed">
                {loading ? 'Loading...' : fileContent}
              </pre>
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
