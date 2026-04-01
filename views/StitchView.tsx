import React, { useState, useEffect } from 'react';
import { ImageLayer, StitchItem, AssetGroup } from '../types';
import { cropImage, EXPORT_SCALE_OPTIONS, generateStitchedCanvas } from '../utils/imageUtils';
import { Trash2, Download, Layers, ArrowLeft, ArrowRight, ArrowLeftRight } from 'lucide-react';

interface StitchViewProps {
  layers: ImageLayer[];
  groups: AssetGroup[];
  stitchItems: StitchItem[];
  setStitchItems: React.Dispatch<React.SetStateAction<StitchItem[]>>;
}

const StitchView: React.FC<StitchViewProps> = ({ layers, groups, stitchItems, setStitchItems }) => {
  const [renderedImages, setRenderedImages] = useState<Record<string, string>>({});
  const [stitchedPreviewSrc, setStitchedPreviewSrc] = useState<string | null>(null);
  const [isArrangeMode, setIsArrangeMode] = useState(false);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [exportScale, setExportScale] = useState(1);

  // Load individual crops first (Supports Layers AND Groups)
  useEffect(() => {
    const loadImages = async () => {
      const newCache = { ...renderedImages };
      
      for (const item of stitchItems) {
        const key = `${item.layerId}-${item.cropId}`;
        if (newCache[key]) continue;

        // 1. Try finding as Layer
        const layer = layers.find(l => l.id === item.layerId);
        if (layer) {
            const crop = layer.crops.find(c => c.id === item.cropId);
            if (crop) {
                let src = crop.replacementSrc;
                if (!src) {
                   src = await cropImage(layer.src, crop, layer.width, layer.height);
                }
                if (src) newCache[key] = src;
            }
            continue;
        }

        // 2. Try finding as Group
        const group = groups.find(g => g.id === item.layerId);
        if (group) {
             const crop = group.crops.find(c => c.id === item.cropId);
             if (crop) {
                 let src = crop.replacementSrc;
                 if (!src) {
                     // We need the stitched source of the group first
                     const groupSources = group.layerIds
                        .map(id => layers.find(l => l.id === id)?.src)
                        .filter(Boolean) as string[];
                     
                     if (groupSources.length > 0) {
                         const stitchedUrl = await generateStitchedCanvas(groupSources);
                         const img = new Image();
                         img.src = stitchedUrl;
                         await new Promise(resolve => { img.onload = resolve; });
                         
                         src = await cropImage(stitchedUrl, crop, img.width, img.height);
                     }
                 }
                 if (src) newCache[key] = src;
             }
        }
      }
      setRenderedImages(newCache);
    };
    loadImages();
  }, [stitchItems, layers, groups]);

  // Generate the full stitched preview whenever items change
  useEffect(() => {
    const generatePreview = async () => {
        if (stitchItems.length === 0) {
            setStitchedPreviewSrc(null);
            return;
        }

        const sources = stitchItems.map(item => {
            const key = `${item.layerId}-${item.cropId}`;
            return renderedImages[key];
        }).filter(Boolean);

        if (sources.length !== stitchItems.length) return; // Wait for all to load

        try {
            const url = await generateStitchedCanvas(sources, { exportScale });
            setStitchedPreviewSrc(url);
        } catch (e) {
            console.error("Stitch generation failed", e);
        }
    };
    generatePreview();
  }, [stitchItems, renderedImages, exportScale]);

  const handleRemoveItem = (index: number) => {
     setStitchItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleMoveItem = (index: number, direction: 'left' | 'right') => {
      setStitchItems(prev => {
          const newItems = [...prev];
          const targetIndex = direction === 'left' ? index - 1 : index + 1;
          
          if (targetIndex < 0 || targetIndex >= newItems.length) return prev;
          
          [newItems[index], newItems[targetIndex]] = [newItems[targetIndex], newItems[index]];
          return newItems;
      });
  };

  const handleReorder = (from: number, to: number) => {
      setStitchItems(prev => {
          const newItems = [...prev];
          const [moved] = newItems.splice(from, 1);
          newItems.splice(to, 0, moved);
          return newItems;
      });
  };

  // --- Drag Logic ---
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
      if (draggingIndex !== null && draggingIndex !== index) {
          handleReorder(draggingIndex, index);
      }
      setDraggingIndex(null);
      setDropTargetIndex(null);
  };

  const handleDownloadStitch = () => {
     if (!stitchedPreviewSrc) return;
     const a = document.createElement('a');
     a.href = stitchedPreviewSrc;
     a.download = 'laniameda-stitch.png';
     a.click();
  };

  return (
    <div className="w-full h-full flex flex-col relative bg-background transition-colors duration-300">
      
      {/* Grid Background */}
      <div className="absolute inset-0 grid-bg pointer-events-none opacity-100"></div>

      {/* Toolbar */}
      {stitchItems.length > 0 && (
         <div className="absolute top-6 left-1/2 -translate-x-1/2 z-40 bg-background border border-border p-1 rounded-full shadow-md flex gap-1">
            <button
                onClick={() => setIsArrangeMode(false)}
                className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${!isArrangeMode ? 'bg-accent text-white' : 'text-secondary hover:text-primary'}`}
            >
                Preview Final
            </button>
            <button
                onClick={() => setIsArrangeMode(true)}
                className={`px-4 py-1.5 rounded-full text-xs font-medium flex items-center gap-2 transition-colors ${isArrangeMode ? 'bg-accent text-white' : 'text-secondary hover:text-primary'}`}
            >
                <ArrowLeftRight size={14} /> Arrange
            </button>
        </div>
      )}

      {/* Main Preview Area */}
      <div className="flex-1 relative overflow-hidden flex items-center justify-center p-8">
         {stitchItems.length === 0 ? (
             <div className="flex flex-col items-center justify-center gap-6 pointer-events-none z-10">
                 <div className="w-24 h-24 border border-dashed border-border rounded-full flex items-center justify-center bg-surface transition-colors duration-300">
                    <Layers size={32} className="text-secondary/50" />
                 </div>
                 <div className="text-center space-y-2">
                     <h3 className="font-serif text-3xl text-primary transition-colors duration-300">Laniameda Stitched</h3>
                     <p className="font-mono text-[10px] uppercase tracking-widest text-secondary">
                        Queue items to see the magic
                     </p>
                 </div>
             </div>
         ) : (
             isArrangeMode ? (
                 // --- ARRANGE MODE (Draggable Strip) ---
                 <div className="w-full h-full overflow-auto flex items-center justify-center">
                    <div className="flex items-stretch shadow-2xl bg-background border border-border h-[60vh]">
                        {stitchItems.map((item, index) => {
                            const key = `${item.layerId}-${item.cropId}`;
                            const src = renderedImages[key];
                            const isDragging = draggingIndex === index;
                            const isTarget = dropTargetIndex === index;
                            const isAfter = draggingIndex !== null && index > draggingIndex;

                            return (
                                <div
                                    key={item.id}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, index)}
                                    onDragOver={(e) => handleDragOver(e, index)}
                                    onDrop={(e) => handleDrop(e, index)}
                                    className={`
                                        relative cursor-grab active:cursor-grabbing group transition-all duration-200 border-r border-border/10
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

                                    {src ? (
                                        <img src={src} className="h-full w-auto object-cover block pointer-events-none" alt="" />
                                    ) : (
                                        <div className="h-full w-32 bg-surface animate-pulse flex items-center justify-center text-xs text-secondary">Loading...</div>
                                    )}
                                    
                                    <div className="absolute top-2 left-2 w-5 h-5 bg-black/50 text-white text-[10px] flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                        {index + 1}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                 </div>
             ) : (
                 // --- PREVIEW MODE ---
                 <div className="bg-surface shadow-2xl border border-border p-2 max-w-full max-h-full transition-colors duration-300">
                     {stitchedPreviewSrc ? (
                        <img src={stitchedPreviewSrc} alt="Stitched Result" className="max-w-full max-h-[60vh] object-contain" />
                     ) : (
                        <div className="flex items-center gap-2 text-secondary font-mono text-sm animate-pulse">
                            Processing Stitch...
                        </div>
                     )}
                 </div>
             )
         )}
         
         {/* Download Button (Overlay) */}
         {stitchItems.length > 0 && !isArrangeMode && (
             <div className="absolute top-6 right-8 z-40 flex flex-col items-end gap-3">
                <div className="bg-background/95 border border-border rounded-2xl shadow-md p-3 w-[300px] backdrop-blur">
                    <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest">
                        <span className="text-primary">Export Size</span>
                        <span className="text-secondary">{Math.round(exportScale * 100)}%</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 mt-3">
                        {EXPORT_SCALE_OPTIONS.map((option) => (
                            <button
                                key={option.value}
                                onClick={() => setExportScale(option.value)}
                                className={`rounded-xl border px-2 py-2 text-xs font-medium transition-colors ${
                                    exportScale === option.value
                                      ? 'border-accent bg-accent text-white'
                                      : 'border-border bg-background text-secondary hover:text-primary hover:border-accent'
                                }`}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                    <p className="mt-3 text-[11px] leading-5 text-secondary">
                        `100%` keeps each image at its native stitched resolution. Lower sizes make the PNG lighter on purpose.
                    </p>
                </div>
                <button 
                onClick={handleDownloadStitch}
                className="bg-inverse hover:bg-accent text-inverseText hover:text-white px-6 py-3 text-xs font-mono uppercase tracking-widest flex items-center gap-2 shadow-sharp transition-colors rounded-sm"
                >
                <Download size={16} />
                Download {Math.round(exportScale * 100)}%
                </button>
             </div>
         )}
      </div>

      {/* Bottom Sequence Editor */}
      <div className="h-48 bg-surface border-t border-border flex flex-col z-20 transition-colors duration-300 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
         <div className="px-6 py-3 border-b border-border flex justify-between items-center bg-background/50">
             <span className="font-mono text-[10px] uppercase tracking-widest text-secondary">Sequence Editor ({stitchItems.length})</span>
         </div>
         
         <div className="flex-1 overflow-x-auto p-4 flex gap-4 items-center">
             {stitchItems.map((item, index) => {
                 const key = `${item.layerId}-${item.cropId}`;
                 const src = renderedImages[key];
                 const isDragging = draggingIndex === index;
                 const isTarget = dropTargetIndex === index;

                 return (
                     <div 
                        key={item.id} 
                        draggable
                        onDragStart={(e) => handleDragStart(e, index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDrop={(e) => handleDrop(e, index)}
                        className={`
                            relative group flex-shrink-0 w-32 flex flex-col gap-2 cursor-grab active:cursor-grabbing
                            ${isDragging ? 'opacity-20' : ''}
                            ${isTarget ? 'translate-x-2' : ''}
                        `}
                     >
                         {/* Thumbnail */}
                         <div className={`
                             h-24 w-32 bg-background border rounded-md overflow-hidden relative shadow-sm group-hover:shadow-md transition-all
                             ${isTarget ? 'border-accent' : 'border-border'}
                         `}>
                             {src && <img src={src} className="w-full h-full object-contain pointer-events-none" alt="" />}
                             
                             <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                 <button 
                                     onClick={(e) => { e.stopPropagation(); handleRemoveItem(index); }}
                                     className="bg-red-500 text-white p-1 rounded-sm hover:bg-red-600 shadow-sm"
                                 >
                                     <Trash2 size={12} />
                                 </button>
                             </div>
                             
                             {/* Index Badge */}
                             <div className="absolute bottom-1 left-1 bg-inverse text-inverseText font-mono text-[9px] px-1.5 py-0.5 rounded-sm opacity-80">
                                 {index + 1}
                             </div>
                         </div>

                         {/* Controls (Fallback for non-drag) */}
                         <div className="flex justify-between items-center opacity-50 group-hover:opacity-100 transition-opacity px-1">
                             <button 
                                 onClick={() => handleMoveItem(index, 'left')}
                                 disabled={index === 0}
                                 className="hover:text-accent disabled:opacity-30 disabled:hover:text-current transition-colors"
                             >
                                 <ArrowLeft size={16} />
                             </button>
                             <button 
                                 onClick={() => handleMoveItem(index, 'right')}
                                 disabled={index === stitchItems.length - 1}
                                 className="hover:text-accent disabled:opacity-30 disabled:hover:text-current transition-colors"
                             >
                                 <ArrowRight size={16} />
                             </button>
                         </div>
                     </div>
                 );
             })}
             
             {stitchItems.length === 0 && (
                 <div className="w-full text-center text-secondary text-sm font-mono opacity-50">
                     Add items from the Canvas to create a sequence
                 </div>
             )}
         </div>
      </div>

    </div>
  );
};

export default StitchView;
