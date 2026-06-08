'use client';

import { useState, useCallback } from 'react';
import { PermModule } from '@/lib/permissions';

type SubItemLevel = 'total' | 'view' | 'blocked';
type ModuleLevel = 'total' | 'custom' | 'blocked';

interface PermState {
  [subItemId: string]: SubItemLevel;
}

interface ModuleLevelState {
  [moduleId: string]: ModuleLevel;
}

function subItemLevelFromActions(actions: Record<string, boolean>): SubItemLevel {
  const view = actions['view'] ?? false;
  const hasEdit = actions['create'] || actions['edit'] || actions['delete'] || actions['export'] || actions['approve'];
  if (!view) return 'blocked';
  if (hasEdit) return 'total';
  return 'view';
}

function actionsFromSubItemLevel(level: SubItemLevel): Record<string, boolean> {
  if (level === 'total') return { view: true, create: true, edit: true, delete: true, export: true, approve: true };
  if (level === 'view') return { view: true, create: false, edit: false, delete: false, export: false, approve: false };
  return { view: false, create: false, edit: false, delete: false, export: false, approve: false };
}

function computeModuleLevel(moduleId: string, permState: PermState, mod: PermModule): ModuleLevel {
  const allItems = mod.columns.flatMap(c => c.items);
  if (allItems.length === 0) return 'blocked';
  const levels = allItems.map(item => permState[item.id] ?? 'total');
  const allTotal = levels.every(l => l === 'total');
  const allBlocked = levels.every(l => l === 'blocked');
  if (allTotal) return 'total';
  if (allBlocked) return 'blocked';
  return 'custom';
}

export interface PermissionMatrixProps {
  modules: PermModule[];
  /** raw permissions from API: { [module]: { [action]: boolean } } */
  initialPermissions: Record<string, Record<string, boolean>>;
  onChange: (permissions: Array<{ module: string; action: string; allowed: boolean }>) => void;
  readOnly?: boolean;
}

