import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import type { ReactNode } from 'react';

interface WorkspaceLayoutProps {
  chatPanel: ReactNode;
  terminalPanel: ReactNode;
  browserPanel: ReactNode;
  filePanel: ReactNode;
}

export function WorkspaceLayout({
  chatPanel,
  terminalPanel,
  browserPanel,
  filePanel,
}: WorkspaceLayoutProps) {
  return (
    <PanelGroup orientation="horizontal" className="h-full">
      {/* Left: Chat Panel */}
      <Panel defaultSize={50} minSize={30}>
        {chatPanel}
      </Panel>

      <PanelResizeHandle className="w-1 bg-zinc-800 hover:bg-blue-500/50 transition-colors" />

      {/* Right: Terminal + Browser + Files */}
      <Panel defaultSize={50} minSize={20}>
        <PanelGroup orientation="vertical">
          {/* Terminal */}
          <Panel defaultSize={34} minSize={10}>
            {terminalPanel}
          </Panel>

          <PanelResizeHandle className="h-1 bg-zinc-800 hover:bg-blue-500/50 transition-colors" />

          {/* Browser */}
          <Panel defaultSize={33} minSize={10}>
            {browserPanel}
          </Panel>

          <PanelResizeHandle className="h-1 bg-zinc-800 hover:bg-blue-500/50 transition-colors" />

          {/* Files */}
          <Panel defaultSize={33} minSize={10}>
            {filePanel}
          </Panel>
        </PanelGroup>
      </Panel>
    </PanelGroup>
  );
}
