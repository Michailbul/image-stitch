import React, { useState, useRef, useEffect, useMemo } from 'react';
import ImageCropper from './components/ImageCropper';
import StitchView from './views/StitchView';
import SmartStitchView from './views/SmartStitchView';
import ColorExplorerView from './views/ColorExplorerView';
import { generateStitchedCanvas, cropImage, generateCompositeImage } from './utils/imageUtils';
import { ImageLayer, StitchItem, AssetGroup, CropRegion, SmartStitchSession, SmartStitchSettings } from './types';
import {
  Plus,
  BoxSelect,
  Hexagon,
  Settings2,
  LayoutGrid,
  Layers,
  Palette,
  ChevronRight,
  ChevronDown,
  Sun,
  Moon,
  Upload,
  Folder,
  FolderOpen,
  Trash2,
  Group,
  Ungroup,
  CheckSquare,
  X,
  Edit2,
  MoreVertical,
  LogOut,
  ArrowLeftRight,
  GripVertical,
  Scissors,
  CornerDownRight,
  Eye,
  Image as ImageIcon,
  FileImage,
  CopyPlus
} from 'lucide-react';

const SMART_STITCH_STORAGE_KEY = 'laniameda.smart-stitch.sessions.v1';

const DEFAULT_SMART_STITCH_SETTINGS: SmartStitchSettings = {
  containerWidth: 1200,
  targetRowHeight: 300,
  spacing: 12,
  backgroundColor: '#ffffff',
  exportScale: 1,
};

const createSmartStitchSession = (index: number): SmartStitchSession => {
  const timestamp = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: `Stitch ${index}`,
    images: [],
    settings: { ...DEFAULT_SMART_STITCH_SETTINGS },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

const hydrateSmartStitchSessions = (): SmartStitchSession[] => {
  if (typeof window === 'undefined') {
    return [createSmartStitchSession(1)];
  }

  try {
    const raw = window.localStorage.getItem(SMART_STITCH_STORAGE_KEY);
    if (!raw) return [createSmartStitchSession(1)];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return [createSmartStitchSession(1)];
    }

    return parsed.map((session: Partial<SmartStitchSession>, index) => ({
      id: session.id ?? crypto.randomUUID(),
      name: session.name ?? `Stitch ${index + 1}`,
      images: Array.isArray(session.images) ? session.images : [],
      settings: {
        ...DEFAULT_SMART_STITCH_SETTINGS,
        ...(session.settings ?? {}),
      },
      createdAt: session.createdAt ?? new Date().toISOString(),
      updatedAt: session.updatedAt ?? session.createdAt ?? new Date().toISOString(),
    }));
  } catch (error) {
    console.error('Failed to restore Smart Stitch sessions', error);
    return [createSmartStitchSession(1)];
  }
};