export function PermissionMatrix({ modules, initialPermissions, onChange, readOnly }: PermissionMatrixProps) {
  const [activeTab, setActiveTab] = useState(modules[0]?.id ?? '');

  const buildInitialState = useCallback((): PermState => {
    const state: PermState = {};
    for (const mod of modules) {
      for (const col of mod.columns) {
        for (const item of col.items) {
          const actions = initialPermissions[item.id] ?? {};
          state[item.id] = subItemLevelFromActions(actions);
        }
      }
    }
    return state;
  }, [modules, initialPermissions]);

  const [permState, setPermState] = useState<PermState>(buildInitialState);

  const emitChange = useCallback((newState: PermState) => {
    const result: Array<{ module: string; action: string; allowed: boolean }> = [];
    for (const mod of modules) {
      for (const col of mod.columns) {
        for (const item of col.items) {
          const level = newState[item.id] ?? 'total';
          const actions = actionsFromSubItemLevel(level);
          for (const [action, allowed] of Object.entries(actions)) {
            result.push({ module: item.id, action, allowed });
          }
        }
      }
    }
    onChange(result);
  }, [modules, onChange]);

  const setSubItem = useCallback((itemId: string, level: SubItemLevel) => {
    if (readOnly) return;
    setPermState(prev => {
      const next = { ...prev, [itemId]: level };
      emitChange(next);
      return next;
    });
  }, [readOnly, emitChange]);

  const setModuleLevel = useCallback((mod: PermModule, level: ModuleLevel) => {
    if (readOnly || level === 'custom') return;
    const itemLevel: SubItemLevel = level === 'total' ? 'total' : 'blocked';
    setPermState(prev => {
      const next = { ...prev };
      for (const col of mod.columns) {
        for (const item of col.items) {
          next[item.id] = itemLevel;
        }
      }
      emitChange(next);
      return next;
    });
  }, [readOnly, emitChange]);

  const activeMod = modules.find(m => m.id === activeTab);
  const moduleLevel = activeMod ? computeModuleLevel(activeTab, permState, activeMod) : 'blocked';

  return (
    <div className="space-y-0">
      {/* Module tabs */}
      <div className="flex flex-wrap gap-1 border-b border-border pb-0">
        {modules.map(mod => {
          const ml = computeModuleLevel(mod.id, permState, mod);
          return (
            <button
              key={mod.id}
              onClick={() => setActiveTab(mod.id)}
              className={`relative px-4 py-2 text-sm font-medium transition-colors rounded-t-lg border-b-2 -mb-px ${
                activeTab === mod.id
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {mod.label}
              {ml === 'blocked' && (
                <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-red-500 align-middle" />
              )}
              {ml === 'custom' && (
                <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-amber-400 align-middle" />
              )}
              {ml === 'total' && (
                <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-green-500 align-middle" />
              )}
            </button>
          );
        })}
      </div>

      {activeMod && (
        <div className="pt-4 space-y-4">
          {/* Module-level selector */}
          <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
            <span className="text-sm font-medium text-foreground mr-3">Módulo:</span>
            {(['total', 'custom', 'blocked'] as const).map(opt => (
              <label
                key={opt}
                className={`flex items-center gap-1.5 cursor-pointer px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  readOnly ? 'cursor-default' : ''
                } ${
                  moduleLevel === opt
                    ? opt === 'total' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : opt === 'custom' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                <input
                  type="radio"
                  name={`module-level-${activeMod.id}`}
                  value={opt}
                  checked={moduleLevel === opt}
                  onChange={() => setModuleLevel(activeMod, opt)}
                  disabled={readOnly || opt === 'custom'}
                  className="sr-only"
                />
                <span className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${
                  moduleLevel === opt
                    ? opt === 'total' ? 'border-green-600 bg-green-600'
                    : opt === 'custom' ? 'border-amber-500 bg-amber-500'
                    : 'border-red-600 bg-red-600'
                    : 'border-muted-foreground'
                }`} />
                {opt === 'total' ? 'Acesso Total' : opt === 'custom' ? 'Personalizado' : 'Bloqueado'}
              </label>
            ))}
          </div>

          {/* Sub-items grid */}
          <div className={`grid gap-4 ${activeMod.columns.length === 1 ? 'grid-cols-1' : activeMod.columns.length === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}>
            {activeMod.columns.map(col => (
              <div key={col.title} className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1 pb-1 border-b border-border">{col.title}</p>
                {col.items.map(item => {
                  const level = permState[item.id] ?? 'total';
                  return (
                    <div key={item.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-muted/60 transition-colors">
                      <span className="text-sm text-foreground flex-1 truncate">{item.label}</span>
                      <div className="flex items-center gap-1">
                        {(['total', 'view', 'blocked'] as const).map(opt => (
                          <button
                            key={opt}
                            onClick={() => setSubItem(item.id, opt)}
                            disabled={readOnly}
                            title={opt === 'total' ? 'Acesso Total' : opt === 'view' ? 'Apenas Visualizar' : 'Bloqueado'}
                            className={`w-7 h-7 rounded-md text-xs font-bold transition-colors border ${
                              level === opt
                                ? opt === 'total' ? 'bg-green-500 border-green-600 text-white'
                                : opt === 'view' ? 'bg-blue-500 border-blue-600 text-white'
                                : 'bg-red-500 border-red-600 text-white'
                                : 'bg-transparent border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground'
                            } ${readOnly ? 'cursor-default opacity-70' : 'cursor-pointer'}`}
                          >
                            {opt === 'total' ? 'T' : opt === 'view' ? 'V' : 'B'}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-green-600">T</span> = Acesso Total &nbsp;·&nbsp;
            <span className="font-semibold text-blue-600">V</span> = Apenas Visualizar &nbsp;·&nbsp;
            <span className="font-semibold text-red-600">B</span> = Bloqueado
          </p>
        </div>
      )}
    </div>
  );
}
