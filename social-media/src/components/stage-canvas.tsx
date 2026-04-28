"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { JournalContent, TemplateVariant } from "@/lib/template-spec";
import { renderTemplateFrame } from "@/lib/render-canvas";

export interface StageCanvasHandle {
  exportJpg(): Promise<Blob>;
  exportVideo(durationSeconds: number): Promise<Blob>;
}

interface StageCanvasProps {
  variant: TemplateVariant;
  content: JournalContent;
  className?: string;
  live?: boolean;
  onRenderTick?: (seconds: number) => void;
}

export const StageCanvas = forwardRef<StageCanvasHandle, StageCanvasProps>(function StageCanvas(
  { variant, content, className, live = true, onRenderTick },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaCache = useRef<Map<string, HTMLImageElement | HTMLVideoElement>>(new Map());
  const animationStart = useRef<number>(performance.now());
  const lastElapsed = useRef(0);
  const frameRef = useRef<number | null>(null);
  const recordingRef = useRef(false);

  useEffect(() => {
    animationStart.current = performance.now();
    lastElapsed.current = 0;
  }, [variant.id, content, variant.width, variant.height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    canvas.width = variant.width;
    canvas.height = variant.height;

    let cancelled = false;

    const draw = async (timestamp: number) => {
      if (cancelled) {
        return;
      }

      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) {
        return;
      }

      const elapsedSeconds = (timestamp - animationStart.current) / 1000;
      lastElapsed.current = elapsedSeconds;

      onRenderTick?.(elapsedSeconds);
      await renderTemplateFrame(ctx, variant, content, mediaCache.current, elapsedSeconds);

      if (live) {
        frameRef.current = window.requestAnimationFrame(draw);
      }
    };

    if (live) {
      frameRef.current = window.requestAnimationFrame(draw);
    } else {
      void draw(performance.now());
    }

    return () => {
      cancelled = true;
      if (frameRef.current) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, [content, live, onRenderTick, variant]);

  useImperativeHandle(ref, () => ({
    async exportJpg() {
      const canvas = canvasRef.current;
      if (!canvas) {
        throw new Error("Canvas não está pronto.");
      }

      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) {
        throw new Error("Canvas não está pronto.");
      }

      await renderTemplateFrame(ctx, variant, content, mediaCache.current, lastElapsed.current);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => {
          if (!result) {
            reject(new Error("Falha ao gerar JPG."));
            return;
          }
          resolve(result);
        }, "image/jpeg", 0.95);
      });

      return blob;
    },
    async exportVideo(durationSeconds: number) {
      const canvas = canvasRef.current;
      if (!canvas) {
        throw new Error("Canvas não está pronto.");
      }

      const preferredTypes = [
        "video/mp4",
        "video/mp4;codecs=h264",
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm",
      ];
      const mimeType = preferredTypes.find((type) => window.MediaRecorder.isTypeSupported(type));
      const stream = canvas.captureStream(30);
      const chunks: BlobPart[] = [];

      recordingRef.current = true;
      animationStart.current = performance.now();

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      const videoBlob = await new Promise<Blob>((resolve, reject) => {
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunks.push(event.data);
          }
        };

        recorder.onerror = () => {
          recordingRef.current = false;
          reject(new Error("Falha ao gravar vídeo."));
        };

        recorder.onstop = () => {
          recordingRef.current = false;
          resolve(new Blob(chunks, { type: mimeType ?? "video/webm" }));
        };

        recorder.start();
        window.setTimeout(() => {
          if (recorder.state !== "inactive") {
            recorder.stop();
          }
        }, durationSeconds * 1000);
      });

      return videoBlob;
    },
  }));

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        width: "100%",
        height: "auto",
        display: "block",
        borderRadius: 24,
      }}
    />
  );
});
