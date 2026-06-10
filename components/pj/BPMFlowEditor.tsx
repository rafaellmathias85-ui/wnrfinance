'use client';

import { useCallback, useState } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Plus } from 'lucide-react';

interface Props {
  initialNodes: Node[];
  initialEdges: Edge[];
  onSave: (nodes: Node[], edges: Edge[]) => void;
}

const NODE_TYPES = [
  { type: 'inicio', label: 'Início', color: '#16a34a', shape: 'circle' },
  { type: 'fim', label: 'Fim', color: '#dc2626', shape: 'circle' },
  { type: 'tarefa', label: 'Tarefa', color: '#2563eb', shape: 'rect' },
  { type: 'decisao', label: 'Decisão', color: '#d97706', shape: 'diamond' },
  { type: 'evento', label: 'Evento', color: '#7c3aed', shape: 'rect' },
];

const getBgColor = (nodeType: string) => {
  return NODE_TYPES.find((n) => n.type === nodeType)?.color ?? '#475569';
};

const defaultNodeStyle = (nodeType: string): React.CSSProperties => ({
  background: getBgColor(nodeType),
  color: '#fff',
  border: 'none',
  borderRadius: nodeType === 'inicio' || nodeType === 'fim' ? '50%' : '8px',
  minWidth: '120px',
  textAlign: 'center',
  fontSize: '12px',
  fontWeight: 500,
  padding: '8px 12px',
  boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
});

let nodeIdCounter = 1;

export default function BPMFlowEditor({ initialNodes, initialEdges, onSave }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState(
    initialNodes.length > 0 ? initialNodes : [
      {
        id: 'start',
        type: 'default',
        data: { label: 'Início', nodeType: 'inicio' },
        position: { x: 200, y: 80 },
        style: defaultNodeStyle('inicio'),
      },
    ]
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((eds) =>
        addEdge({ ...params, animated: true, style: { stroke: '#64748b' } }, eds)
      ),
    [setEdges]
  );

  const addNode = (nodeType: string) => {
    const id = `node_${Date.now()}_${nodeIdCounter++}`;
    const cfg = NODE_TYPES.find((n) => n.type === nodeType)!;
    setNodes((nds) => [
      ...nds,
      {
        id,
        type: 'default',
        data: { label: cfg.label, nodeType },
        position: { x: 100 + Math.random() * 300, y: 100 + Math.random() * 200 },
        style: defaultNodeStyle(nodeType),
      },
    ]);
  };

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
        style={{ background: '#0f172a' }}
        defaultEdgeOptions={{ animated: true, style: { stroke: '#64748b' } }}
      >
        <MiniMap
          style={{ background: '#1e293b' }}
          nodeColor={(n: Node) => getBgColor((n.data as any)?.nodeType ?? '')}
        />
        <Controls />
        <Background variant={BackgroundVariant.Dots} gap={20} color="#1e293b" />

        <Panel position="top-left">
          <div className="flex flex-col gap-1 bg-slate-800/95 border border-slate-700 rounded-xl p-3 shadow-xl">
            <p className="text-slate-400 text-xs font-medium mb-1 px-1">Adicionar nó</p>
            {NODE_TYPES.map((nt) => (
              <button
                key={nt.type}
                onClick={() => addNode(nt.type)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-white text-xs font-medium hover:opacity-90 transition-opacity"
                style={{ background: nt.color }}
              >
                <Plus className="w-3 h-3" /> {nt.label}
              </button>
            ))}
            <div className="border-t border-slate-700 my-1" />
            <button
              onClick={() => onSave(nodes, edges)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium"
            >
              Salvar fluxo
            </button>
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}
