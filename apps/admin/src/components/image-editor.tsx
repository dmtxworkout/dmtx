'use client';

// Edits an image the way Shopify's file page does, with the parts we need:
// crop (aspect presets, orientation, free), flip, rotate and resize. Every
// step bakes a new bitmap (undo/redo keep the previous ones); Guardar encodes
// the result and replaces the asset's file, so its id and references stay.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import type { MediaAsset } from '@dmtx/api-client';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IconButton } from '@/components/ui/icon-button';
import { toast } from '@/components/ui/toast';
import { isUploadDeclined, startUpload, uploadPct, useUploads, waitForUpload } from '@/lib/uploads';

type Rect = { x: number; y: number; w: number; h: number };
type Aspect = { id: string; label: string; ratio: number | null };
const ASPECTS: Aspect[] = [
  { id: 'original', label: 'Original', ratio: null },
  { id: 'square', label: 'Cuadrado', ratio: 1 },
  { id: '3:2', label: '3:2', ratio: 3 / 2 },
  { id: '5:4', label: '5:4', ratio: 5 / 4 },
  { id: '7:5', label: '7:5', ratio: 7 / 5 },
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
  { id: 'free', label: 'Libre', ratio: 0 },
];
type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | 'move';
const MIN = 16;

function draw(
  w: number,
  h: number,
  paint: (ctx: CanvasRenderingContext2D) => void,
): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  paint(ctx);
  return c;
}
const rotateBitmap = (src: ImageBitmap, deg: 90 | -90) =>
  draw(src.height, src.width, (ctx) => {
    ctx.translate(src.height / 2, src.width / 2);
    ctx.rotate((deg * Math.PI) / 180);
    ctx.drawImage(src, -src.width / 2, -src.height / 2);
  });
const flipBitmap = (src: ImageBitmap, axis: 'h' | 'v') =>
  draw(src.width, src.height, (ctx) => {
    ctx.translate(axis === 'h' ? src.width : 0, axis === 'v' ? src.height : 0);
    ctx.scale(axis === 'h' ? -1 : 1, axis === 'v' ? -1 : 1);
    ctx.drawImage(src, 0, 0);
  });
const cropBitmap = (src: ImageBitmap, r: Rect) =>
  draw(r.w, r.h, (ctx) =>
    ctx.drawImage(src, r.x, r.y, r.w, r.h, 0, 0, Math.round(r.w), Math.round(r.h)),
  );
const resizeBitmap = (src: ImageBitmap, w: number, h: number) =>
  draw(w, h, (ctx) => ctx.drawImage(src, 0, 0, w, h));

/** The largest rect of `ratio` (w/h) centred in a w×h image; null ratio = the whole image. */
function fitRect(w: number, h: number, ratio: number | null): Rect {
  if (!ratio) return { x: 0, y: 0, w, h };
  let rw = w;
  let rh = rw / ratio;
  if (rh > h) {
    rh = h;
    rw = rh * ratio;
  }
  return { x: (w - rw) / 2, y: (h - rh) / 2, w: rw, h: rh };
}

