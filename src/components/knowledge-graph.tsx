"use client";

import {
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type WheelEvent,
} from "react";
import { Icon } from "@/components/icons";
import type { GraphEdge, GraphNode } from "@/components/viewer-types";

type Point = { x: number; y: number };
type PositionedNode = GraphNode & Point;

const typeColors: Record<string, string> = {
  experiment: "#a98bff",
  candidate: "#ffb35c",
  opportunity: "#ffb35c",
  lesson: "#63dbb5",
  journal: "#59c7f7",
  capability: "#f06fae",
  interest: "#ffdf6e",
  source: "#8fa8c7",
  profile: "#f5f7fb",
};

function nodeColor(type: string) {
  return typeColors[type.toLowerCase()] ?? "#8095b3";
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function layoutNodes(nodes: GraphNode[]): PositionedNode[] {
  const center = { x: 450, y: 260 };
  const groups = new Map<string, GraphNode[]>();
  for (const node of nodes) {
    const key = node.type.toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), node]);
  }

  const groupEntries = [...groups.entries()];
  const positions = new Map<string, Point>();
  groupEntries.forEach(([type, group], groupIndex) => {
    const groupAngle = (groupIndex / Math.max(groupEntries.length, 1)) * Math.PI * 2 - Math.PI / 2;
    const groupRadius = groupEntries.length <= 2 ? 105 : 150;
    const groupCenter = {
      x: center.x + Math.cos(groupAngle) * groupRadius,
      y: center.y + Math.sin(groupAngle) * groupRadius * 0.72,
    };

    group.forEach((node, nodeIndex) => {
      const seed = hashString(`${type}:${node.id}`);
      const angle =
        (nodeIndex / Math.max(group.length, 1)) * Math.PI * 2 +
        ((seed % 29) / 29) * 0.55;
      const radius = group.length === 1 ? 0 : 30 + (seed % 56);
      positions.set(node.id, {
        x: Math.min(850, Math.max(50, groupCenter.x + Math.cos(angle) * radius)),
        y: Math.min(480, Math.max(40, groupCenter.y + Math.sin(angle) * radius * 0.74)),
      });
    });
  });

  return nodes.map((node) => ({
    ...node,
    ...(positions.get(node.id) ?? center),
  }));
}

