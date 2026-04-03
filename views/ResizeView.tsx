import React, { useMemo, useRef, useState } from 'react';
import { Download, Upload, Trash2 } from 'lucide-react';
import { SmartStitchImage } from '../types';
import { EXPORT_SCALE_OPTIONS, calculateScaledDimensions, loadImageFile, resizeImageSource } from '../utils/imageUtils';

export default function ResizeView() {
  const [images, setImages] = useState<SmartStitchImage[]>([]);
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const [exportScale, setExportScale] = useState(0.5);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeImage = useMemo(
    () => images.find((image) => image.id === activeImageId) ?? images[0] ?? null,
    [images, activeImageId]
  );

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    setIsProcessing(true);
    try {
      const newImages = await Promise.all(files.map(loadImageFile));
      setImages((prev) => {
        const next = [...prev, ...newImages];
        if (!activeImageId && next[0]) {
          setActiveImageId(next[0].id);
        }
        return next;
      });
    } catch (error) {
      console.error('Failed to load resize images', error);
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveImage = (id: string) => {
    setImages((prev) => {
      const next = prev.filter((image) => image.id !== id);
      if (activeImageId === id) {
        setActiveImageId(next[0]?.id ?? null);
      }
      return next;
    });
  };

  const handleDownload = async (image: SmartStitchImage) => {
    setIsProcessing(true);
    try {
      const resizedUrl = await resizeImageSource(image.dataUrl, exportScale);
      const anchor = document.createElement('a');
      const dotIndex = image.name.lastIndexOf('.');
      const baseName = dotIndex > 0 ? image.name.slice(0, dotIndex) : image.name;
      anchor.href = resizedUrl;
      anchor.download = `${baseName}-${Math.round(exportScale * 100)}.png`;
      anchor.click();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadAll = async () => {
    if (images.length === 0) return;
    setIsProcessing(true);
    try {
      for (const image of images) {
        const resizedUrl = await resizeImageSource(image.dataUrl, exportScale);
        const anchor = document.createElement('a');
        const dotIndex = image.name.lastIndexOf('.');
        const baseName = dotIndex > 0 ? image.name.slice(0, dotIndex) : image.name;
        anchor.href = resizedUrl;
        anchor.download = `${baseName}-${Math.round(exportScale * 100)}.png`;
        anchor.click();
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const scaledDimensions = activeImage
    ? calculateScaledDimensions(activeImage.width, activeImage.height, exportScale)
    : null;

  return (
    <div className="w-full h-full flex animate-fade-in relative z-10">
      <div className="w-[360px] flex-shrink-0 border-r border-border bg-background flex flex-col overflow-hidden transition-colors duration-300">
        <div className="p-6 border-b border-border flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-accent font-bold tracking-widest uppercase">Resize</span>
            <div className="h-px flex-1 bg-border"></div>
            {images.length > 0 && (
              <button
                onClick={() => {
                  setImages([]);
                  setActiveImageId(null);
                }}
                className="font-mono text-[10px] text-secondary hover:text-accent transition-colors uppercase"
              >
                Clear
              </button>
            )}
          </div>

          <input
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileChange}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-4 px-4 bg-surface border border-dashed border-border rounded-xl text-secondary hover:text-primary hover:border-accent hover:bg-accentDim/30 transition-all flex items-center justify-center gap-3 font-medium text-sm"
          >
            <Upload size={18} />
            Add Images
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto flex flex-col gap-5">
          <div className="flex flex-col gap-3 bg-surface rounded-xl p-5 border border-border">
            <div className="flex justify-between font-mono text-[10px] uppercase tracking-wider">
              <span className="text-primary">Export Size</span>
              <span className="text-secondary">{Math.round(exportScale * 100)}%</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
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
            <p className="text-[11px] leading-5 text-secondary">
              Resize any image without using stitch or canvas. `100%` preserves the original pixels.
            </p>
          </div>

          {images.length > 0 && (
            <div className="space-y-2">
              {images.map((image) => {
                const isActive = image.id === activeImage?.id;
                return (
                  <button
                    key={image.id}
                    onClick={() => setActiveImageId(image.id)}
                    className={`w-full text-left border rounded-xl px-3 py-3 transition-colors ${
                      isActive ? 'border-accent bg-accentDim/30' : 'border-border bg-background hover:bg-surface'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg overflow-hidden border border-border bg-surface flex-shrink-0">
                        <img src={image.dataUrl} alt="" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-xs truncate ${isActive ? 'text-accent font-medium' : 'text-primary'}`}>
                          {image.name}
                        </div>
                        <div className="text-[10px] font-mono uppercase tracking-wider text-secondary">
                          {image.width}×{image.height}
                        </div>
                      </div>
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveImage(image.id);
                        }}
                        className="p-1 rounded hover:bg-red-500/10 hover:text-red-500 text-secondary"
                      >
                        <Trash2 size={14} />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-border bg-surface flex flex-col gap-3 transition-colors duration-300">
          <button
            onClick={() => activeImage && handleDownload(activeImage)}
            disabled={!activeImage || isProcessing}
            className="w-full py-3 px-4 bg-inverse text-inverseText rounded-xl hover:bg-accent hover:text-white transition-all flex items-center justify-center gap-2 font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download size={16} />
            Download Active
          </button>
          <button
            onClick={handleDownloadAll}
            disabled={images.length === 0 || isProcessing}
            className="w-full py-3 px-4 bg-background border border-border rounded-xl text-primary hover:border-accent hover:text-accent transition-all flex items-center justify-center gap-2 font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download size={16} />
            Download All
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto relative flex items-center justify-center">
        <div className="absolute inset-0 grid-bg pointer-events-none z-0"></div>

        {!activeImage ? (
          <div className="flex flex-col items-center justify-center gap-6 animate-fade-in z-10 relative pointer-events-none">
            <div className="w-24 h-24 border border-dashed border-border rounded-full flex items-center justify-center bg-surface transition-colors duration-300">
              <Upload size={32} className="text-secondary/50" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="font-serif text-3xl text-primary transition-colors duration-300">
                Resize Studio
              </h3>
              <p className="font-mono text-[10px] uppercase tracking-widest text-secondary">
                Upload images to downscale or preserve exact size
              </p>
            </div>
          </div>
        ) : (
          <div className="p-8 z-10 relative w-full h-full flex items-center justify-center">
            <div className="bg-background border border-border p-4 rounded-xl shadow-elevated relative max-w-full">
              <img
                src={activeImage.dataUrl}
                alt={activeImage.name}
                className="max-w-full max-h-[calc(100vh-280px)] object-contain rounded-lg"
              />
              {scaledDimensions && (
                <div className="mt-4 flex flex-wrap gap-3 text-[11px] text-secondary">
                  <span className="rounded-sm border border-border px-2 py-1">
                    Original: {activeImage.width}×{activeImage.height}
                  </span>
                  <span className="rounded-sm border border-border px-2 py-1">
                    Export: {scaledDimensions.width}×{scaledDimensions.height}
                  </span>
                  <span className="rounded-sm border border-border px-2 py-1">
                    Scale: {Math.round(exportScale * 100)}%
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
