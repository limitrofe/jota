import type {
  ContentBundle,
  TemplateLayer,
  TemplateVariant,
  MediaFit,
} from "@/lib/template-spec";
import { defaultTextStyle, fitRect, getLayerContentKey, layerBounds } from "@/lib/template-spec";

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

  const pushWrappedWord = (word: string) => {
    const characters = Array.from(word);
    let chunk = "";

    for (const character of characters) {
      const next = `${chunk}${character}`;
      if (chunk && ctx.measureText(next).width > maxWidth) {
        lines.push(chunk);
        chunk = character;
      } else {
        chunk = next;
      }
    }

    if (chunk) {
      lines.push(chunk);
    }
  };

  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);

    if (!words.length) {
      lines.push("");
      continue;
    }

    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;

      if (ctx.measureText(candidate).width <= maxWidth) {
        line = candidate;
        continue;
      }

      if (line) {
        lines.push(line);
        line = "";
      }

      if (ctx.measureText(word).width <= maxWidth) {
        line = word;
        continue;
      }

      pushWrappedWord(word);
    }

    if (line) {
      lines.push(line);
    }
  }

  if (lines.length <= maxLines) {
    return lines;
  }

  const truncated = lines.slice(0, maxLines);
  const lastIndex = truncated.length - 1;
  truncated[lastIndex] = `${truncated[lastIndex]!.replace(/\.\.\.$/, "")}…`;
  return truncated;
}

function fitTextBox(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxHeight: number,
  maxLines: number,
  fontFamily: string,
  fontWeight: number,
  preferredSize: number,
  lineHeight: number,
) {
  const minFontSize = Math.max(18, Math.min(36, Math.round(preferredSize * 0.4)));

  for (let fontSize = preferredSize; fontSize >= minFontSize; fontSize -= 2) {
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    const lines = wrapLines(ctx, text, maxWidth, maxLines);
    const height = lines.length * fontSize * lineHeight;
    const widestLine = lines.reduce((currentMax, line) => Math.max(currentMax, ctx.measureText(line).width), 0);

    if (widestLine <= maxWidth && height <= maxHeight) {
      return { fontSize, lines, lineHeight: fontSize * lineHeight };
    }
  }

  const fallbackSize = minFontSize;
  ctx.font = `${fontWeight} ${fallbackSize}px ${fontFamily}`;
  const lines = wrapLines(ctx, text, maxWidth, maxLines);
  return { fontSize: fallbackSize, lines, lineHeight: fallbackSize * lineHeight };
}

function resolveTextPlacement(
  boundsX: number,
  boundsY: number,
  boundsWidth: number,
  boundsHeight: number,
  placement: string,
  blockHeight: number,
) {
  const boxWidth = boundsWidth * 0.6;
  const isRight = placement.includes("right");
  const isBottom = placement.includes("bottom");

  return {
    boxX: isRight ? boundsX + boundsWidth - boxWidth : boundsX,
    boxY: isBottom ? boundsY + Math.max(0, boundsHeight - blockHeight) : boundsY,
    boxWidth,
    align: isRight ? ("right" as const) : ("left" as const),
  };
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
      ctx.fillStyle = "#E5E7EB";
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

  ctx.fillStyle = parseFill(fill) ?? "#E5E7EB";
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
  position: TemplateLayer["mediaPosition"] = "center",
  scale = 1,
) {
  const sourceWidth = "videoWidth" in element ? element.videoWidth : element.naturalWidth;
  const sourceHeight = "videoHeight" in element ? element.videoHeight : element.naturalHeight;
  if (!sourceWidth || !sourceHeight) {
    return false;
  }

  const fit = fitRect(sourceWidth, sourceHeight, targetWidth, targetHeight, layer.mediaFit, position, scale);
  ctx.drawImage(element, targetX + fit.x, targetY + fit.y, fit.width, fit.height);
  return true;
}