export function KnowledgeGraph({
  nodes,
  edges,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(nodes[0]?.id ?? null);
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set());
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const dragRef = useRef<{ startX: number; startY: number; x: number; y: number } | null>(null);

  const allTypes = useMemo(
    () => [...new Set(nodes.map((node) => node.type.toLowerCase()))].sort(),
    [nodes],
  );
  const positioned = useMemo(() => layoutNodes(nodes), [nodes]);
  const visibleNodes = useMemo(
    () =>
      activeTypes.size === 0
        ? positioned
        : positioned.filter((node) => activeTypes.has(node.type.toLowerCase())),
    [activeTypes, positioned],
  );
  const visibleIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes]);
  const visibleEdges = useMemo(
    () => edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target)),
    [edges, visibleIds],
  );
  const byId = useMemo(
    () => new Map(positioned.map((node) => [node.id, node])),
    [positioned],
  );
  const selected = selectedId ? byId.get(selectedId) : undefined;

  function toggleType(type: string) {
    setActiveTypes((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function handleWheel(event: WheelEvent<SVGSVGElement>) {
    event.preventDefault();
    const delta = event.deltaY > 0 ? 0.9 : 1.1;
    setTransform((current) => ({
      ...current,
      scale: Math.min(2.3, Math.max(0.58, current.scale * delta)),
    }));
  }

  function beginPan(event: PointerEvent<SVGSVGElement>) {
    if (event.target !== event.currentTarget) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      x: transform.x,
      y: transform.y,
    };
  }

  function pan(event: PointerEvent<SVGSVGElement>) {
    if (!dragRef.current) return;
    const multiplier = 900 / Math.max(event.currentTarget.clientWidth, 1);
    setTransform((current) => ({
      ...current,
      x: dragRef.current!.x + (event.clientX - dragRef.current!.startX) * multiplier,
      y: dragRef.current!.y + (event.clientY - dragRef.current!.startY) * multiplier,
    }));
  }

  function endPan(event: PointerEvent<SVGSVGElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
  }

  function selectWithKeyboard(event: KeyboardEvent<SVGGElement>, id: string) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSelectedId(id);
    }
  }

  if (nodes.length === 0) {
    return (
      <div className="graph-empty empty-state">
        <span className="empty-state-icon"><Icon name="graph" size={26} /></span>
        <h3>Your graph starts with the first record</h3>
        <p>Backfill history or add an interest to connect ideas, experiments, and lessons.</p>
      </div>
    );
  }

  return (
    <div className="knowledge-graph">
      <div className="graph-toolbar" aria-label="Graph filters and controls">
        <div className="graph-filter-list">
          {allTypes.slice(0, 6).map((type) => (
            <button
              className={`graph-filter ${activeTypes.has(type) ? "is-active" : ""}`}
              key={type}
              onClick={() => toggleType(type)}
              style={{ "--node-color": nodeColor(type) } as React.CSSProperties}
              type="button"
            >
              <span className="graph-filter-dot" />
              {type}
            </button>
          ))}
        </div>
        <button
          className="icon-button"
          onClick={() => setTransform({ x: 0, y: 0, scale: 1 })}
          title="Reset graph view"
          type="button"
        >
          <Icon name="target" size={16} />
          <span className="sr-only">Reset graph view</span>
        </button>
      </div>

      <div className="graph-canvas-wrap">
        <svg
          aria-labelledby="graph-title graph-description"
          className="graph-canvas"
          onPointerCancel={endPan}
          onPointerDown={beginPan}
          onPointerMove={pan}
          onPointerUp={endPan}
          onWheel={handleWheel}
          role="img"
          viewBox="0 0 900 520"
        >
          <title id="graph-title">Auto-Tinker knowledge graph</title>
          <desc id="graph-description">An interactive map of interests, experiments, lessons, and sources. Drag to pan, scroll to zoom, and select a node for details.</desc>
          <defs>
            <radialGradient id="graphGlow">
              <stop offset="0" stopColor="#6a4dff" stopOpacity=".16" />
              <stop offset="1" stopColor="#6a4dff" stopOpacity="0" />
            </radialGradient>
            <filter id="nodeGlow" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>
          <rect width="900" height="520" fill="transparent" pointerEvents="none" />
          <circle cx="450" cy="260" r="230" fill="url(#graphGlow)" pointerEvents="none" />
          <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.scale})`}>
            {visibleEdges.map((edge, index) => {
              const source = byId.get(edge.source);
              const target = byId.get(edge.target);
              if (!source || !target) return null;
              const highlighted = selectedId === source.id || selectedId === target.id;
              return (
                <line
                  className={highlighted ? "graph-edge is-highlighted" : "graph-edge"}
                  key={`${edge.source}-${edge.target}-${index}`}
                  x1={source.x}
                  x2={target.x}
                  y1={source.y}
                  y2={target.y}
                />
              );
            })}
            {visibleNodes.map((node) => {
              const selectedNode = node.id === selectedId;
              const radius = node.type === "profile" ? 13 : selectedNode ? 10 : 7;
              return (
                <g
                  aria-label={`${node.title}, ${node.type}`}
                  className={`graph-node ${selectedNode ? "is-selected" : ""}`}
                  key={node.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedId(node.id);
                  }}
                  onKeyDown={(event) => selectWithKeyboard(event, node.id)}
                  role="button"
                  tabIndex={0}
                  transform={`translate(${node.x} ${node.y})`}
                >
                  {selectedNode && <circle className="graph-node-ring" r={radius + 8} />}
                  <circle
                    fill={nodeColor(node.type)}
                    filter={selectedNode ? "url(#nodeGlow)" : undefined}
                    r={radius}
                  />
                  {(selectedNode || node.type === "profile" || visibleNodes.length < 18) && (
                    <text className="graph-node-label" x={radius + 7} y="4">
                      {node.title.length > 25 ? `${node.title.slice(0, 24)}…` : node.title}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
        <span className="graph-instruction">Drag to pan · scroll to zoom</span>
      </div>

      {selected && (
        <aside className="graph-selection" aria-live="polite">
          <span className="graph-selection-dot" style={{ background: nodeColor(selected.type) }} />
          <div>
            <span className="eyebrow">{selected.type}</span>
            <strong>{selected.title}</strong>
            <p>{selected.summary || selected.tags.slice(0, 3).join(" · ") || "Connected knowledge record"}</p>
          </div>
        </aside>
      )}
    </div>
  );
}
