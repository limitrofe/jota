import type {
  JournalContent,
  TemplateLayer,
  TemplateVariant,
  MediaFit,
} from "@/lib/template-spec";
import { fitRect, layerBounds } from "@/lib/template-spec";

type MediaMap = Map<string, HTMLImageElement | HTMLVideoElement>;

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.max(0, Math.min(radius, Math.min(width, height) / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
) {
  const lines: string[] = [];
  const paragraphs = text.split(/\n+/g);

  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);

    if (!words.length) {
      lines.push("");
      continue;
    }

    let line = words[0]!;
    for (let i = 1; i < words.length; i += 1) {
      const next = `${line} ${words[i]}`;
      if (ctx.measureText(next).width <= maxWidth) {
        line = next;
      } else {
        lines.push(line);
        line = words[i]!;
      }
    }
    lines.push(line);
  }

  if (lines.length <= maxLines) {
    return lines;
  }

  const truncated = lines.slice(0, maxLines);
  const lastIndex = truncated.length - 1;
  truncated[lastIndex] = `${truncated[lastIndex]!.replace(/\.\.\.$/, "")}…`;
  return truncated;
}

function parseFill(fill: string) {
  if (fill.startsWith("linear-gradient(")) {
    return null;
  }

  return fill;
}

function drawFill(
  ctx: CanvasRenderingContext2D,
  fill: string,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  if (fill.startsWith("linear-gradient(")) {
    const match = fill.match(/linear-gradient\(([^,]+)deg,\s*([^)]+)\)/);
    if (!match) {
      ctx.fillStyle = "#111827";
      ctx.fillRect(x, y, width, height);
      return;
    }

    const angle = Number(match[1]) || 135;
    const stops = match[2]!.split(",").map((stop) => stop.trim());
    const gradient = ctx.createLinearGradient(
      x + width * Math.cos((angle * Math.PI) / 180),
      y + height * Math.sin((angle * Math.PI) / 180),
      x + width,
      y + height,
    );

    const denominator = Math.max(stops.length - 1, 1);
    stops.forEach((stop, index) => {
      const parts = stop.split(/\s+(?![^()]*\))/);
      const color = parts[0]!;
      const position = parts[1] ? Number.parseFloat(parts[1]!) / 100 : index / denominator;
      gradient.addColorStop(Math.min(1, Math.max(0, position)), color);
    });

    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, width, height);
    return;
  }

  ctx.fillStyle = parseFill(fill) ?? "#111827";
  ctx.fillRect(x, y, width, height);
}

function getTransitionState(layer: TemplateLayer, elapsedSeconds: number) {
  const enter = Math.max(0, layer.enterAt || 0);
  const exit = Math.max(0, layer.exitAt || 0);
  const transitionWindow = 0.45;

  if (elapsedSeconds < enter) {
    return { alpha: 0, offsetX: 0, offsetY: 0 };
  }

  if (exit > 0 && elapsedSeconds > exit + transitionWindow) {
    return { alpha: 0, offsetX: 0, offsetY: 0 };
  }

  let alpha = 1;
  let offsetX = 0;
  let offsetY = 0;

  if (elapsedSeconds < enter + transitionWindow) {
    const progress = (elapsedSeconds - enter) / transitionWindow;
    alpha = Math.max(0, Math.min(1, progress));

    if (layer.transition === "slide-up") {
      offsetY = (1 - alpha) * 24;
    }

    if (layer.transition === "slide-left") {
      offsetX = -(1 - alpha) * 24;
    }
  }

  if (exit > 0 && elapsedSeconds > exit) {
    const progress = 1 - (elapsedSeconds - exit) / transitionWindow;
    alpha = Math.max(0, Math.min(1, progress));
  }

  return { alpha, offsetX, offsetY };
}

async function drawAsset(
  ctx: CanvasRenderingContext2D,
  element: HTMLImageElement | HTMLVideoElement,
  layer: TemplateLayer,
  targetX: number,
  targetY: number,
  targetWidth: number,
  targetHeight: number,
) {
  const sourceWidth = "videoWidth" in element ? element.videoWidth : element.naturalWidth;
  const sourceHeight = "videoHeight" in element ? element.videoHeight : element.naturalHeight;
  if (!sourceWidth || !sourceHeight) {
    return false;
  }

  const fit = fitRect(sourceWidth, sourceHeight, targetWidth, targetHeight, layer.mediaFit);
  ctx.drawImage(element, targetX + fit.x, targetY + fit.y, fit.width, fit.height);
  return true;
}