async function renderLayer(
  ctx: CanvasRenderingContext2D,
  layer: TemplateLayer,
  variantWidth: number,
  variantHeight: number,
  content: ContentBundle,
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
          drawFill(ctx, "#F3F4F6", bounds.x, bounds.y, bounds.width, bounds.height);
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
      const key = getLayerContentKey(layer);
      const source = content.media[key];
      const resolvedSource = source?.src ?? layer.asset?.dataUrl;
      const mediaPosition = source?.position ?? layer.mediaPosition ?? "center";
      const mediaScale = Math.max(1, source?.scale ?? layer.mediaScale ?? 1);
      if (!resolvedSource) {
        drawRoundedRect(ctx, bounds.x, bounds.y, bounds.width, bounds.height, layer.radius);
        ctx.fillStyle = "#F3F4F6";
        ctx.fill();
        ctx.strokeStyle = "rgba(17,17,17,0.10)";
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.fillStyle = "rgba(17,17,17,0.72)";
        ctx.font = `600 ${Math.max(20, Math.min(bounds.width, bounds.height) * 0.08)}px Roboto, sans-serif`;
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
            drawFill(ctx, "#F3F4F6", bounds.x, bounds.y, bounds.width, bounds.height);
            return;
          }

          if (element instanceof HTMLVideoElement && (element.readyState < 2 || !element.videoWidth)) {
            drawFill(ctx, "#F3F4F6", bounds.x, bounds.y, bounds.width, bounds.height);
            return;
          }

          const drawn = await drawAsset(
            ctx,
            element,
            layer,
            bounds.x,
            bounds.y,
            bounds.width,
            bounds.height,
            mediaPosition,
            mediaScale,
          );
          if (!drawn) {
            drawFill(ctx, "#F3F4F6", bounds.x, bounds.y, bounds.width, bounds.height);
          }
        } finally {
          ctx.restore();
        }
      }
    }

    if (layer.kind === "text") {
      const key = getLayerContentKey(layer);
      const text = content.texts[key]?.trim() || layer.textPlaceholder;
      const style = content.textStyles[key] ?? defaultTextStyle(layer);
      const boxWidth = bounds.width * 0.6;
      const horizontalPadding = Math.max(18, boxWidth * 0.08);
      const verticalPadding = Math.max(12, bounds.height * 0.08);
      const innerWidth = boxWidth - horizontalPadding * 2;
      const innerHeight = bounds.height - verticalPadding * 2;

      const fitted = fitTextBox(
        ctx,
        text,
        innerWidth,
        innerHeight,
        layer.maxLines,
        layer.fontFamily,
        layer.fontWeight,
        layer.fontSize,
        layer.lineHeight,
      );

      const lines = fitted.lines;
      const lineHeight = fitted.lineHeight;
      const totalHeight = lines.length * lineHeight;
      const blockHeight = totalHeight + verticalPadding * 2;
      const placement = resolveTextPlacement(bounds.x, bounds.y, bounds.width, bounds.height, style.placement, blockHeight);
      const textY = placement.boxY + verticalPadding;
      const leftTextX = placement.boxX + horizontalPadding;
      const rightTextX = placement.boxX + placement.boxWidth - horizontalPadding;

      ctx.fillStyle = style.color || layer.color;
      ctx.textAlign = placement.align;
      ctx.textBaseline = "top";

      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]!;
        const lineWidth = ctx.measureText(line).width;
        const anchorX = placement.align === "right" ? rightTextX : leftTextX;
        const backgroundPaddingX = Math.max(10, horizontalPadding * 0.45);
        const backgroundPaddingY = Math.max(6, lineHeight * 0.18);

        if (style.backgroundEnabled) {
          ctx.save();
          ctx.globalAlpha *= style.backgroundOpacity;
          ctx.fillStyle = style.backgroundColor;
          const lineX = placement.align === "right"
            ? anchorX - lineWidth - backgroundPaddingX
            : anchorX - backgroundPaddingX;
          const lineY = textY + index * lineHeight - backgroundPaddingY;
          drawRoundedRect(
            ctx,
            lineX,
            lineY,
            lineWidth + backgroundPaddingX * 2,
            lineHeight + backgroundPaddingY * 2,
            style.backgroundRadius,
          );
          ctx.fill();
          ctx.restore();
        }

        ctx.fillText(line, anchorX, textY + lineHeight * index);
      }
    }
  } finally {
    ctx.restore();
  }
}

export async function renderTemplateFrame(
  ctx: CanvasRenderingContext2D,
  variant: TemplateVariant,
  content: ContentBundle,
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
