import React, { useState, useRef, useEffect } from 'react';
import { CropRegion, ImageLayer } from '../types';
import { 
    Lock, 
    Unlock, 
    Download, 
    Upload, 
    ArrowRight, 
    X, 
    Trash2, 
} from 'lucide-react';
import { cropImage, EXPORT_SCALE_OPTIONS, generateCompositeImage, resizeImageSource } from '../utils/imageUtils';

interface ImageCropperProps {
  layer: ImageLayer;
  onUpdateLayer: (updatedLayer: ImageLayer) => void;
  onAddToStitch: (layerId: string, cropId: string) => void;
}

type InteractionMode = 'create' | 'move' | 'resize-nw' | 'resize-ne' | 'resize-sw' | 'resize-se';

const ImageCropper: React.FC<ImageCropperProps> = ({ layer, onUpdateLayer, onAddToStitch }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Refs to access latest state in event listeners without re-binding
  const layerRef = useRef(layer);
  useEffect(() => { layerRef.current = layer; }, [layer]);

  const [activeCropId, setActiveCropId] = useState<string | null>(null);
  const [exportScale, setExportScale] = useState(1);
  
  // OPTIMIZATION: Local state for the crop currently being manipulated.
  // This prevents round-tripping to the parent component on every mouse move.
  const [optimisticCrop, setOptimisticCrop] = useState<CropRegion | null>(null);
  const optimisticCropRef = useRef(optimisticCrop);
  useEffect(() => { optimisticCropRef.current = optimisticCrop; }, [optimisticCrop]);

  // Interaction State
  const [interaction, setInteraction] = useState<{
    mode: InteractionMode;
    startX: number;
    startY: number;
    initialCrop?: CropRegion; // Snapshot for move/resize
    activeId?: string;
  } | null>(null);

  const interactionRef = useRef(interaction);
  useEffect(() => { interactionRef.current = interaction; }, [interaction]);

  // Temporary selection for creation visual only
  const [tempSelection, setTempSelection] = useState<Partial<CropRegion> | null>(null);

  // --- Keyboard Events (Delete) ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && activeCropId) {
        const crop = layer.crops.find(c => c.id === activeCropId);
        // Only allow deleting if not locked, matching the UI button logic
        if (crop && !crop.isLocked) {
          handleDeleteCrop(activeCropId);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeCropId, layer]);

  // --- Helpers ---
  const getClientPos = (clientX: number, clientY: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    };
  };

  // --- Global Event Listeners for Smooth Dragging ---
  useEffect(() => {
    // Only attach listeners if we are interacting
    if (!interaction) return;

    const handleWindowMouseMove = (e: MouseEvent) => {
       e.preventDefault(); 
       const currentInteraction = interactionRef.current;
       if (!currentInteraction) return;

       const pos = getClientPos(e.clientX, e.clientY);
       
       // CREATION MODE
       if (currentInteraction.mode === 'create') {
           const x = Math.min(currentInteraction.startX, pos.x);
           const y = Math.min(currentInteraction.startY, pos.y);
           const width = Math.abs(pos.x - currentInteraction.startX);
           const height = Math.abs(pos.y - currentInteraction.startY);
           setTempSelection({ x, y, width, height });
           return;
       }

       // MODIFICATION MODES
       if (!currentInteraction.initialCrop || !currentInteraction.activeId) return;

       const dx = pos.x - currentInteraction.startX;
       const dy = pos.y - currentInteraction.startY;
       const init = currentInteraction.initialCrop;
       let newCrop = { ...init };

       if (currentInteraction.mode === 'move') {
           const newX = Math.min(Math.max(0, init.x + dx), 100 - init.width);
           const newY = Math.min(Math.max(0, init.y + dy), 100 - init.height);
           newCrop.x = newX;
           newCrop.y = newY;
       } else {
           // Resize Logic
           if (currentInteraction.mode === 'resize-se') {
                newCrop.width = Math.max(1, Math.min(init.width + dx, 100 - init.x));
                newCrop.height = Math.max(1, Math.min(init.height + dy, 100 - init.y));
           } else if (currentInteraction.mode === 'resize-sw') {
                const proposedX = Math.min(init.x + dx, init.x + init.width - 1);
                newCrop.x = Math.max(0, proposedX);
                newCrop.width = init.width + (init.x - newCrop.x);
                newCrop.height = Math.max(1, Math.min(init.height + dy, 100 - init.y));
           } else if (currentInteraction.mode === 'resize-ne') {
                const proposedY = Math.min(init.y + dy, init.y + init.height - 1);
                newCrop.y = Math.max(0, proposedY);
                newCrop.height = init.height + (init.y - newCrop.y);
                newCrop.width = Math.max(1, Math.min(init.width + dx, 100 - init.x));
           } else if (currentInteraction.mode === 'resize-nw') {
                const proposedX = Math.min(init.x + dx, init.x + init.width - 1);
                const proposedY = Math.min(init.y + dy, init.y + init.height - 1);
                newCrop.x = Math.max(0, proposedX);
                newCrop.y = Math.max(0, proposedY);
                newCrop.width = init.width + (init.x - newCrop.x);
                newCrop.height = init.height + (init.y - newCrop.y);
           }
       }

       // Update LOCAL state only (fast)
       setOptimisticCrop(newCrop);
    };

    const handleWindowMouseUp = (e: MouseEvent) => {
        const currentInteraction = interactionRef.current;
        if (!currentInteraction) return;

        // Finalize creation
        if (currentInteraction.mode === 'create') {
             const pos = getClientPos(e.clientX, e.clientY);
             const x = Math.min(currentInteraction.startX, pos.x);
             const y = Math.min(currentInteraction.startY, pos.y);
             const width = Math.abs(pos.x - currentInteraction.startX);
             const height = Math.abs(pos.y - currentInteraction.startY);

             const newCrop: CropRegion = {
                id: crypto.randomUUID(),
                x, y, width, height,
                isLocked: false,
                replacementSrc: null,
                isStitched: false,
             };
             
             if (newCrop.width > 1 && newCrop.height > 1) { // Min 1% size
                const currentLayer = layerRef.current;
                onUpdateLayer({
                  ...currentLayer,
                  crops: [...currentLayer.crops, newCrop],
                });
                setActiveCropId(newCrop.id);
             }
        } 
        // Finalize Move/Resize
        else {
             const finalCrop = optimisticCropRef.current;
             if (finalCrop && currentInteraction.activeId) {
                 const currentLayer = layerRef.current;
                 // Commit to GLOBAL state (slow but only happens once)
                 onUpdateLayer({
                     ...currentLayer,
                     crops: currentLayer.crops.map(c => c.id === currentInteraction.activeId ? finalCrop : c)
                 });
             }
        }
        
        setInteraction(null);
        setTempSelection(null);
        setOptimisticCrop(null);
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);

    return () => {
        window.removeEventListener('mousemove', handleWindowMouseMove);
        window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [interaction?.mode, onUpdateLayer]); // Only re-bind when mode changes (e.g. start/stop dragging)

  // --- Interaction Starters ---

  const handleMouseDown = (e: React.MouseEvent) => {
    // Start creating a new crop if we clicked empty space
    const pos = getClientPos(e.clientX, e.clientY);
    setInteraction({
      mode: 'create',
      startX: pos.x,
      startY: pos.y,
    });
    setTempSelection({ x: pos.x, y: pos.y, width: 0, height: 0 });
    setActiveCropId(null);
  };

  const handleCropMouseDown = (e: React.MouseEvent, crop: CropRegion) => {
    e.stopPropagation();
    setActiveCropId(crop.id);

    if (crop.isLocked) return;

    const pos = getClientPos(e.clientX, e.clientY);
    setInteraction({
      mode: 'move',
      startX: pos.x,
      startY: pos.y,
      initialCrop: { ...crop },
      activeId: crop.id
    });
    // Initialize optimistic crop immediately
    setOptimisticCrop(crop);
  };

  const handleResizeMouseDown = (e: React.MouseEvent, crop: CropRegion, handle: InteractionMode) => {
    e.stopPropagation();
    setActiveCropId(crop.id);

    const pos = getClientPos(e.clientX, e.clientY);
    setInteraction({
      mode: handle,
      startX: pos.x,
      startY: pos.y,
      initialCrop: { ...crop },
      activeId: crop.id
    });
    setOptimisticCrop(crop);
  };

  // --- Toolbar Actions ---

  const handleLockToggle = (cropId: string) => {
    const updatedCrops = layer.crops.map(c => 
      c.id === cropId ? { ...c, isLocked: !c.isLocked } : c
    );
    onUpdateLayer({ ...layer, crops: updatedCrops });
  };

  const handleDeleteCrop = (cropId: string) => {
     const updatedCrops = layer.crops.filter(c => c.id !== cropId);
     onUpdateLayer({ ...layer, crops: updatedCrops });
     if (activeCropId === cropId) setActiveCropId(null);
  };

  const handleDownloadCrop = async (crop: CropRegion) => {
    try {
      let url;
      if (crop.replacementSrc) {
        url = crop.replacementSrc;
      } else {
        url = await cropImage(layer.src, crop, layer.width, layer.height);
      }

      if (exportScale < 1) {
        url = await resizeImageSource(url, exportScale);
      }
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `crop-${layer.name}-${crop.id.slice(0, 4)}.png`;
      a.click();
    } catch (e) {
      console.error("Failed to download crop", e);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && activeCropId) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const updatedCrops = layer.crops.map(c => 
          c.id === activeCropId ? { ...c, replacementSrc: evt.target?.result as string } : c
        );
        onUpdateLayer({ ...layer, crops: updatedCrops });
      };
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDownloadFull = async () => {
    let url = await generateCompositeImage(layer);
    if (exportScale < 1) {
      url = await resizeImageSource(url, exportScale);
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = `composite-${layer.name}-${Math.round(exportScale * 100)}.png`;
    a.click();
  };

  // Merge layer crops with the optimistic crop being dragged
  const displayedCrops = layer.crops.map(c => 
    (optimisticCrop && c.id === optimisticCrop.id) ? optimisticCrop : c
  );

  const activeCrop = displayedCrops.find(c => c.id === activeCropId);

  return (
    <div className="relative w-full h-full flex flex-col">
      
      {/* Top Right Action: Editorial Tag */}
      <div className="absolute top-0 right-0 z-40 flex flex-col items-end gap-3">
         <div className="bg-background/95 border border-border rounded-2xl shadow-md p-3 w-[300px] backdrop-blur">
            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest">
                <span className="text-primary">Canvas Export</span>
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
                `100%` keeps canvas and crop exports at full resolution. Lower sizes reduce file size on purpose.
            </p>
         </div>
         <button 
           onClick={handleDownloadFull}
           className="bg-inverse text-inverseText px-5 py-2.5 text-xs font-mono uppercase tracking-widest hover:bg-accent hover:text-white transition-colors shadow-sharp"
         >
           Save Composition {Math.round(exportScale * 100)}%
         </button>
      </div>

      {/* Main Canvas */}
      <div className="flex-1 relative overflow-hidden flex items-center justify-center">
        <div 
           className="relative select-none shadow-elevated bg-surface p-2 transition-colors duration-300"
           style={{ maxWidth: '100%', maxHeight: '100%' }}
        >
          {/* Empty Hint */}
          {layer.crops.length === 0 && (
            <div className="absolute -top-12 left-0 text-secondary font-mono text-[10px] uppercase tracking-widest flex items-center gap-2">
              <span className="w-2 h-2 bg-accent rounded-full animate-pulse"></span>
              Drag to create a region
            </div>
          )}

          <div 
            ref={containerRef}
            className="relative cursor-crosshair touch-none group"
            onMouseDown={handleMouseDown}
          >
            <img 
                src={layer.src} 
                alt={layer.name} 
                className="max-w-full max-h-[75vh] block pointer-events-none" 
                draggable={false} 
            />

            {/* Crops Layer */}
            {displayedCrops.map(crop => (
              <div
                key={crop.id}
                onMouseDown={(e) => handleCropMouseDown(e, crop)}
                className={`absolute transition-all duration-75 ease-out ${
                  activeCropId === crop.id 
                    ? 'z-30' 
                    : 'z-20 hover:bg-accentDim/30'
                } ${!crop.isLocked ? 'cursor-move' : 'cursor-pointer'}`}
                style={{
                  left: `${crop.x}%`,
                  top: `${crop.y}%`,
                  width: `${crop.width}%`,
                  height: `${crop.height}%`,
                }}
              >
                {/* 
                   Orange Editorial Brackets 
                */}
                <div className={`absolute inset-0 pointer-events-none transition-all duration-200 ${activeCropId === crop.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-40'}`}>
                    {/* Top Left */}
                    <div className="absolute top-0 left-0 w-3 h-3 border-l-2 border-t-2 border-accent"></div>
                    {/* Top Right */}
                    <div className="absolute top-0 right-0 w-3 h-3 border-r-2 border-t-2 border-accent"></div>
                    {/* Bottom Left */}
                    <div className="absolute bottom-0 left-0 w-3 h-3 border-l-2 border-b-2 border-accent"></div>
                    {/* Bottom Right */}
                    <div className="absolute bottom-0 right-0 w-3 h-3 border-r-2 border-b-2 border-accent"></div>
                    
                    {/* Solid Border for Active */}
                    {activeCropId === crop.id && (
                        <div className="absolute inset-0 border border-accent/30 bg-accent/5"></div>
                    )}
                </div>
                
                {/* Always visible thin border for non-active */}
                {activeCropId !== crop.id && (
                    <div className="absolute inset-0 border border-white/50 shadow-sm"></div>
                )}

                {/* Replacement Content */}
                {crop.replacementSrc && (
                  <img src={crop.replacementSrc} className="w-full h-full object-fill relative z-10" alt="" />
                )}

                {/* Resize Handles (Only if Active & Unlocked) */}
                {activeCropId === crop.id && !crop.isLocked && (
                  <>
                    <div 
                      onMouseDown={(e) => handleResizeMouseDown(e, crop, 'resize-nw')}
                      className="absolute -top-1 -left-1 w-3 h-3 bg-accent border border-white z-50 cursor-nw-resize shadow-sm hover:scale-125 transition-transform"
                    />
                    <div 
                      onMouseDown={(e) => handleResizeMouseDown(e, crop, 'resize-ne')}
                      className="absolute -top-1 -right-1 w-3 h-3 bg-accent border border-white z-50 cursor-ne-resize shadow-sm hover:scale-125 transition-transform"
                    />
                    <div 
                      onMouseDown={(e) => handleResizeMouseDown(e, crop, 'resize-sw')}
                      className="absolute -bottom-1 -left-1 w-3 h-3 bg-accent border border-white z-50 cursor-sw-resize shadow-sm hover:scale-125 transition-transform"
                    />
                    <div 
                      onMouseDown={(e) => handleResizeMouseDown(e, crop, 'resize-se')}
                      className="absolute -bottom-1 -right-1 w-3 h-3 bg-accent border border-white z-50 cursor-se-resize shadow-sm hover:scale-125 transition-transform"
                    />
                  </>
                )}

                {/* Lock Status Icon */}
                {crop.isLocked && (
                  <div className="absolute -top-3 -right-3 bg-inverse text-inverseText p-1 shadow-md z-40">
                     <Lock size={10} />
                  </div>
                )}
                
                {/* Data Label */}
                {activeCropId === crop.id && (
                    <div className="absolute -bottom-7 left-0 bg-accent text-white font-mono text-[9px] px-2 py-0.5 shadow-sm">
                        {crop.isLocked ? `LOCKED` : `${Math.round(crop.width)}% × ${Math.round(crop.height)}%`}
                    </div>
                )}
              </div>
            ))}

            {/* Selection Drag Box (Visual only for creation) */}
            {interaction?.mode === 'create' && tempSelection && (
              <div
                className="absolute border-2 border-accent bg-accent/10 z-30 pointer-events-none"
                style={{
                  left: `${tempSelection.x}%`,
                  top: `${tempSelection.y}%`,
                  width: `${tempSelection.width}%`,
                  height: `${tempSelection.height}%`,
                }}
              >
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --- FLOATING PILL TOOLBAR --- */}
      <div className={`absolute bottom-8 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${activeCropId ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0 pointer-events-none'}`}>
        {activeCrop && (
          <div className="bg-inverse text-inverseText px-2 py-2 rounded-full shadow-elevated flex items-center gap-1">
            
            <div className="pl-4 pr-3 flex items-center gap-2 border-r border-secondary/30 mr-1">
               <span className="text-[10px] font-mono tracking-widest text-secondary">
                  {activeCrop.isLocked ? 'LOCKED' : 'EDITING'}
               </span>
               <button onClick={() => setActiveCropId(null)} className="text-secondary hover:text-inverseText transition-colors">
                  <X size={14} />
               </button>
            </div>

            {/* Lock Action */}
            <button
              onClick={() => handleLockToggle(activeCrop.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all ${
                activeCrop.isLocked 
                  ? 'bg-secondary/20 text-inverseText' 
                  : 'bg-accent text-white hover:bg-orange-600'
              }`}
            >
              {activeCrop.isLocked ? <Unlock size={14} /> : <Lock size={14} />}
              {activeCrop.isLocked ? 'Unlock' : 'Lock'}
            </button>

            {/* Actions */}
            {activeCrop.isLocked && (
              <div className="flex items-center gap-1 animate-slide-up pl-1">
                
                <ToolButton 
                   onClick={() => handleDownloadCrop(activeCrop)} 
                   icon={<Download size={16} />} 
                   label="Download" 
                />

                <ToolButton 
                   onClick={handleUploadClick} 
                   icon={<Upload size={16} />} 
                   label="Replace" 
                   active={!!activeCrop.replacementSrc}
                />
                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />

                <ToolButton 
                   onClick={() => onAddToStitch(layer.id, activeCrop.id)} 
                   icon={<ArrowRight size={16} />} 
                   label="Stitch" 
                   disabled={activeCrop.isStitched}
                />
              </div>
            )}

            {!activeCrop.isLocked && (
              <button
                onClick={() => handleDeleteCrop(activeCrop.id)}
                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-secondary/20 text-inverseText/70 hover:text-red-400 transition-colors ml-1"
                title="Delete (Backspace)"
              >
                <Trash2 size={16} />
              </button>
            )}

          </div>
        )}
      </div>

    </div>
  );
};

const ToolButton = ({ onClick, icon, label, active, disabled }: any) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        relative group w-9 h-9 flex items-center justify-center rounded-full transition-all
        ${active ? 'text-accent bg-background' : 'text-inverseText/70 hover:text-inverseText hover:bg-secondary/20'}
        ${disabled ? 'opacity-30 cursor-not-allowed' : ''}
      `}
    >
      {icon}
      {/* Tooltip */}
      <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-inverse text-inverseText text-[10px] px-2 py-1 shadow-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap font-mono border border-border rounded-md">
        {label}
      </div>
    </button>
);

export default ImageCropper;