async function renderLayer(
  ctx: CanvasRenderingContext2D,
  layer: TemplateLayer,
  variantWidth: number,
  variantHeight: number,
  content: JournalContent,
  mediaCache: MediaMap,
  elapsedSeconds: number,
) {
  const bounds = layerBounds(layer, variantWidth, variantHeight);
  const { alpha, offsetX, offsetY } = getTransitionState(layer, elapsedSeconds);
  if (!alpha || alpha <= 0) {
    return;
  }

  ctx.save();
  try {
    ctx.globalAlpha *= alpha * layer.opacity;
    ctx.translate(offsetX, offsetY);

    if (layer.kind === "shape" || layer.kind === "background") {
      const resolvedSource = layer.asset?.dataUrl;

      if (resolvedSource) {
        let element = mediaCache.get(resolvedSource);
        if (!element) {
          const image = new Image();
          image.src = resolvedSource;
          mediaCache.set(resolvedSource, image);
          element = image;
        }

        if (layer.radius > 0) {
          drawRoundedRect(ctx, bounds.x, bounds.y, bounds.width, bounds.height, layer.radius);
          ctx.clip();
        }

        if (element instanceof HTMLImageElement && !element.complete) {
          drawFill(ctx, "#0F172A", bounds.x, bounds.y, bounds.width, bounds.height);
          return;
        }

        const drawn = await drawAsset(ctx, element, layer, bounds.x, bounds.y, bounds.width, bounds.height);
        if (!drawn) {
          drawFill(ctx, layer.fill, bounds.x, bounds.y, bounds.width, bounds.height);
        }
      } else {
        if (layer.radius > 0) {
          drawRoundedRect(ctx, bounds.x, bounds.y, bounds.width, bounds.height, layer.radius);
          ctx.clip();
        }
        drawFill(ctx, layer.fill, bounds.x, bounds.y, bounds.width, bounds.height);
      }
    }

    if (layer.kind === "image" || layer.kind === "video") {
      const source = content.media[layer.id];
      const resolvedSource = source?.src ?? layer.asset?.dataUrl;
      if (!resolvedSource) {
        drawRoundedRect(ctx, bounds.x, bounds.y, bounds.width, bounds.height, layer.radius);
        ctx.fillStyle = "#1F2937";
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.16)";
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.font = `600 ${Math.max(20, Math.min(bounds.width, bounds.height) * 0.08)}px var(--font-body)`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(layer.kind === "video" ? "Vídeo" : "Imagem", bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      } else {
        let element = mediaCache.get(resolvedSource);
        if (!element) {
          if (layer.kind === "video" || source?.kind === "video") {
            const video = document.createElement("video");
            video.src = resolvedSource;
            video.muted = true;
            video.playsInline = true;
            video.loop = true;
            video.preload = "auto";
            void video.play().catch(() => undefined);
            mediaCache.set(resolvedSource, video);
            element = video;
          } else {
            const image = new Image();
            image.src = resolvedSource;
            mediaCache.set(resolvedSource, image);
            element = image;
          }
        }

        drawRoundedRect(ctx, bounds.x, bounds.y, bounds.width, bounds.height, layer.radius);
        ctx.save();
        ctx.clip();
        try {
          if (element instanceof HTMLImageElement && !element.complete) {
            drawFill(ctx, "#0F172A", bounds.x, bounds.y, bounds.width, bounds.height);
            return;
          }

          if (element instanceof HTMLVideoElement && (element.readyState < 2 || !element.videoWidth)) {
            drawFill(ctx, "#0F172A", bounds.x, bounds.y, bounds.width, bounds.height);
            return;
          }

          const drawn = await drawAsset(ctx, element, layer, bounds.x, bounds.y, bounds.width, bounds.height);
          if (!drawn) {
            drawFill(ctx, "#0F172A", bounds.x, bounds.y, bounds.width, bounds.height);
          }
        } finally {
          ctx.restore();
        }
      }
    }

    if (layer.kind === "text") {
      const text = content.texts[layer.id]?.trim() || layer.textPlaceholder;
      const paddingX = Math.max(12, bounds.width * 0.02);
      const paddingY = Math.max(10, bounds.height * 0.12);
      const innerWidth = bounds.width - paddingX * 2;
      const innerHeight = bounds.height - paddingY * 2;

      ctx.fillStyle = layer.color;
      ctx.textAlign = layer.align;
      ctx.textBaseline = "top";
      ctx.font = `${layer.fontWeight} ${layer.fontSize}px ${layer.fontFamily}`;

      const lines = wrapLines(ctx, text, innerWidth, layer.maxLines);
      const lineHeight = layer.fontSize * layer.lineHeight;
      let textX = bounds.x + paddingX;
      if (layer.align === "center") {
        textX = bounds.x + bounds.width / 2;
      }
      if (layer.align === "right") {
        textX = bounds.x + bounds.width - paddingX;
      }

      const totalHeight = lines.length * lineHeight;
      let textY = bounds.y + paddingY;
      if (totalHeight < innerHeight) {
        textY = bounds.y + paddingY + (innerHeight - totalHeight) * 0.15;
      }

      for (let index = 0; index < lines.length; index += 1) {
        ctx.fillText(lines[index]!, textX, textY + lineHeight * index);
      }
    }
  } finally {
    ctx.restore();
  }
}

export async function renderTemplateFrame(
  ctx: CanvasRenderingContext2D,
  variant: TemplateVariant,
  content: JournalContent,
  mediaCache: MediaMap,
  elapsedSeconds = 0,
) {
  ctx.clearRect(0, 0, variant.width, variant.height);
  ctx.fillStyle = variant.backgroundColor;
  ctx.fillRect(0, 0, variant.width, variant.height);

  const sortedLayers = [...variant.layers].sort((a, b) => a.zIndex - b.zIndex);
  for (const layer of sortedLayers) {
    // eslint-disable-next-line no-await-in-loop
    await renderLayer(ctx, layer, variant.width, variant.height, content, mediaCache, elapsedSeconds);
  }
}
