import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, RefreshCw, Download, Trash2, Settings2 } from 'lucide-react';
import { SmartStitchSession } from '../types';
import { loadImageFile, generateSmartStitch, EXPORT_SCALE_OPTIONS } from '../utils/imageUtils';

interface SmartStitchViewProps {
  session: SmartStitchSession;
  onUpdateSession: (nextSession: SmartStitchSession) => void;
}

export default function SmartStitchView({ session, onUpdateSession }: SmartStitchViewProps) {
  const [stitchedDataUrl, setStitchedDataUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { images, settings } = session;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    setIsProcessing(true);
    try {
      const newImages = await Promise.all(files.map(loadImageFile));
      onUpdateSession({
        ...session,
        images: [...session.images, ...newImages],
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error loading images', error);
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeImage = (id: string) => {
    onUpdateSession({
      ...session,
      images: session.images.filter((img) => img.id !== id),
      updatedAt: new Date().toISOString(),
    });
  };

  const handleShuffle = () => {
    onUpdateSession({
      ...session,
      images: [...session.images].sort(() => Math.random() - 0.5),
      updatedAt: new Date().toISOString(),
    });
  };

  const runStitch = useCallback(async () => {
    if (images.length === 0) {
      setStitchedDataUrl(null);
      return;
    }
    setIsProcessing(true);
    const url = await generateSmartStitch(images, settings);
    setStitchedDataUrl(url || null);
    setIsProcessing(false);
  }, [images, settings]);

  useEffect(() => {
    runStitch();
  }, [runStitch]);

  const handleDownload = () => {
    if (!stitchedDataUrl) return;
    const a = document.createElement('a');
    a.href = stitchedDataUrl;
    a.download = `smart-stitch-${Date.now()}.png`;
    a.click();
  };

  return (
    <div className="w-full h-full flex animate-fade-in relative z-10">
      {/* Left Panel — Settings & Images */}
      <div className="w-[360px] flex-shrink-0 border-r border-border bg-background flex flex-col overflow-hidden transition-colors duration-300">
        {/* Upload */}
        <div className="p-6 border-b border-border flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-accent font-bold tracking-widest uppercase">Images</span>
            <div className="h-px flex-1 bg-border"></div>
            {images.length > 0 && (
              <button
                onClick={() =>
                  onUpdateSession({
                    ...session,
                    images: [],
                    updatedAt: new Date().toISOString(),
                  })
                }
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

          {images.length > 0 && (
            <div className="grid grid-cols-4 gap-2 mt-2">
              {images.map((img, idx) => (
                <div
                  key={img.id}
                  className="relative aspect-square rounded-lg border border-border bg-surface group overflow-hidden"
                >
                  <img
                    src={img.dataUrl}
                    alt="preview"
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={() => removeImage(img.id)}
                    className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white"
                  >
                    <Trash2 size={14} />
                  </button>
                  <div className="absolute top-1 left-1 bg-background/80 text-primary font-mono text-[9px] px-1.5 py-0.5 rounded">
                    {String(idx + 1).padStart(2, '0')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Settings */}
        <div className="p-6 flex-1 flex flex-col gap-5 overflow-y-auto">
          <div className="flex items-center gap-2">
            <Settings2 size={14} className="text-accent" />
            <span className="font-mono text-[10px] text-accent font-bold tracking-widest uppercase">Parameters</span>
          </div>

          <div className="flex flex-col gap-5 bg-surface rounded-xl p-5 border border-border">
            <label className="flex flex-col gap-2">
              <div className="flex justify-between font-mono text-[10px] uppercase tracking-wider">
                <span className="text-primary">Layout Width</span>
                <span className="text-secondary">{settings.containerWidth}px</span>
              </div>
              <input
                type="range"
                min="800"
                max="2400"
                step="100"
                value={settings.containerWidth}
                onChange={(e) =>
                  onUpdateSession({
                    ...session,
                    settings: { ...session.settings, containerWidth: Number(e.target.value) },
                    updatedAt: new Date().toISOString(),
                  })
                }
                className="range-clean"
              />
            </label>

            <label className="flex flex-col gap-2">
              <div className="flex justify-between font-mono text-[10px] uppercase tracking-wider">
                <span className="text-primary">Row Height</span>
                <span className="text-secondary">{settings.targetRowHeight}px</span>
              </div>
              <input
                type="range"
                min="100"
                max="800"
                step="50"
                value={settings.targetRowHeight}
                onChange={(e) =>
                  onUpdateSession({
                    ...session,
                    settings: { ...session.settings, targetRowHeight: Number(e.target.value) },
                    updatedAt: new Date().toISOString(),
                  })
                }
                className="range-clean"
              />
            </label>

            <label className="flex flex-col gap-2">
              <div className="flex justify-between font-mono text-[10px] uppercase tracking-wider">
                <span className="text-primary">Spacing</span>
                <span className="text-secondary">{settings.spacing}px</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="2"
                value={settings.spacing}
                onChange={(e) =>
                  onUpdateSession({
                    ...session,
                    settings: { ...session.settings, spacing: Number(e.target.value) },
                    updatedAt: new Date().toISOString(),
                  })
                }
                className="range-clean"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-primary">Canvas Color</span>
              <div className="flex border border-border rounded-lg overflow-hidden h-10">
                <input
                  type="color"
                  value={settings.backgroundColor}
                  onChange={(e) =>
                    onUpdateSession({
                      ...session,
                      settings: { ...session.settings, backgroundColor: e.target.value },
                      updatedAt: new Date().toISOString(),
                    })
                  }
                  className="w-12 h-full cursor-pointer border-r border-border p-0 bg-surface"
                />
                <input
                  type="text"
                  value={settings.backgroundColor}
                  onChange={(e) =>
                    onUpdateSession({
                      ...session,
                      settings: { ...session.settings, backgroundColor: e.target.value },
                      updatedAt: new Date().toISOString(),
                    })
                  }
                  className="flex-1 px-3 font-mono text-xs uppercase bg-background outline-none text-primary"
                />
              </div>
            </label>

            <div className="flex flex-col gap-3">
              <div className="flex justify-between font-mono text-[10px] uppercase tracking-wider">
                <span className="text-primary">Export Size</span>
                <span className="text-secondary">{Math.round(settings.exportScale * 100)}%</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {EXPORT_SCALE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() =>
                      onUpdateSession({
                        ...session,
                        settings: { ...session.settings, exportScale: option.value },
                        updatedAt: new Date().toISOString(),
                      })
                    }
                    className={`rounded-xl border px-2 py-2 text-xs font-medium transition-colors ${
                      settings.exportScale === option.value
                        ? 'border-accent bg-accent text-white'
                        : 'border-border bg-background text-secondary hover:text-primary hover:border-accent'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] leading-5 text-secondary">
                `100%` keeps the stitched canvas at full chosen resolution. Lower sizes reduce file size without changing the layout.
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="p-6 border-t border-border bg-surface flex flex-col gap-3 transition-colors duration-300">
          <button
            onClick={handleShuffle}
            disabled={images.length < 2 || isProcessing}
            className="w-full py-3 px-4 bg-background border border-border rounded-xl text-primary hover:border-accent hover:text-accent transition-all flex items-center justify-center gap-2 font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RefreshCw size={16} className={isProcessing ? 'animate-spin' : ''} />
            Shuffle Layout
          </button>
          <button
            onClick={handleDownload}
            disabled={!stitchedDataUrl || isProcessing}
            className="w-full py-3 px-4 bg-inverse text-inverseText rounded-xl hover:bg-accent hover:text-white transition-all flex items-center justify-center gap-2 font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download size={16} />
            Download {Math.round(settings.exportScale * 100)}%
          </button>
        </div>
      </div>

      {/* Right — Preview Area */}
      <div className="flex-1 overflow-auto relative flex items-center justify-center">
        <div className="absolute inset-0 grid-bg pointer-events-none z-0"></div>

        {images.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-6 animate-fade-in z-10 relative pointer-events-none">
            <div className="w-24 h-24 border border-dashed border-border rounded-full flex items-center justify-center bg-surface transition-colors duration-300">
              <Upload size={32} className="text-secondary/50" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="font-serif text-3xl text-primary transition-colors duration-300">
                Smart Stitch
              </h3>
              <p className="font-mono text-[10px] uppercase tracking-widest text-secondary">
                Upload images to create a justified layout
              </p>
            </div>
          </div>
        ) : stitchedDataUrl ? (
          <div className="p-8 z-10 relative">
            <div className="bg-background border border-border p-2 rounded-xl shadow-elevated relative">
              <img
                src={stitchedDataUrl}
                alt="Stitched result"
                className="max-w-full max-h-[calc(100vh-200px)] object-contain rounded-lg"
                style={{ backgroundColor: settings.backgroundColor }}
              />
            </div>
          </div>
        ) : (
          <div className="animate-pulse text-secondary font-mono flex flex-col items-center gap-4 z-10 relative">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
            Processing...
          </div>
        )}
      </div>
    </div>
  );
}
