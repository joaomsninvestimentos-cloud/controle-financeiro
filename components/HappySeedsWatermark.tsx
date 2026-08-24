'use client';

import { X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';

const REACTUS_ORIGIN = (process.env.REACTUS_BASE_URL ?? '').replace(/\/$/, '');
const WATERMARK_API_BASE = REACTUS_ORIGIN
  ? `${REACTUS_ORIGIN}/v1/project`
  : '';
const PROJECT_ID = typeof process.env.PROJECT_ID === 'string'
  ? process.env.PROJECT_ID.trim()
  : '';
const WATERMARK_LINK_URL = `https://link.happyseeds.ai/watermark?utm_term=${encodeURIComponent(PROJECT_ID)}`;
const HAPPYSEEDS_LOGO_URL = 'https://happyseeds.ai/logo.svg';
const WATERMARK_DEFAULT_OFFSET = 24;
const WATERMARK_EDGE_GAP = 12;
const DRAG_CLICK_THRESHOLD = 5;

type WatermarkPosition = {
  x: number;
  y: number;
};

type ActiveDrag = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  moved: boolean;
};

type WatermarkData = {
  show: boolean;
  handle: string;
  remix: boolean;
};

function parseWatermarkResponse(payload: unknown): WatermarkData | null {
  if (!payload || typeof payload !== 'object') return null;
  const envelope = payload as { success?: unknown; data?: unknown };
  if (envelope.success !== true) return null;
  const data = envelope.data;
  if (!data || typeof data !== 'object') return null;
  const record = data as {
    show_watermark?: unknown;
    handle?: unknown;
    remix?: unknown;
  };
  if (record.show_watermark !== true) return null;

  const rawHandle = typeof record.handle === 'string' ? record.handle.trim() : '';
  const handle = rawHandle
    ? (rawHandle.startsWith('@') ? rawHandle : `@${rawHandle}`)
    : '';

  return {
    show: true,
    handle,
    remix: record.remix === true,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function clampWatermarkPosition(
  position: WatermarkPosition,
  element: HTMLElement,
): WatermarkPosition {
  const rect = element.getBoundingClientRect();
  const maxX = Math.max(
    WATERMARK_EDGE_GAP,
    window.innerWidth - rect.width - WATERMARK_EDGE_GAP,
  );
  const maxY = Math.max(
    WATERMARK_EDGE_GAP,
    window.innerHeight - rect.height - WATERMARK_EDGE_GAP,
  );

  return {
    x: clamp(position.x, WATERMARK_EDGE_GAP, maxX),
    y: clamp(position.y, WATERMARK_EDGE_GAP, maxY),
  };
}

function getDefaultPosition(element: HTMLElement): WatermarkPosition {
  const rect = element.getBoundingClientRect();
  return {
    x: window.innerWidth - rect.width - WATERMARK_DEFAULT_OFFSET,
    y: window.innerHeight - rect.height - WATERMARK_DEFAULT_OFFSET,
  };
}

export function HappySeedsWatermark() {
  const watermarkRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<ActiveDrag | null>(null);
  const suppressClickRef = useRef(false);
  const hasUserMovedRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [isIframe, setIsIframe] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [visible, setVisible] = useState(false);
  const [handle, setHandle] = useState('');
  const [remix, setRemix] = useState(false);
  const [position, setPosition] = useState<WatermarkPosition | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    try {
      setIsIframe(window.self !== window.top);
    } catch {
      /* 跨域父页面等场景下视作嵌入 */
      setIsIframe(true);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || isIframe || dismissed) return;
    const projectId = PROJECT_ID;
    if (!projectId || !WATERMARK_API_BASE) return;

    let cancelled = false;
    (async () => {
      try {
        const url = `${WATERMARK_API_BASE}/${projectId}/watermark`;
        const res = await fetch(url);
        const payload: unknown = await res.json().catch(() => null);
        const parsed = parseWatermarkResponse(payload);
        if (cancelled || !parsed) return;
        setHandle(parsed.handle);
        setRemix(parsed.remix);
        setVisible(true);
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, isIframe, dismissed]);

  const syncPosition = useCallback(() => {
    const element = watermarkRef.current;
    if (!element) return;

    setPosition((current) => {
      const source = hasUserMovedRef.current && current
        ? current
        : getDefaultPosition(element);
      const next = clampWatermarkPosition(source, element);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!visible) return;

    const frame = window.requestAnimationFrame(syncPosition);
    const handleViewportChange = () => syncPosition();

    window.addEventListener('resize', handleViewportChange);
    window.visualViewport?.addEventListener('resize', handleViewportChange);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', handleViewportChange);
      window.visualViewport?.removeEventListener('resize', handleViewportChange);
    };
  }, [visible, handle, remix, syncPosition]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;

    const element = watermarkRef.current;
    if (!element) return;

    const rect = element.getBoundingClientRect();
    const origin = clampWatermarkPosition(position ?? { x: rect.left, y: rect.top }, element);

    // 未超过阈值前不 capture / 不 setState，避免抢走 <a> 的 click
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: origin.x,
      originY: origin.y,
      moved: false,
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const element = watermarkRef.current;
    if (!drag || !element || drag.pointerId !== event.pointerId) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;

    if (!drag.moved) {
      if (Math.hypot(dx, dy) < DRAG_CLICK_THRESHOLD) return;

      drag.moved = true;
      hasUserMovedRef.current = true;
      setDragging(true);
      setPosition(clampWatermarkPosition(
        { x: drag.originX, y: drag.originY },
        element,
      ));
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
    }

    event.preventDefault();
    setPosition(clampWatermarkPosition(
      { x: drag.originX + dx, y: drag.originY + dy },
      element,
    ));
  };

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const element = watermarkRef.current;
    if (!drag || !element || drag.pointerId !== event.pointerId) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    const moved = drag.moved;

    dragRef.current = null;
    setDragging(false);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (!moved) return;

    event.preventDefault();
    suppressClickRef.current = true;

    const next = clampWatermarkPosition(
      { x: drag.originX + dx, y: drag.originY + dy },
      element,
    );
    setPosition(next);

    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  };

  const handleLinkClick = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    if (!suppressClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClickRef.current = false;
  };

  const onClose = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDismissed(true);
    setVisible(false);
  }, []);

  if (!ready || isIframe || dismissed || !visible) return null;

  const actionText = remix ? 'Remixed with' : 'Edit with';
  const ariaLabel = handle
    ? `${handle} ${actionText} HappySeeds`
    : `${actionText} HappySeeds`;

  return (
    <div
      ref={watermarkRef}
      className="pointer-events-auto fixed z-50 font-sans"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      style={{
        left: position ? `${position.x}px` : undefined,
        top: position ? `${position.y}px` : undefined,
        right: position ? undefined : `${WATERMARK_DEFAULT_OFFSET}px`,
        bottom: position ? undefined : `${WATERMARK_DEFAULT_OFFSET}px`,
        maxWidth: `calc(100vw - ${WATERMARK_EDGE_GAP * 2}px)`,
        touchAction: 'none',
        userSelect: 'none',
        cursor: dragging ? 'grabbing' : 'grab',
        visibility: position ? 'visible' : 'hidden',
      }}
    >
      <div className="flex max-w-full items-stretch overflow-hidden rounded-full border border-[#e5e5e5] bg-[#ffffff] shadow-sm">
        <a
          href={WATERMARK_LINK_URL}
          target="_blank"
          rel="noopener noreferrer"
          draggable={false}
          onClick={handleLinkClick}
          aria-label={ariaLabel}
          title={`${ariaLabel}. Drag to reposition.`}
          className="flex max-w-full items-center gap-1.5 px-3.5 py-2 text-sm no-underline hover:bg-[#fafafa]"
        >
          <span className="shrink-0 text-[#737373]">{actionText}</span>
          <img
            src={HAPPYSEEDS_LOGO_URL}
            alt=""
            width={20}
            height={20}
            draggable={false}
            className="size-5 shrink-0"
          />
          <span className="shrink-0 font-medium text-[#171717]">HappySeeds</span>
        </a>
        <button
          type="button"
          onClick={onClose}
          onPointerDown={(event) => event.stopPropagation()}
          className="flex shrink-0 items-center justify-center px-2.5 text-[#a3a3a3] hover:bg-[#fafafa] hover:text-[#525252]"
          aria-label="Close"
        >
          <X className="size-3.5 shrink-0" aria-hidden strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