/** A hook: the viewer composes its pieces (toolbar, stage, tools). `asset` null = nothing to edit yet. */
export function useImageEditor({
  asset,
  onSaved,
}: {
  asset: MediaAsset | null;
  onSaved: () => void;
}) {
  const assetId = asset?.id ?? null;
  // The delivery URL changes with the file (a replace swaps the external id): the signal to reload the pixels.
  const assetVersion = asset?.viewUrl ?? '';
  const [history, setHistory] = useState<ImageBitmap[]>([]);
  const [future, setFuture] = useState<ImageBitmap[]>([]);
  const [current, setCurrent] = useState<ImageBitmap | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tool, setTool] = useState<'info' | 'crop' | 'resize'>('info');
  // Crop tool state (in image pixels), aspect and orientation.
  const [aspectId, setAspectId] = useState('original');
  const [portrait, setPortrait] = useState(false);
  const [crop, setCrop] = useState<Rect | null>(null);
  // Resize tool state.
  const [size, setSize] = useState<{ w: string; h: string }>({ w: '', h: '' });
  const [lock, setLock] = useState(true);
  const [saving, setSaving] = useState(false);
  const replacing = useUploads().find(
    (u) => u.replaceOf === assetId && (u.status === 'uploading' || u.status === 'processing'),
  );

  // Load the pixels through the API.
  useEffect(() => {
    if (!assetId || !asset || asset.kind !== 'image' || asset.status !== 'ready') return;
    let alive = true;
    setCurrent(null);
    setLoadError(null);
    api.media
      .original(assetId)
      .then((blob) => createImageBitmap(blob))
      .then((bmp) => {
        if (!alive) return;
        setCurrent(bmp);
        setHistory([]);
        setFuture([]);
      })
      .catch(
        (e: unknown) =>
          alive && setLoadError(e instanceof Error ? e.message : 'No se pudo cargar la imagen'),
      );
    return () => {
      alive = false;
    };
  }, [assetId, assetVersion]);

  const dirty = history.length > 0;
  const apply = useCallback(
    async (next: HTMLCanvasElement) => {
      const bmp = await createImageBitmap(next);
      setHistory((h) => (current ? [...h, current] : h));
      setFuture([]);
      setCurrent(bmp);
      setCrop(null);
    },
    [current],
  );
  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev || !current) return;
    setHistory((h) => h.slice(0, -1));
    setFuture((f) => [current, ...f]);
    setCurrent(prev);
    setCrop(null);
  };
  const redo = () => {
    const next = future[0];
    if (!next || !current) return;
    setFuture((f) => f.slice(1));
    setHistory((h) => [...h, current]);
    setCurrent(next);
    setCrop(null);
  };
  const discard = () => {
    const first = history[0] ?? current;
    if (!first) return;
    setHistory([]);
    setFuture([]);
    setCurrent(first);
    setCrop(null);
  };

  // The crop box follows the preset while the tool is open.
  // Orientation turns a preset on its side (Original included; Cuadrado and Libre have none to turn).
  const ratio = useMemo(() => {
    const a = ASPECTS.find((x) => x.id === aspectId)!;
    if (a.ratio === 0) return 0;
    const base = a.ratio === null ? (current ? current.width / current.height : null) : a.ratio;
    if (base === null) return null;
    const landscape = Math.max(base, 1 / base);
    return portrait ? 1 / landscape : landscape;
  }, [aspectId, portrait, current]);
  useEffect(() => {
    if (tool === 'crop' && current) setCrop(fitRect(current.width, current.height, ratio || null));
  }, [tool, ratio, current]);
  useEffect(() => {
    if (tool === 'resize' && current)
      setSize({ w: String(current.width), h: String(current.height) });
  }, [tool, current]);

  // Preview: the current bitmap drawn to fit its box; the crop box is laid over it in screen pixels.
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = boxRef.current;
    const c = canvasRef.current;
    if (!el || !c || !current) return;
    const fit = () => {
      const maxW = el.clientWidth - 32;
      const maxH = el.clientHeight - 32;
      const s = Math.min(1, maxW / current.width, maxH / current.height);
      // Device pixels in the canvas (a Retina screen has two per CSS pixel), or the preview blurs.
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.round(current.width * s * dpr);
      c.height = Math.round(current.height * s * dpr);
      c.style.width = `${Math.round(current.width * s)}px`;
      c.style.height = `${Math.round(current.height * s)}px`;
      const ctx = c.getContext('2d')!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(current, 0, 0, c.width, c.height);
      setScale(s);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [current]);

  // Dragging the crop box or one of its handles.
  const drag = useRef<{ handle: Handle; start: { x: number; y: number }; rect: Rect } | null>(null);
  const onPointerDown = (handle: Handle) => (e: ReactPointerEvent) => {
    if (!crop) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { handle, start: { x: e.clientX, y: e.clientY }, rect: crop };
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || !current) return;
    const dx = (e.clientX - d.start.x) / scale;
    const dy = (e.clientY - d.start.y) / scale;
    const W = current.width;
    const H = current.height;
    let { x, y, w, h } = d.rect;
    if (d.handle === 'move') {
      x = Math.min(Math.max(0, x + dx), W - w);
      y = Math.min(Math.max(0, y + dy), H - h);
      setCrop({ x, y, w, h });
      return;
    }
    const hasN = d.handle.includes('n');
    const hasS = d.handle.includes('s');
    const hasE = d.handle.includes('e');
    const hasW = d.handle.includes('w');
    if (hasE) w = Math.max(MIN, Math.min(W - x, w + dx));
    if (hasS) h = Math.max(MIN, Math.min(H - y, h + dy));
    if (hasW) {
      const nx = Math.min(Math.max(0, x + dx), x + w - MIN);
      w = w + (x - nx);
      x = nx;
    }
    if (hasN) {
      const ny = Math.min(Math.max(0, y + dy), y + h - MIN);
      h = h + (y - ny);
      y = ny;
    }
    if (ratio) {
      // Keep the aspect: the side being dragged leads, the other follows.
      if (hasE || hasW) h = w / ratio;
      else w = h * ratio;
      if (hasN) y = d.rect.y + d.rect.h - h;
      if (hasW) x = d.rect.x + d.rect.w - w;
      if (x < 0 || y < 0 || x + w > W || y + h > H) return;
    }
    setCrop({ x, y, w, h });
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  /** The current bitmap as a file: PNG and WebP stay what they were, anything else becomes a JPEG. */
  async function encode(name: string): Promise<File> {
    if (!current || !asset) throw new Error('No hay imagen');
    const mime =
      asset.mimeType === 'image/png' || asset.mimeType === 'image/webp'
        ? asset.mimeType
        : 'image/jpeg';
    const c = draw(current.width, current.height, (ctx) => ctx.drawImage(current, 0, 0));
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, mime, 0.92));
    if (!blob) throw new Error('No se pudo generar la imagen');
    return new File([blob], name, { type: mime });
  }

  async function save() {
    if (!current || !asset) return;
    setSaving(true);
    try {
      const uploadId = await startUpload(await encode(asset.name), 'image', { replaceOf: asset.id });
      await waitForUpload(uploadId);
      setHistory([]);
      setFuture([]);
      onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo guardar la imagen', 'error');
      throw e;
    } finally {
      setSaving(false);
    }
  }

  /** Upload the edited image as a new file next to this one (same folder); the original stays as it was. Resolves with the new id. */
  async function saveAsNew(name: string, altText: string | null): Promise<string> {
    if (!current || !asset) throw new Error('No hay imagen');
    setSaving(true);
    try {
      const uploadId = await startUpload(await encode(name), 'image', { folderId: asset.folderId ?? null });
      const saved = await waitForUpload(uploadId);
      if (altText !== null) await api.media.update(saved.id, { altText });
      setHistory([]);
      setFuture([]);
      return saved.id;
    } catch (e) {
      if (!isUploadDeclined(e)) toast(e instanceof Error ? e.message : 'No se pudo guardar la imagen', 'error');
      throw e;
    } finally {
      setSaving(false);
    }
  }

  const px = (n: number) => Math.round(n * scale);
  const sideClass = 'rounded-xl border border-line-2 bg-surface';
  const sectionBtn = (id: 'info' | 'crop' | 'resize', label: string, icon: ReactNode) => (
    <button
      type="button"
      onClick={() => setTool(id)}
      className={cn(
        'flex w-full items-center gap-2.5 px-4 py-3 text-left text-[13.5px] font-semibold text-ink',
        tool === id && 'border-b border-line-2',
      )}
      aria-expanded={tool === id}
    >
      {icon}
      {label}
    </button>
  );

  return {
    /** Which side section is open (one at a time: Información, crop or resize). */
    section: tool,
    /** The header of a side section: click opens it and closes the one that was open. */
    sectionBtn,
    /** Undo / redo for the header. */
    undoRedo: (
      <div className="flex items-center gap-1.5">
        <IconButton label="Deshacer" onClick={undo} disabled={!history.length}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path d="M3 7v6h6" />
            <path d="M21 17a9 9 0 0 0-15-6.7L3 13" />
          </svg>
        </IconButton>
        <IconButton label="Rehacer" onClick={redo} disabled={!future.length}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path d="M21 7v6h-6" />
            <path d="M3 17a9 9 0 0 1 15-6.7L21 13" />
          </svg>
        </IconButton>
      </div>
    ),
    /** Pending edits exist (the viewer shows one Descartar / Guardar pair for them and the form). */
    dirty,
    /** Encode and replace the file; resolves when the swap is done. Throws (and toasts) on failure. */
    save,
    /** Drop every pending edit. */
    discard,
    /** «Guardar como nueva imagen»: a new file in the same folder, the original untouched. */
    saveAsNew,
    /** What the Guardar button should read while the image is being saved, or null. */
    savingLabel: replacing
      ? replacing.status === 'uploading'
        ? `Guardando ${uploadPct(replacing)}%`
        : 'Guardando…'
      : saving
        ? 'Guardando…'
        : null,
    /** The canvas with the crop box over it. */
    stage: (
      <div
        ref={boxRef}
        className="relative flex min-h-[420px] min-w-0 flex-1 items-center justify-center overflow-hidden rounded-xl bg-[#1c1c21] p-4"
      >
        {loadError ? (
          <p className="text-sm text-ink-3">{loadError}</p>
        ) : !current ? (
          <p className="text-sm text-ink-3">Cargando la imagen…</p>
        ) : (
          <div
            className="relative"
            style={{ width: px(current.width), height: px(current.height) }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <canvas ref={canvasRef} className="block rounded-md" />
            {tool === 'crop' && crop && (
              <>
                {/* Dim what is outside the box. */}
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    boxShadow: 'inset 0 0 0 9999px rgba(0,0,0,0.45)',
                    clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${px(crop.x)}px ${px(crop.y)}px, ${px(crop.x)}px ${px(crop.y + crop.h)}px, ${px(crop.x + crop.w)}px ${px(crop.y + crop.h)}px, ${px(crop.x + crop.w)}px ${px(crop.y)}px, ${px(crop.x)}px ${px(crop.y)}px)`,
                  }}
                />
                <div
                  className="absolute cursor-move border-2 border-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
                  style={{
                    left: px(crop.x),
                    top: px(crop.y),
                    width: px(crop.w),
                    height: px(crop.h),
                  }}
                  onPointerDown={onPointerDown('move')}
                >
                  {(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as Handle[]).map((h) => (
                    <span
                      key={h}
                      onPointerDown={onPointerDown(h)}
                      className={cn(
                        'absolute h-3.5 w-3.5 rounded-sm border border-black/30 bg-white',
                        h.includes('n')
                          ? '-top-2'
                          : h.includes('s')
                            ? '-bottom-2'
                            : 'top-1/2 -translate-y-1/2',
                        h.includes('w')
                          ? '-left-2'
                          : h.includes('e')
                            ? '-right-2'
                            : 'left-1/2 -translate-x-1/2',
                        {
                          n: 'cursor-ns-resize',
                          s: 'cursor-ns-resize',
                          e: 'cursor-ew-resize',
                          w: 'cursor-ew-resize',
                          ne: 'cursor-nesw-resize',
                          sw: 'cursor-nesw-resize',
                          nw: 'cursor-nwse-resize',
                          se: 'cursor-nwse-resize',
                          move: '',
                        }[h],
                      )}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        {current && (
          <span className="absolute bottom-3 right-3 rounded-md bg-black/60 px-2 py-1 font-mono text-[10.5px] text-white">
            {current.width} × {current.height}
          </span>
        )}
      </div>
    ),
    /** The two tool sections, to put under Información. */
    tools: (
      <>
        <section className={sideClass}>
          {sectionBtn(
            'crop',
            'Recortar y transformar',
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4 text-ink-3"
              aria-hidden="true"
            >
              <path d="M6 2v14a2 2 0 0 0 2 2h14" />
              <path d="M18 22V8a2 2 0 0 0-2-2H2" />
            </svg>,
          )}
          {tool === 'crop' && current && (
            <div className="flex flex-col gap-3 p-4">
              <div>
                <p className="mb-1.5 text-[12px] font-semibold text-ink-2">Orientación</p>
                <div className="flex rounded-md border border-line-2 bg-surface-2 p-0.5">
                  {(['landscape', 'portrait'] as const).map((o) => {
                    const on = (o === 'portrait') === portrait;
                    return (
                      <button
                        key={o}
                        type="button"
                        onClick={() => setPortrait(o === 'portrait')}
                        className={cn(
                          'flex flex-1 items-center justify-center gap-2 rounded py-1.5 text-[12.5px] font-medium transition-colors',
                          on ? 'bg-surface text-ink shadow-sm' : 'text-ink-3 hover:text-ink',
                        )}
                        aria-pressed={on}
                      >
                        <span
                          className={cn(
                            'block rounded-[3px] border-2',
                            on ? 'border-ink' : 'border-ink-3',
                            o === 'landscape' ? 'h-3 w-[18px]' : 'h-[18px] w-3',
                          )}
                        />
                        {o === 'landscape' ? 'Horizontal' : 'Vertical'}
                      </button>
                    );
                  })}
                </div>
              </div>
              <ul className="flex flex-col">
                {ASPECTS.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => setAspectId(a.id)}
                      className={cn(
                        'flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-surface-2',
                        aspectId === a.id && 'bg-surface-2 font-semibold',
                      )}
                    >
                      {a.label}
                      {aspectId === a.id && <span className="text-accent-dark">✓</span>}
                    </button>
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                size="sm"
                disabled={
                  !crop ||
                  (Math.round(crop.w) === current.width &&
                    Math.round(crop.h) === current.height &&
                    crop.x === 0 &&
                    crop.y === 0)
                }
                onClick={() => crop && void apply(cropBitmap(current, crop))}
              >
                Aplicar recorte
              </Button>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="mb-1.5 text-[12px] font-semibold text-ink-2">Voltear</p>
                  <div className="flex gap-1">
                    <IconButton
                      label="Voltear horizontal"
                      onClick={() => void apply(flipBitmap(current, 'h'))}
                      className="border border-line-2"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.75}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-4 w-4"
                        aria-hidden="true"
                      >
                        <path d="M12 3v18" />
                        <path d="M8 7 4 12l4 5" />
                        <path d="m16 7 4 5-4 5" />
                      </svg>
                    </IconButton>
                    <IconButton
                      label="Voltear vertical"
                      onClick={() => void apply(flipBitmap(current, 'v'))}
                      className="border border-line-2"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.75}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-4 w-4"
                        aria-hidden="true"
                      >
                        <path d="M3 12h18" />
                        <path d="m7 8 5-4 5 4" />
                        <path d="m7 16 5 4 5-4" />
                      </svg>
                    </IconButton>
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-[12px] font-semibold text-ink-2">Rotar</p>
                  <div className="flex gap-1">
                    <IconButton
                      label="Rotar a la izquierda"
                      onClick={() => void apply(rotateBitmap(current, -90))}
                      className="border border-line-2"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.75}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-4 w-4"
                        aria-hidden="true"
                      >
                        <path d="M3 7v6h6" />
                        <path d="M21 17a9 9 0 0 0-15-6.7L3 13" />
                      </svg>
                    </IconButton>
                    <IconButton
                      label="Rotar a la derecha"
                      onClick={() => void apply(rotateBitmap(current, 90))}
                      className="border border-line-2"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.75}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-4 w-4"
                        aria-hidden="true"
                      >
                        <path d="M21 7v6h-6" />
                        <path d="M3 17a9 9 0 0 1 15-6.7L21 13" />
                      </svg>
                    </IconButton>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
        <section className={sideClass}>
          {sectionBtn(
            'resize',
            'Redimensionar',
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4 text-ink-3"
              aria-hidden="true"
            >
              <path d="M21 3 14 10" />
              <path d="M21 8V3h-5" />
              <path d="m3 21 7-7" />
              <path d="M3 16v5h5" />
            </svg>,
          )}
          {tool === 'resize' && current && (
            <div className="flex flex-col gap-3 p-4">
              <div className="flex items-end gap-2">
                <label className="flex flex-1 flex-col gap-1 font-mono text-[11px] text-muted">
                  Ancho
                  <Input
                    type="number"
                    min={1}
                    value={size.w}
                    onChange={(e) => {
                      const w = e.target.value;
                      setSize(
                        lock && Number(w) > 0
                          ? {
                              w,
                              h: String(
                                Math.max(
                                  1,
                                  Math.round((Number(w) * current.height) / current.width),
                                ),
                              ),
                            }
                          : { ...size, w },
                      );
                    }}
                  />
                </label>
                <IconButton
                  label={lock ? 'Proporción fija' : 'Proporción libre'}
                  onClick={() => setLock((l) => !l)}
                  className={cn(
                    'mb-0.5 border',
                    lock ? 'border-accent text-accent-dark' : 'border-line-2',
                  )}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.75}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4"
                    aria-hidden="true"
                  >
                    <rect x="5" y="11" width="14" height="10" rx="2" />
                    {lock ? (
                      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                    ) : (
                      <path d="M8 11V7a4 4 0 0 1 7.5-2" />
                    )}
                  </svg>
                </IconButton>
                <label className="flex flex-1 flex-col gap-1 font-mono text-[11px] text-muted">
                  Alto
                  <Input
                    type="number"
                    min={1}
                    value={size.h}
                    onChange={(e) => {
                      const h = e.target.value;
                      setSize(
                        lock && Number(h) > 0
                          ? {
                              h,
                              w: String(
                                Math.max(
                                  1,
                                  Math.round((Number(h) * current.width) / current.height),
                                ),
                              ),
                            }
                          : { ...size, h },
                      );
                    }}
                  />
                </label>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={
                  !(Number(size.w) > 0 && Number(size.h) > 0) ||
                  (Number(size.w) === current.width && Number(size.h) === current.height)
                }
                onClick={() => void apply(resizeBitmap(current, Number(size.w), Number(size.h)))}
              >
                Aplicar tamaño
              </Button>
              <p className="text-[11.5px] leading-snug text-muted">
                Agrandar una imagen no añade detalle; reducirla sí ahorra peso.
              </p>
            </div>
          )}
        </section>
      </>
    ),
  };
}