function App() {
  const [activeTab, setActiveTab] = useState<'editor' | 'stitch' | 'smartStitch' | 'colors'>('editor');
  
  // Selection & Navigation
  const [activeAssetId, setActiveAssetId] = useState<string | null>(null); // Can be LayerID or GroupID
  const [selectedLibraryIds, setSelectedLibraryIds] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  
  // Group UX State
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(new Set());
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [draggedLibraryItemId, setDraggedLibraryItemId] = useState<string | null>(null);
  const [dragTargetId, setDragTargetId] = useState<string | null>(null);
  const [activeMenuGroupId, setActiveMenuGroupId] = useState<string | null>(null);
  
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Global Data
  const [layers, setLayers] = useState<ImageLayer[]>([]);
  const [groups, setGroups] = useState<AssetGroup[]>([]);
  const [stitchItems, setStitchItems] = useState<StitchItem[]>([]);
  const [smartStitchSessions, setSmartStitchSessions] = useState<SmartStitchSession[]>(() => hydrateSmartStitchSessions());
  const [activeSmartStitchSessionId, setActiveSmartStitchSessionId] = useState<string | null>(null);

  // Derived State
  const activeLayer = layers.find(l => l.id === activeAssetId);
  const activeGroup = groups.find(g => g.id === activeAssetId);
  const activeSmartStitchSession =
    smartStitchSessions.find((session) => session.id === activeSmartStitchSessionId) ?? smartStitchSessions[0] ?? null;

  // --- Theme Toggle ---
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    if (smartStitchSessions.length === 0) return;
    if (!activeSmartStitchSessionId || !smartStitchSessions.some((session) => session.id === activeSmartStitchSessionId)) {
      setActiveSmartStitchSessionId(smartStitchSessions[0].id);
    }
  }, [smartStitchSessions, activeSmartStitchSessionId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SMART_STITCH_STORAGE_KEY, JSON.stringify(smartStitchSessions));
  }, [smartStitchSessions]);

  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  // --- Click Outside Menu ---
  useEffect(() => {
    const handleClickOutside = () => setActiveMenuGroupId(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  // --- File Processing ---
  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    
    const reader = new FileReader();
    reader.onload = (evt) => {
      const src = evt.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const newLayer: ImageLayer = {
          id: crypto.randomUUID(),
          name: file.name,
          src: src,
          width: img.width,
          height: img.height,
          crops: [],
        };
        setLayers(prev => [...prev, newLayer]);
        // If not dragging internally, activate new layer
        if (!draggedLibraryItemId) {
             setActiveAssetId(newLayer.id);
             setActiveTab('editor');
        }
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // --- Drag & Drop (Global File Upload) ---
  const handleDragOver = (e: React.DragEvent) => { 
      e.preventDefault(); 
      // Only show overlay if actual files are being dragged (avoids internal drag conflicts)
      if (e.dataTransfer.types.includes('Files')) {
         setIsDraggingFile(true); 
      }
  };
  const handleDragLeave = (e: React.DragEvent) => { 
      e.preventDefault(); 
      setIsDraggingFile(false); 
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      Array.from(e.dataTransfer.files).forEach((file) => processFile(file as File));
    }
  };

  // --- Library Actions ---
  
  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedLibraryIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedLibraryIds(newSet);
  };

  const toggleGroupExpand = (groupId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const newSet = new Set(expandedGroupIds);
      if (newSet.has(groupId)) newSet.delete(groupId);
      else newSet.add(groupId);
      setExpandedGroupIds(newSet);
  };

  const handleCreateGroup = () => {
    const selectedLayers = layers.filter(l => selectedLibraryIds.has(l.id) && !l.groupId);
    if (selectedLayers.length < 2) return;

    createGroupFromLayers(selectedLayers.map(l => l.id));
    
    setSelectedLibraryIds(new Set());
    setIsSelectionMode(false);
  };

  const createGroupFromLayers = (layerIds: string[]) => {
    const newGroup: AssetGroup = {
      id: crypto.randomUUID(),
      name: `Group ${groups.length + 1}`,
      layerIds: layerIds,
      crops: []
    };

    setGroups(prev => [...prev, newGroup]);
    setLayers(prev => prev.map(l => layerIds.includes(l.id) ? { ...l, groupId: newGroup.id } : l));
    setExpandedGroupIds(prev => new Set(prev).add(newGroup.id));
    setActiveAssetId(newGroup.id);
  };

  const handleUngroup = (groupId: string) => {
    // Release layers
    setLayers(prev => prev.map(l => l.groupId === groupId ? { ...l, groupId: undefined } : l));
    // Release subgroups
    setGroups(prev => {
        const groupToDelete = prev.find(g => g.id === groupId);
        // Remove the group
        const withoutGroup = prev.filter(g => g.id !== groupId);
        // If there were subgroups, unset their parent
        return withoutGroup.map(g => g.parentGroupId === groupId ? { ...g, parentGroupId: undefined } : g);
    });

    if (activeAssetId === groupId) setActiveAssetId(null);
  };

  const handleDeleteItem = (id: string, type: 'group' | 'layer') => {
      if (type === 'group') {
          // Identify all subgroups recursively
          const getSubGroups = (pId: string): string[] => {
              const children = groups.filter(g => g.parentGroupId === pId);
              return [pId, ...children.flatMap(c => getSubGroups(c.id))];
          };
          const allGroupIds = getSubGroups(id);
          
          // Identify all layers in these groups
          const allLayerIds = new Set<string>();
          groups.forEach(g => {
              if (allGroupIds.includes(g.id)) {
                  g.layerIds.forEach(lid => allLayerIds.add(lid));
              }
          });
          
          setGroups(prev => prev.filter(g => !allGroupIds.includes(g.id)));
          setLayers(prev => prev.filter(l => !allLayerIds.has(l.id)));

          if (activeAssetId && (allGroupIds.includes(activeAssetId) || allLayerIds.has(activeAssetId))) {
             setActiveAssetId(null);
          }
      } else {
          setLayers(prev => prev.filter(l => l.id !== id));
          setGroups(prev => prev.map(g => ({ ...g, layerIds: g.layerIds.filter(lid => lid !== id) })));
          if (activeAssetId === id) setActiveAssetId(null);
      }
      setActiveMenuGroupId(null);
  };

  const handleRenameGroup = (groupId: string, newName: string) => {
      if (!newName.trim()) return;
      setGroups(prev => prev.map(g => g.id === groupId ? { ...g, name: newName } : g));
      setRenamingGroupId(null);
  };

  // --- Subgroup Creation ---
  const handleCreateSubgroup = (parentGroupId: string, newLayers: ImageLayer[]) => {
      const newLayerIds = newLayers.map(l => l.id);
      
      const newSubGroup: AssetGroup = {
          id: crypto.randomUUID(),
          name: `Selection Stitch ${groups.filter(g => g.parentGroupId === parentGroupId).length + 1}`,
          layerIds: newLayerIds,
          crops: [],
          parentGroupId: parentGroupId
      };

      // Add new layers
      setLayers(prev => [...prev, ...newLayers.map(l => ({ ...l, groupId: newSubGroup.id }))]);
      
      // Add new group
      setGroups(prev => [...prev, newSubGroup]);
      
      // Expand parent to show new subgroup
      setExpandedGroupIds(prev => new Set(prev).add(parentGroupId).add(newSubGroup.id));
      
      // Switch view to new subgroup
      setActiveAssetId(newSubGroup.id);
  };

  // --- Library Internal Drag & Drop ---

  const handleLibraryDragStart = (e: React.DragEvent, id: string) => {
      // e.dataTransfer.effectAllowed = 'move';
      setDraggedLibraryItemId(id);
  };
  
  const handleLibraryDragOverItem = (e: React.DragEvent, id: string) => {
      e.preventDefault();
      e.stopPropagation();
      if (draggedLibraryItemId && draggedLibraryItemId !== id) {
          setDragTargetId(id);
      }
  };

  const handleLibraryDropItem = (e: React.DragEvent, targetId: string, isTargetGroup: boolean) => {
      e.preventDefault();
      e.stopPropagation();
      setDragTargetId(null);
      
      const sourceId = draggedLibraryItemId;
      setDraggedLibraryItemId(null);

      if (!sourceId || sourceId === targetId) return;

      const sourceLayer = layers.find(l => l.id === sourceId);
      if (!sourceLayer) return; // Only dragging layers supported for simplicity

      // --- 1. REORDERING (Same Group) ---
      const targetLayer = layers.find(l => l.id === targetId);
      if (sourceLayer.groupId && targetLayer?.groupId && sourceLayer.groupId === targetLayer.groupId) {
          const groupId = sourceLayer.groupId;
          setGroups(prev => prev.map(g => {
              if (g.id !== groupId) return g;
              const newIds = [...g.layerIds];
              const oldIndex = newIds.indexOf(sourceId);
              const newIndex = newIds.indexOf(targetId);
              if (oldIndex !== -1 && newIndex !== -1) {
                  // Remove from old
                  newIds.splice(oldIndex, 1);
                  // Insert at new
                  newIds.splice(newIndex, 0, sourceId);
              }
              return { ...g, layerIds: newIds };
          }));
          return;
      }

      // --- 2. GROUPING ---
      
      // Drop on Group -> Add to Group
      if (isTargetGroup) {
          const targetGroup = groups.find(g => g.id === targetId);
          if (targetGroup && sourceLayer.groupId !== targetId) {
             if (sourceLayer.groupId) {
                 removeLayerFromGroup(sourceLayer.id, sourceLayer.groupId);
             }
             setGroups(prev => prev.map(g => g.id === targetId ? { ...g, layerIds: [...g.layerIds, sourceId] } : g));
             setLayers(prev => prev.map(l => l.id === sourceId ? { ...l, groupId: targetId } : l));
             setExpandedGroupIds(prev => new Set(prev).add(targetId));
          }
      } 
      // Drop on Layer -> Create Group (or add to existing group if target is in one)
      else {
          if (targetLayer && targetLayer.groupId) {
              // Target is in a group -> Add to that group
              if (sourceLayer.groupId !== targetLayer.groupId) {
                  if (sourceLayer.groupId) removeLayerFromGroup(sourceLayer.id, sourceLayer.groupId);
                  setGroups(prev => prev.map(g => g.id === targetLayer.groupId ? { ...g, layerIds: [...g.layerIds, sourceId] } : g));
                  setLayers(prev => prev.map(l => l.id === sourceId ? { ...l, groupId: targetLayer.groupId } : l));
                  setExpandedGroupIds(prev => new Set(prev).add(targetLayer.groupId!));
              }
          } 
          else if (targetLayer && !targetLayer.groupId) {
               // Target is root -> New Group
               if (sourceLayer.groupId) removeLayerFromGroup(sourceLayer.id, sourceLayer.groupId);
               createGroupFromLayers([targetId, sourceId]);
          }
      }
  };

  const removeLayerFromGroup = (layerId: string, groupId: string) => {
      setGroups(prev => {
          const group = prev.find(g => g.id === groupId);
          if (!group) return prev;
          const newIds = group.layerIds.filter(id => id !== layerId);
          return prev.map(g => g.id === groupId ? { ...g, layerIds: newIds } : g);
      });
  };

  const handleReorderGroup = (groupId: string, fromIndex: number, toIndex: number) => {
      setGroups(prev => prev.map(g => {
          if (g.id !== groupId) return g;
          const newIds = [...g.layerIds];
          const [moved] = newIds.splice(fromIndex, 1);
          newIds.splice(toIndex, 0, moved);
          return { ...g, layerIds: newIds };
      }));
  };

  const handleDeleteSelected = () => {
    const groupsToDelete = groups.filter(g => selectedLibraryIds.has(g.id));
    const groupIdsToDelete = new Set(groupsToDelete.map(g => g.id));
    const layerIdsToDelete = new Set(layers.filter(l => selectedLibraryIds.has(l.id)).map(l => l.id));
    
    groupsToDelete.forEach(g => g.layerIds.forEach(id => layerIdsToDelete.add(id)));

    setGroups(prev => prev.filter(g => !groupIdsToDelete.has(g.id)));
    setLayers(prev => prev.filter(l => !layerIdsToDelete.has(l.id)));
    
    setSelectedLibraryIds(new Set());
    setIsSelectionMode(false);
    setActiveAssetId(null);
  };

  // --- Editor Links ---
  const handleUpdateLayer = (updatedLayer: ImageLayer) => {
    setLayers(prev => prev.map(l => l.id === updatedLayer.id ? updatedLayer : l));
  };
  
  const handleUpdateGroupCrops = (groupId: string, newCrops: CropRegion[]) => {
      setGroups(prev => prev.map(g => g.id === groupId ? { ...g, crops: newCrops } : g));
  };

  const handleAddToStitch = (layerId: string, cropId: string) => {
    // Check if it's a layer
    let found = false;
    const updatedLayers = layers.map(l => {
       if (l.id !== layerId) return l;
       found = true;
       return {
         ...l,
         crops: l.crops.map(c => c.id === cropId ? { ...c, isStitched: true } : c)
       };
    });
    
    if (found) {
        setLayers(updatedLayers);
        const newItem: StitchItem = { id: crypto.randomUUID(), layerId, cropId };
        setStitchItems(prev => [...prev, newItem]);
        return;
    }

    // Check if it's a group
    const group = groups.find(g => g.id === layerId);
    if (group) {
        setGroups(prev => prev.map(g => {
            if (g.id !== layerId) return g;
            return {
                ...g,
                crops: g.crops.map(c => c.id === cropId ? { ...c, isStitched: true } : c)
            };
        }));
        const newItem: StitchItem = { id: crypto.randomUUID(), layerId, cropId };
        setStitchItems(prev => [...prev, newItem]);
    }
  };

  const handleCreateSmartStitchSession = () => {
    const nextSession = createSmartStitchSession(smartStitchSessions.length + 1);
    setSmartStitchSessions((prev) => [nextSession, ...prev]);
    setActiveSmartStitchSessionId(nextSession.id);
    setActiveTab('smartStitch');
  };

  const handleUpdateSmartStitchSession = (nextSession: SmartStitchSession) => {
    setSmartStitchSessions((prev) =>
      prev.map((session) =>
        session.id === nextSession.id
          ? {
              ...nextSession,
              updatedAt: nextSession.updatedAt ?? new Date().toISOString(),
            }
          : session
      )
    );
  };

  const handleDeleteSmartStitchSession = (sessionId: string) => {
    setSmartStitchSessions((prev) => {
      if (prev.length === 1) {
        const freshSession = createSmartStitchSession(1);
        setActiveSmartStitchSessionId(freshSession.id);
        return [freshSession];
      }

      const nextSessions = prev.filter((session) => session.id !== sessionId);
      if (activeSmartStitchSessionId === sessionId) {
        setActiveSmartStitchSessionId(nextSessions[0]?.id ?? null);
      }
      return nextSessions;
    });
  };

  // --- Filtered Library List ---
  const { rootGroups, rootLayers } = useMemo(() => {
    return {
      rootLayers: layers.filter(l => !l.groupId),
      rootGroups: groups.filter(g => !g.parentGroupId)
    };
  }, [layers, groups]);

  // Recursive Group Renderer
  const renderGroup = (group: AssetGroup, level: number = 0) => {
     const isActive = activeAssetId === group.id;
     const isSelected = selectedLibraryIds.has(group.id);
     const isExpanded = expandedGroupIds.has(group.id);
     const isEditing = renamingGroupId === group.id;
     const isDragTarget = dragTargetId === group.id;
     const isMenuOpen = activeMenuGroupId === group.id;

     // Find Subgroups
     const subGroups = groups.filter(g => g.parentGroupId === group.id);

     return (
         <div 
            key={group.id}
            onDragOver={(e) => handleLibraryDragOverItem(e, group.id)}
            onDrop={(e) => handleLibraryDropItem(e, group.id, true)}
            className={`
                border-b border-border/50 transition-all relative
                ${isActive ? 'bg-accentDim/30' : ''}
                ${isDragTarget ? 'ring-2 ring-accent ring-inset bg-accent/5' : ''}
            `}
            style={{ marginLeft: level * 8 }} // reduced indentation to fit better
         >
             {/* Drop Highlight Indicator */}
             {isDragTarget && (
                 <div className="absolute inset-0 z-50 pointer-events-none flex items-center justify-center bg-accent/10">
                    <span className="text-accent font-bold text-xs bg-background px-2 py-1 rounded shadow-sm">
                        Release to Add
                    </span>
                 </div>
             )}
             
             {/* Tree Lines for visual nesting (only if not root) */}
             {level > 0 && (
                 <div className="absolute -left-2 top-0 bottom-0 border-l border-border/50"></div>
             )}

             <div 
                onClick={() => {
                    if(isSelectionMode) toggleSelection(group.id);
                    else { /* Click expands by default, explicit button needed for View */
                        if (!isExpanded) setExpandedGroupIds(prev => new Set(prev).add(group.id));
                        else setExpandedGroupIds(prev => { const s = new Set(prev); s.delete(group.id); return s; });
                    }
                }}
                className={`
                    relative p-3 cursor-pointer flex gap-2 items-center hover:bg-surface group
                    ${isSelected ? 'bg-accent/5' : ''}
                `}
             >
                 <button 
                    onClick={(e) => toggleGroupExpand(group.id, e)}
                    className="p-1 hover:bg-border rounded text-secondary hover:text-primary"
                 >
                     {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                 </button>

                 <div className="text-accent">
                     {isExpanded ? <FolderOpen size={18} /> : <Folder size={18} />}
                 </div>

                 <div className="flex-1 min-w-0 flex flex-col justify-center">
                     {isEditing ? (
                         <input 
                            autoFocus
                            className="w-full bg-background border border-accent text-sm px-1 py-0.5 rounded outline-none"
                            defaultValue={group.name}
                            onBlur={(e) => handleRenameGroup(group.id, e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleRenameGroup(group.id, e.currentTarget.value);
                            }}
                            onClick={(e) => e.stopPropagation()}
                         />
                     ) : (
                        <h4 
                            className={`font-medium text-xs truncate select-none ${isActive ? 'text-accent' : 'text-primary'}`}
                            onDoubleClick={(e) => {
                                if (!isSelectionMode) {
                                    e.stopPropagation();
                                    setRenamingGroupId(group.id);
                                }
                            }}
                        >
                            {group.name}
                        </h4>
                     )}
                     <span className="text-[9px] text-secondary">{group.layerIds.length} items</span>
                 </div>

                 {!isSelectionMode && (
                     <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                setActiveAssetId(group.id); 
                                setActiveTab('editor');
                            }}
                            className="p-1.5 rounded hover:bg-accent hover:text-white text-secondary transition-colors"
                            title="View Composition"
                        >
                            <Eye size={14} />
                        </button>
                         <div className="relative">
                             <button 
                                onClick={(e) => { e.stopPropagation(); setActiveMenuGroupId(isMenuOpen ? null : group.id); }}
                                className={`p-1.5 rounded hover:bg-border text-secondary hover:text-primary ${isMenuOpen ? 'bg-border text-primary' : ''}`}
                             >
                                 <MoreVertical size={14} />
                             </button>

                             {isMenuOpen && (
                                 <div className="absolute right-0 top-8 w-40 bg-background border border-border shadow-elevated rounded-md overflow-hidden z-50 animate-fade-in">
                                     <button 
                                         onClick={(e) => { e.stopPropagation(); setRenamingGroupId(group.id); setActiveMenuGroupId(null); }}
                                         className="w-full text-left px-4 py-2 text-xs hover:bg-surface flex items-center gap-2"
                                     >
                                         <Edit2 size={12} /> Rename
                                     </button>
                                     <button 
                                         onClick={(e) => { e.stopPropagation(); handleUngroup(group.id); }}
                                         className="w-full text-left px-4 py-2 text-xs hover:bg-surface flex items-center gap-2"
                                     >
                                         <Ungroup size={12} /> Disband
                                     </button>
                                     <div className="h-px bg-border"></div>
                                     <button 
                                         onClick={(e) => { e.stopPropagation(); handleDeleteItem(group.id, 'group'); }}
                                         className="w-full text-left px-4 py-2 text-xs hover:bg-red-50 text-red-500 flex items-center gap-2"
                                     >
                                         <Trash2 size={12} /> Delete
                                     </button>
                                 </div>
                             )}
                         </div>
                     </div>
                 )}
                 
                 {isSelectionMode && (
                     <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? 'bg-accent border-accent text-white' : 'border-secondary'}`}>
                         {isSelected && <CheckSquare size={12} />}
                     </div>
                 )}
             </div>

             {isExpanded && (
                 <div className="border-l border-border/50 ml-4 pl-1">
                     {/* Render Subgroups First */}
                     {subGroups.map(sg => renderGroup(sg, level + 1))}

                     {/* Render Layers */}
                     {group.layerIds.map(layerId => {
                         const layer = layers.find(l => l.id === layerId);
                         if (!layer) return null;
                         // Check for drop target on layer itself for reordering
                         const isLayerDragTarget = dragTargetId === layer.id;
                         const isLayerActive = activeAssetId === layer.id;
                         const isLayerMenuOpen = activeMenuGroupId === layer.id;

                         return (
                             <div 
                                key={layer.id} 
                                draggable={!isSelectionMode}
                                onDragStart={(e) => handleLibraryDragStart(e, layer.id)}
                                onDragOver={(e) => handleLibraryDragOverItem(e, layer.id)}
                                onDrop={(e) => handleLibraryDropItem(e, layer.id, false)}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if(isSelectionMode) toggleSelection(layer.id);
                                    else { setActiveAssetId(layer.id); setActiveTab('editor'); }
                                }}
                                className={`
                                    relative pl-2 pr-3 py-1.5 flex items-center gap-2 border-b border-border/30 cursor-pointer group/layer
                                    ${isLayerDragTarget ? 'bg-accent/10 border-accent/20' : ''}
                                    ${isLayerActive ? 'bg-accentDim/50 text-accent' : 'hover:bg-background text-secondary hover:text-primary'}
                                `}
                             >
                                 {isLayerDragTarget && (
                                    <div className="absolute inset-y-0 left-0 w-0.5 bg-accent"></div>
                                 )}
                                 
                                 <div className="w-6 h-6 rounded overflow-hidden bg-surface border border-border flex-shrink-0">
                                     <img src={layer.src} className="w-full h-full object-cover" alt="" />
                                 </div>
                                 <span className={`text-[11px] truncate flex-1 ${isLayerActive ? 'font-medium' : ''}`}>{layer.name}</span>
                                 
                                 <div className={`opacity-0 group-hover/layer:opacity-100 transition-opacity flex items-center ${isLayerActive || isLayerMenuOpen ? 'opacity-100' : ''}`}>
                                    <div className="relative">
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); setActiveMenuGroupId(isLayerMenuOpen ? null : layer.id); }}
                                            className={`p-1 rounded hover:bg-border/50 text-secondary ${isLayerMenuOpen ? 'text-primary' : ''}`}
                                        >
                                            <MoreVertical size={10} />
                                        </button>
                                        {isLayerMenuOpen && (
                                            <div className="absolute right-0 top-5 w-32 bg-background border border-border shadow-elevated rounded-md overflow-hidden z-50">
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); handleDeleteItem(layer.id, 'layer'); }}
                                                    className="w-full text-left px-3 py-1.5 text-[10px] hover:bg-red-50 text-red-500 flex items-center gap-2"
                                                >
                                                    <Trash2 size={10} /> Delete
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    {isLayerActive ? <div className="w-1.5 h-1.5 rounded-full bg-accent ml-1"></div> : <GripVertical size={10} className="text-border ml-1" />}
                                 </div>
                             </div>
                         );
                     })}
                 </div>
             )}
         </div>
     );
  };

  return (
    <div className="flex h-screen bg-background text-primary font-sans overflow-hidden selection:bg-accent selection:text-white transition-colors duration-300">
      
      {/* --- SIDEBAR --- */}
      <aside className="w-[72px] flex flex-col items-center py-8 border-r border-border bg-background z-30 transition-colors duration-300">
        <div className="mb-12 text-accent" title="Laniameda">
           <Hexagon size={28} strokeWidth={2} className="fill-accent/10" />
        </div>

        <nav className="flex flex-col gap-4 w-full items-center px-2">
          <NavButton 
            active={activeTab === 'editor'} 
            onClick={() => setActiveTab('editor')}
            icon={<BoxSelect size={22} strokeWidth={1.5} />}
            label="Canvas"
          />
          <NavButton
            active={activeTab === 'stitch'}
            onClick={() => setActiveTab('stitch')}
            icon={<LayoutGrid size={22} strokeWidth={1.5} />}
            label="Manual Stitch"
          />
          <NavButton
            active={activeTab === 'smartStitch'}
            onClick={() => setActiveTab('smartStitch')}
            icon={<Layers size={22} strokeWidth={1.5} />}
            label="Smart Stitch"
          />
          <NavButton
            active={activeTab === 'colors'}
            onClick={() => setActiveTab('colors')}
            icon={<Palette size={22} strokeWidth={1.5} />}
            label="Colors"
          />
        </nav>

        <div className="mt-auto flex flex-col gap-4 items-center">
           <button onClick={toggleTheme} className="w-10 h-10 rounded-full hover:bg-surface text-secondary hover:text-primary flex items-center justify-center transition-all">
              {isDarkMode ? <Sun size={20} strokeWidth={1.5} /> : <Moon size={20} strokeWidth={1.5} />}
           </button>
           <button className="w-10 h-10 rounded-full hover:bg-surface text-secondary hover:text-primary flex items-center justify-center transition-all">
              <Settings2 size={20} strokeWidth={1.5} />
           </button>
        </div>
      </aside>

      {/* --- MAIN AREA --- */}
      <main 
        className="flex-1 flex flex-col relative bg-background overflow-hidden transition-colors duration-300"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDraggingFile && (
           <div className="absolute inset-4 z-50 border-2 border-dashed border-accent bg-accent/5 rounded-3xl flex items-center justify-center backdrop-blur-sm animate-fade-in pointer-events-none">
              <div className="bg-background px-8 py-4 rounded-full shadow-elevated border border-accent/20 flex items-center gap-3">
                 <Upload className="text-accent animate-bounce" size={24} />
                 <span className="font-serif text-xl text-primary">Drop to Upload</span>
              </div>
           </div>
        )}

        {(activeTab === 'editor' || activeTab === 'stitch') && (
        <header className="absolute top-0 left-0 right-0 h-20 flex items-center justify-between px-10 z-10 pointer-events-none">
          <div className="pointer-events-auto flex flex-col">
             <div className="flex items-center gap-2">
                 <span className="font-mono text-[10px] text-accent font-bold tracking-widest uppercase">01 — {activeTab}</span>
                 <div className="h-px w-8 bg-accent"></div>
             </div>
             <h1 className="font-serif text-3xl text-primary mt-1 transition-colors duration-300">
                {activeTab === 'editor' ? (activeGroup ? activeGroup.name : (activeLayer ? activeLayer.name : 'The Workstation')) : 'Manual Assembly'}
             </h1>
          </div>

          {/* Context Info */}
          {activeTab === 'editor' && (
             <div className="pointer-events-auto bg-surface border border-border px-4 py-2 flex items-center gap-3 shadow-sm transition-colors duration-300">
                <span className="font-mono text-xs text-secondary">ACTIVE ASSET</span>
                <span className="w-px h-4 bg-border"></span>
                <span className="font-medium text-sm text-primary max-w-[200px] truncate">
                   {activeGroup ? 'STITCHED GROUP' : (activeLayer ? (activeLayer.groupId ? 'GROUP LAYER' : 'SOURCE IMAGE') : 'NONE')}
                </span>
             </div>
          )}
        </header>
        )}

        <div className={`flex-1 w-full h-full ${activeTab === 'editor' || activeTab === 'stitch' ? 'pt-20' : ''} px-0 relative`}>
           {(activeTab === 'editor' || activeTab === 'stitch') && <div className="absolute inset-0 grid-bg pointer-events-none z-0"></div>}

           {activeTab === 'editor' ? (
             activeGroup ? (
                <GroupStitchView 
                    group={activeGroup} 
                    allLayers={layers} 
                    onUpdateGroupCrops={handleUpdateGroupCrops} 
                    onAddToStitch={handleAddToStitch}
                    onReorder={handleReorderGroup}
                    onCreateSubgroup={handleCreateSubgroup}
                />
             ) : activeLayer ? (
                <div className="w-full h-full flex items-center justify-center animate-fade-in relative z-10 p-6">
                   <ImageCropper 
                     layer={activeLayer} 
                     onUpdateLayer={handleUpdateLayer} 
                     onAddToStitch={handleAddToStitch} 
                   />
                </div>
             ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-6 animate-fade-in z-10 relative pointer-events-none">
                   <div className="w-24 h-24 border border-dashed border-border rounded-full flex items-center justify-center bg-surface transition-colors duration-300">
                      <Upload size={32} className="text-secondary/50" />
                   </div>
                   <div className="text-center space-y-2">
                     <h3 className="font-serif text-3xl text-primary transition-colors duration-300">Laniameda Workspace</h3>
                     <p className="font-mono text-[10px] uppercase tracking-widest text-secondary">
                         Select an Asset or Group to Begin
                     </p>
                   </div>
                </div>
             )
           ) : activeTab === 'stitch' ? (
             <StitchView layers={layers} groups={groups} stitchItems={stitchItems} setStitchItems={setStitchItems} />
           ) : activeTab === 'smartStitch' ? (
             activeSmartStitchSession ? (
               <SmartStitchView
                 session={activeSmartStitchSession}
                 onUpdateSession={handleUpdateSmartStitchSession}
               />
             ) : null
           ) : (
             <ColorExplorerView />
           )}
        </div>
      </main>

      {/* --- RIGHT PANEL (LIBRARY) — hidden on self-contained views --- */}
      {(activeTab === 'editor' || activeTab === 'stitch' || activeTab === 'smartStitch') && (
      <aside className="w-80 bg-background border-l border-border flex flex-col z-20 shadow-sharp transition-colors duration-300">
        {activeTab === 'smartStitch' ? (
          <SmartStitchExplorer
            sessions={smartStitchSessions}
            activeSessionId={activeSmartStitchSession?.id ?? null}
            onSelectSession={setActiveSmartStitchSessionId}
            onCreateSession={handleCreateSmartStitchSession}
            onDeleteSession={handleDeleteSmartStitchSession}
          />
        ) : (
          <LibraryPanel
            isSelectionMode={isSelectionMode}
            selectedLibraryIds={selectedLibraryIds}
            layers={layers}
            rootGroups={rootGroups}
            rootLayers={rootLayers}
            activeAssetId={activeAssetId}
            dragTargetId={dragTargetId}
            activeMenuGroupId={activeMenuGroupId}
            fileInputRef={fileInputRef}
            renderGroup={renderGroup}
            handleCreateGroup={handleCreateGroup}
            handleDeleteSelected={handleDeleteSelected}
            setIsSelectionMode={setIsSelectionMode}
            setSelectedLibraryIds={setSelectedLibraryIds}
            handleFileUpload={handleFileUpload}
            handleLibraryDragStart={handleLibraryDragStart}
            handleLibraryDragOverItem={handleLibraryDragOverItem}
            handleLibraryDropItem={handleLibraryDropItem}
            toggleSelection={toggleSelection}
            setActiveAssetId={setActiveAssetId}
            setActiveTab={setActiveTab}
            setActiveMenuGroupId={setActiveMenuGroupId}
            handleDeleteItem={handleDeleteItem}
          />
        )}
      </aside>
      )}

    </div>
  );
}

// --- Helper Components ---

type MainTab = 'editor' | 'stitch' | 'smartStitch' | 'colors';

interface LibraryPanelProps {
    isSelectionMode: boolean;
    selectedLibraryIds: Set<string>;
    layers: ImageLayer[];
    rootGroups: AssetGroup[];
    rootLayers: ImageLayer[];
    activeAssetId: string | null;
    dragTargetId: string | null;
    activeMenuGroupId: string | null;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    renderGroup: (group: AssetGroup, level?: number) => React.ReactNode;
    handleCreateGroup: () => void;
    handleDeleteSelected: () => void;
    setIsSelectionMode: React.Dispatch<React.SetStateAction<boolean>>;
    setSelectedLibraryIds: React.Dispatch<React.SetStateAction<Set<string>>>;
    handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handleLibraryDragStart: (e: React.DragEvent, id: string) => void;
    handleLibraryDragOverItem: (e: React.DragEvent, id: string) => void;
    handleLibraryDropItem: (e: React.DragEvent, targetId: string, isTargetGroup: boolean) => void;
    toggleSelection: (id: string) => void;
    setActiveAssetId: React.Dispatch<React.SetStateAction<string | null>>;
    setActiveTab: React.Dispatch<React.SetStateAction<MainTab>>;
    setActiveMenuGroupId: React.Dispatch<React.SetStateAction<string | null>>;
    handleDeleteItem: (id: string, type: 'group' | 'layer') => void;
}

const LibraryPanel: React.FC<LibraryPanelProps> = ({
    isSelectionMode,
    selectedLibraryIds,
    layers,
    rootGroups,
    rootLayers,
    activeAssetId,
    dragTargetId,
    activeMenuGroupId,
    fileInputRef,
    renderGroup,
    handleCreateGroup,
    handleDeleteSelected,
    setIsSelectionMode,
    setSelectedLibraryIds,
    handleFileUpload,
    handleLibraryDragStart,
    handleLibraryDragOverItem,
    handleLibraryDropItem,
    toggleSelection,
    setActiveAssetId,
    setActiveTab,
    setActiveMenuGroupId,
    handleDeleteItem,
}) => (
    <>
      <div className="h-20 flex items-center justify-between px-6 border-b border-border bg-background/50 backdrop-blur-sm">
         {!isSelectionMode ? (
            <>
              <div>
                  <span className="font-mono text-[10px] text-accent tracking-widest uppercase block mb-1">LIBRARY</span>
                  <span className="font-serif text-lg text-primary flex items-center gap-2 transition-colors duration-300">
                      Assets <span className="font-sans text-xs text-secondary font-normal">({layers.length})</span>
                  </span>
              </div>
              <div className="flex gap-2">
                  <button 
                      onClick={() => setIsSelectionMode(true)}
                      className="w-10 h-10 flex items-center justify-center text-secondary hover:text-primary hover:bg-surface transition-colors rounded-full"
                      title="Select Items"
                  >
                      <CheckSquare size={20} />
                  </button>
                  <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="w-10 h-10 flex items-center justify-center bg-inverse text-inverseText hover:bg-accent hover:text-white transition-colors shadow-lg rounded-full"
                      title="Upload"
                  >
                      <Plus size={20} />
                  </button>
              </div>
            </>
         ) : (
             <div className="flex-1 flex items-center justify-between animate-fade-in">
                 <span className="font-mono text-xs text-accent font-bold">{selectedLibraryIds.size} SELECTED</span>
                 
                 <div className="flex items-center gap-2">
                     {selectedLibraryIds.size >= 2 && (
                         <button 
                             onClick={handleCreateGroup}
                             className="h-9 px-3 bg-accent text-white rounded-md text-xs font-bold flex items-center gap-2 hover:bg-orange-600 transition-colors"
                         >
                             <Group size={16} /> Group
                         </button>
                     )}
                     
                     {selectedLibraryIds.size > 0 && (
                         <button 
                             onClick={handleDeleteSelected}
                             className="h-9 w-9 bg-red-500/10 text-red-500 rounded-md flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors"
                         >
                             <Trash2 size={16} />
                         </button>
                     )}
                     
                     <button 
                          onClick={() => { setIsSelectionMode(false); setSelectedLibraryIds(new Set()); }}
                          className="h-9 w-9 text-secondary hover:text-primary rounded-md flex items-center justify-center"
                     >
                          <X size={20} />
                     </button>
                 </div>
             </div>
         )}
         <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*" multiple />
      </div>

      <div className="flex-1 overflow-y-auto p-0 scroll-smooth">
         {rootGroups.length === 0 && rootLayers.length === 0 && (
           <div className="p-10 text-center border-b border-border border-dashed m-6">
              <span className="text-xs text-secondary uppercase tracking-wider">Empty State</span>
           </div>
         )}

         {rootGroups.length > 0 && (
             <div className="border-b border-border/50">
                 {rootGroups.map(g => renderGroup(g))}
             </div>
         )}

         {rootLayers.length > 0 && (
             <div>
                 {rootGroups.length > 0 && (
                     <div className="px-4 py-2 bg-surface/50 border-b border-border/50 text-[10px] font-mono uppercase tracking-widest text-secondary flex items-center gap-2">
                         <FileImage size={10} /> Source Assets
                     </div>
                 )}
                 
                 {rootLayers.map(layer => {
                   const isActive = activeAssetId === layer.id;
                   const isSelected = selectedLibraryIds.has(layer.id);
                   const isDragTarget = dragTargetId === layer.id;
                   const isMenuOpen = activeMenuGroupId === layer.id;
                   
                   return (
                      <div 
                        key={layer.id}
                        draggable={!isSelectionMode}
                        onDragStart={(e) => handleLibraryDragStart(e, layer.id)}
                        onDragOver={(e) => handleLibraryDragOverItem(e, layer.id)}
                        onDrop={(e) => handleLibraryDropItem(e, layer.id, false)}
                        onClick={() => {
                          if (isSelectionMode) toggleSelection(layer.id);
                          else { setActiveAssetId(layer.id); setActiveTab('editor'); }
                        }}
                        className={`
                          relative p-3 cursor-pointer transition-all border-b border-border/50 group
                          ${isActive ? 'bg-accentDim' : 'hover:bg-surface'}
                          ${isSelected ? 'bg-accent/5' : ''}
                          ${isDragTarget ? 'ring-2 ring-accent ring-inset bg-accent/5' : ''}
                        `}
                      >
                          {isDragTarget && (
                               <div className="absolute inset-0 z-50 pointer-events-none flex items-center justify-center bg-accent/10">
                                  <span className="text-accent font-bold text-xs bg-background px-2 py-1 rounded shadow-sm">
                                      Release to Group
                                  </span>
                               </div>
                          )}

                         <div className="flex gap-3 items-center">
                             <div className="w-10 h-10 bg-surface border border-border overflow-hidden flex-shrink-0 relative shadow-sm rounded-sm">
                               <img src={layer.src} className="w-full h-full object-cover" alt="" />
                             </div>
                             
                             <div className="flex-1 min-w-0">
                               <h4 className={`font-medium text-xs truncate ${isActive ? 'text-accent' : 'text-primary'}`}>
                                 {layer.name}
                               </h4>
                               <div className="flex items-center gap-2 mt-0.5">
                                 <span className="font-mono text-[9px] text-secondary bg-surface px-1.5 border border-border rounded-sm">
                                   {layer.width}×{layer.height}
                                 </span>
                               </div>
                             </div>
                             
                             {!isSelectionMode && (
                                 <div className={`opacity-0 group-hover:opacity-100 transition-opacity ${isActive || isMenuOpen ? 'opacity-100' : ''}`}>
                                      <div className="relative">
                                          <button 
                                              onClick={(e) => { e.stopPropagation(); setActiveMenuGroupId(isMenuOpen ? null : layer.id); }}
                                              className={`p-1.5 rounded hover:bg-border/50 text-secondary ${isMenuOpen ? 'text-primary' : ''}`}
                                          >
                                              <MoreVertical size={14} />
                                          </button>
                                          {isMenuOpen && (
                                              <div className="absolute right-0 top-8 w-32 bg-background border border-border shadow-elevated rounded-md overflow-hidden z-50 animate-fade-in">
                                                  <button 
                                                      onClick={(e) => { e.stopPropagation(); handleDeleteItem(layer.id, 'layer'); }}
                                                      className="w-full text-left px-3 py-2 text-xs hover:bg-red-50 text-red-500 flex items-center gap-2"
                                                  >
                                                      <Trash2 size={12} /> Delete
                                                  </button>
                                              </div>
                                          )}
                                      </div>
                                 </div>
                             )}
                             
                             {isSelectionMode ? (
                                 <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? 'bg-accent border-accent text-white' : 'border-secondary'}`}>
                                     {isSelected && <CheckSquare size={12} />}
                                 </div>
                             ) : isActive && <div className="w-1.5 h-1.5 rounded-full bg-accent"></div>}
                         </div>
                      </div>
                   );
                 })}
             </div>
         )}
      </div>
      
      <div className="p-6 bg-surface border-t border-border transition-colors duration-300">
           <h5 className="font-mono text-[10px] uppercase tracking-widest text-secondary mb-2">System Status</h5>
           <div className="flex items-center gap-2">
               <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
               <span className="text-xs font-medium text-primary">Live Sync Active</span>
           </div>
      </div>
    </>
);

interface SmartStitchExplorerProps {
    sessions: SmartStitchSession[];
    activeSessionId: string | null;
    onSelectSession: (sessionId: string) => void;
    onCreateSession: () => void;
    onDeleteSession: (sessionId: string) => void;
}

const SmartStitchExplorer: React.FC<SmartStitchExplorerProps> = ({
    sessions,
    activeSessionId,
    onSelectSession,
    onCreateSession,
    onDeleteSession,
}) => {
    const activeSession = sessions.find((session) => session.id === activeSessionId) ?? sessions[0] ?? null;

    const formatTimestamp = (timestamp: string) => {
        const parsed = new Date(timestamp);
        if (Number.isNaN(parsed.getTime())) return 'Saved recently';
        return parsed.toLocaleString([], {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        });
    };

    return (
        <>
          <div className="h-20 flex items-center justify-between px-6 border-b border-border bg-background/50 backdrop-blur-sm">
             <div>
                 <span className="font-mono text-[10px] text-accent tracking-widest uppercase block mb-1">STITCH FILES</span>
                 <span className="font-serif text-lg text-primary flex items-center gap-2 transition-colors duration-300">
                     Saved Stitches <span className="font-sans text-xs text-secondary font-normal">({sessions.length})</span>
                 </span>
             </div>
             <button
                onClick={onCreateSession}
                className="h-10 px-3 bg-inverse text-inverseText hover:bg-accent hover:text-white transition-colors shadow-lg rounded-full flex items-center gap-2 text-xs font-medium"
                title="Start New Stitch"
             >
                <CopyPlus size={16} />
                Start New
             </button>
          </div>

          <div className="flex-1 overflow-y-auto">
             <div className="p-4 border-b border-border bg-surface/40">
                 <span className="font-mono text-[10px] uppercase tracking-widest text-secondary">Session Explorer</span>
             </div>

             <div className="divide-y divide-border/50">
                {sessions.map((session) => {
                    const isActive = session.id === activeSessionId;
                    const preview = session.images[0]?.dataUrl ?? null;
                    return (
                        <button
                            key={session.id}
                            onClick={() => onSelectSession(session.id)}
                            className={`w-full text-left p-4 transition-colors ${isActive ? 'bg-accentDim/40' : 'hover:bg-surface'}`}
                        >
                            <div className="flex items-start gap-3">
                                <div className="w-14 h-14 rounded-lg overflow-hidden border border-border bg-surface flex-shrink-0">
                                    {preview ? (
                                        <img src={preview} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-secondary">
                                            <ImageIcon size={16} />
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2">
                                        <h4 className={`text-sm truncate ${isActive ? 'text-accent font-medium' : 'text-primary'}`}>
                                            {session.name}
                                        </h4>
                                        {sessions.length > 1 && (
                                            <span
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onDeleteSession(session.id);
                                                }}
                                                className="p-1 rounded hover:bg-red-500/10 hover:text-red-500 text-secondary"
                                            >
                                                <Trash2 size={14} />
                                            </span>
                                        )}
                                    </div>
                                    <div className="mt-1 flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-secondary">
                                        <span>{session.images.length} images</span>
                                        <span className="w-1 h-1 rounded-full bg-border"></span>
                                        <span>{formatTimestamp(session.updatedAt)}</span>
                                    </div>
                                    <div className="mt-2 flex items-center gap-2 text-[10px] text-secondary">
                                        <span className="rounded-sm border border-border px-1.5 py-0.5">
                                            {session.settings.containerWidth}px
                                        </span>
                                        <span className="rounded-sm border border-border px-1.5 py-0.5">
                                            {Math.round(session.settings.exportScale * 100)}%
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </button>
                    );
                })}
             </div>

             <div className="p-4 border-t border-border bg-surface/20">
                <div className="flex items-center gap-2 mb-3">
                    <ImageIcon size={14} className="text-accent" />
                    <span className="font-mono text-[10px] uppercase tracking-widest text-accent">Current Files</span>
                </div>
                {activeSession && activeSession.images.length > 0 ? (
                    <div className="space-y-2">
                        {activeSession.images.map((image) => (
                            <div key={image.id} className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2">
                                <div className="w-10 h-10 rounded-md overflow-hidden border border-border bg-surface flex-shrink-0">
                                    <img src={image.dataUrl} alt="" className="w-full h-full object-cover" />
                                </div>
                                <div className="min-w-0">
                                    <div className="text-xs text-primary truncate">{image.name}</div>
                                    <div className="text-[10px] font-mono uppercase tracking-wider text-secondary">
                                        {image.width}×{image.height}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="rounded-2xl border border-dashed border-border p-5 text-center text-xs text-secondary">
                        Start a new stitch, add images, then switch back here any time.
                    </div>
                )}
             </div>
          </div>
        </>
    );
};

const GroupStitchView: React.FC<{ 
    group: AssetGroup, 
    allLayers: ImageLayer[],
    onUpdateGroupCrops: (groupId: string, crops: CropRegion[]) => void,
    onAddToStitch: (layerId: string, cropId: string) => void,
    onReorder: (groupId: string, from: number, to: number) => void,
    onCreateSubgroup: (parentGroupId: string, newLayers: ImageLayer[]) => void
}> = ({ group, allLayers, onUpdateGroupCrops, onAddToStitch, onReorder, onCreateSubgroup }) => {
    const [stitchedData, setStitchedData] = useState<{ src: string, width: number, height: number } | null>(null);
    const [isArrangeMode, setIsArrangeMode] = useState(false);
    const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
    const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

    // Generation Effect - PROPAGATION LOGIC
    useEffect(() => {
        const generate = async () => {
            // Map over layer IDs to get the current source.
            // Critical: If a layer has crops with replacementSrc, we must generate a composite image
            // so that the modification propagates to this group stitch view.
            const sourcePromises = group.layerIds.map(async (id) => {
                const layer = allLayers.find(l => l.id === id);
                if (!layer) return null;
                
                // If layer has replacements, generate composite. Otherwise use raw src.
                const hasReplacements = layer.crops.some(c => c.replacementSrc);
                
                if (hasReplacements) {
                    return await generateCompositeImage(layer);
                } else {
                    return layer.src;
                }
            });

            const sources = (await Promise.all(sourcePromises)).filter(Boolean) as string[];
            
            if (sources.length > 0) {
                const url = await generateStitchedCanvas(sources);
                const img = new Image();
                img.onload = () => {
                   setStitchedData({ src: url, width: img.width, height: img.height });
                };
                img.src = url;
            } else {
                setStitchedData(null);
            }
        };
        generate();
    }, [group.layerIds, allLayers]); // Re-run whenever any layer in the system changes

    // Drag Logic for Arrange Mode
    const handleDragStart = (e: React.DragEvent, index: number) => {
        setDraggingIndex(index);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (draggingIndex === null || draggingIndex === index) return;
        setDropTargetIndex(index);
    };

    const handleDrop = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        if (draggingIndex !== null && dropTargetIndex !== null && draggingIndex !== dropTargetIndex) {
            onReorder(group.id, draggingIndex, dropTargetIndex);
        }
        setDraggingIndex(null);
        setDropTargetIndex(null);
    };

    const handleDragEnd = () => {
        setDraggingIndex(null);
        setDropTargetIndex(null);
    };

    // Proxy Layer for ImageCropper
    const proxyLayer: ImageLayer = React.useMemo(() => {
        if (!stitchedData) return { id: 'temp', name: 'Loading', src: '', width: 100, height: 100, crops: [] };
        return {
            id: group.id,
            name: group.name,
            src: stitchedData.src,
            width: stitchedData.width,
            height: stitchedData.height,
            crops: group.crops,
            groupId: 'proxy' 
        };
    }, [stitchedData, group.crops, group.id, group.name]);

    const handleProxyUpdate = (updatedProxy: ImageLayer) => {
        onUpdateGroupCrops(group.id, updatedProxy.crops);
    };

    const handleStitchSelections = async () => {
        if (!stitchedData || group.crops.length === 0) return;
        
        const newLayers: ImageLayer[] = [];
        
        for (const crop of group.crops) {
            let src: string | undefined = crop.replacementSrc || undefined;
            if (!src) {
                try {
                    src = await cropImage(stitchedData.src, crop, stitchedData.width, stitchedData.height);
                } catch (e) {
                    console.error("Failed to crop", e);
                    continue;
                }
            }
            if (src) {
                // Determine size
                const img = new Image();
                img.src = src;
                await new Promise(r => img.onload = r);
                
                newLayers.push({
                    id: crypto.randomUUID(),
                    name: `Cut ${crop.id.slice(0,4)}`,
                    src,
                    width: img.width,
                    height: img.height,
                    crops: []
                });
            }
        }

        if (newLayers.length > 0) {
            onCreateSubgroup(group.id, newLayers);
        }
    };

    return (
        <div className="w-full h-full flex flex-col relative">
            {/* Toolbar Toggle */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-background border border-border p-1 rounded-full shadow-md flex gap-2">
                <div className="flex gap-1">
                    <button
                        onClick={() => setIsArrangeMode(false)}
                        className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${!isArrangeMode ? 'bg-accent text-white' : 'text-secondary hover:text-primary'}`}
                    >
                        View & Crop
                    </button>
                    <button
                        onClick={() => setIsArrangeMode(true)}
                        className={`px-4 py-1.5 rounded-full text-xs font-medium flex items-center gap-2 transition-colors ${isArrangeMode ? 'bg-accent text-white' : 'text-secondary hover:text-primary'}`}
                    >
                        <ArrowLeftRight size={14} /> Arrange
                    </button>
                </div>
                
                {!isArrangeMode && group.crops.length > 0 && (
                    <div className="flex items-center gap-1 pl-2 border-l border-border/50">
                        <button 
                            onClick={handleStitchSelections}
                            className="bg-inverse hover:bg-black text-white px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-2 transition-colors animate-fade-in shadow-sm"
                        >
                            <Scissors size={12} />
                            Stitch Selection
                        </button>
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-hidden relative flex items-center justify-center bg-surface/30">
                
                {isArrangeMode ? (
                    // --- ARRANGE MODE (Interactive Stitched Simulation) ---
                    <div className="w-full h-full overflow-auto flex items-center justify-center p-8">
                        {/* We use a flex container that tries to center content. Images take up full height relative to this container constraint, or we can use a fixed height strip to mimic the stitch. */}
                        <div className="flex items-stretch shadow-2xl bg-background border border-border h-[60vh]">
                            {group.layerIds.map((layerId, index) => {
                                const layer = allLayers.find(l => l.id === layerId);
                                if (!layer) return null;
                                const isDragging = draggingIndex === index;
                                const isTarget = dropTargetIndex === index;
                                const isAfter = draggingIndex !== null && index > draggingIndex;

                                return (
                                    <div
                                        key={layerId}
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, index)}
                                        onDragOver={(e) => handleDragOver(e, index)}
                                        onDrop={handleDrop}
                                        onDragEnd={handleDragEnd}
                                        className={`
                                            relative cursor-grab active:cursor-grabbing group transition-all duration-200
                                            ${isDragging ? 'opacity-20' : 'opacity-100 hover:brightness-105'}
                                        `}
                                    >
                                        {/* Drop Indicators */}
                                        {isTarget && !isAfter && (
                                            <div className="absolute inset-y-0 left-0 w-1 bg-accent z-50 shadow-[0_0_10px_var(--color-accent)]"></div>
                                        )}
                                        {isTarget && isAfter && (
                                            <div className="absolute inset-y-0 right-0 w-1 bg-accent z-50 shadow-[0_0_10px_var(--color-accent)]"></div>
                                        )}

                                        <img 
                                            src={layer.src} 
                                            className="h-full w-auto object-cover block pointer-events-none select-none" 
                                            alt="" 
                                        />
                                        
                                        {/* Number Badge */}
                                        <div className="absolute top-2 left-2 w-5 h-5 bg-black/50 text-white text-[10px] flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                                            {index + 1}
                                        </div>
                                    </div>
                                );
                            })}
                            
                            {group.layerIds.length === 0 && (
                                <div className="p-10 flex items-center justify-center text-secondary">
                                    Empty Group
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    // --- CROP MODE (Actual Stitched Result) ---
                    stitchedData ? (
                        <div className="p-6 w-full h-full flex items-center justify-center">
                            <ImageCropper 
                                layer={proxyLayer} 
                                onUpdateLayer={handleProxyUpdate} 
                                onAddToStitch={onAddToStitch}
                            />
                        </div>
                    ) : (
                        <div className="animate-pulse text-secondary font-mono flex flex-col items-center gap-4">
                            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
                            Stitching...
                        </div>
                    )
                )}

            </div>
        </div>
    );
};

const NavButton = ({ active, onClick, icon, label }: any) => (
  <button
    onClick={onClick}
    className={`
      group relative w-12 h-12 flex items-center justify-center transition-all duration-300 rounded-xl
      ${active 
        ? 'text-accent bg-accentDim' 
        : 'text-secondary hover:text-primary hover:bg-surface'
      }
    `}
  >
    {icon}
    <div className="absolute left-14 px-3 py-1.5 bg-inverse text-inverseText text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-xl rounded-md">
      {label}
    </div>
  </button>
);

export default App;
