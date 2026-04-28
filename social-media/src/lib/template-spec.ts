export type AspectRatioKey = "1:1" | "4:5" | "9:16" | "16:9";

export const ASPECT_SIZES: Record<AspectRatioKey, { width: number; height: number }> = {
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
};

export type LayerKind = "background" | "image" | "video" | "text" | "shape";
export type TransitionKind = "none" | "fade" | "slide-up" | "slide-left";
export type MediaFit = "cover" | "contain";
export type TextAlign = "left" | "center" | "right";

export interface LayerAsset {
  name: string;
  dataUrl: string;
  mimeType: string;
}

export interface TemplateLayer {
  id: string;
  name: string;
  kind: LayerKind;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  enterAt: number;
  exitAt: number;
  transition: TransitionKind;
  opacity: number;
  fill: string;
  radius: number;
  editable: boolean;
  locked: boolean;
  mediaFit: MediaFit;
  textPlaceholder: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  color: string;
  align: TextAlign;
  maxLines: number;
  asset?: LayerAsset;
}

export interface TemplateVariant {
  id: string;
  name: string;
  aspectRatio: AspectRatioKey;
  width: number;
  height: number;
  backgroundColor: string;
  layers: TemplateLayer[];
}

export interface TemplateSpec {
  id: string;
  name: string;
  description: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  variants: TemplateVariant[];
}

export interface MediaInput {
  kind: "image" | "video";
  src: string;
  name: string;
}

export interface JournalContent {
  texts: Record<string, string>;
  media: Record<string, MediaInput | undefined>;
}

export function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function getSizeForRatio(aspectRatio: AspectRatioKey) {
  return ASPECT_SIZES[aspectRatio];
}

export function createLayer(kind: LayerKind, index: number): TemplateLayer {
  const common = {
    id: createId("layer"),
    zIndex: index,
    enterAt: 0,
    exitAt: 0,
    transition: "fade" as TransitionKind,
    opacity: 1,
    fill: "#111827",
    radius: 28,
    editable: true,
    locked: false,
    mediaFit: "cover" as MediaFit,
    textPlaceholder: "Digite o texto aqui",
    fontFamily: "Inter, sans-serif",
    fontSize: 58,
    fontWeight: 700,
    lineHeight: 1.08,
    color: "#F8FAFC",
    align: "left" as TextAlign,
    maxLines: 3,
  };

  const presets: Record<LayerKind, Partial<TemplateLayer>> = {
    background: { name: "Cartela PNG", kind: "background", x: 0, y: 0, width: 100, height: 100, editable: false },
    image: { name: "Slot de imagem", kind: "image", x: 56, y: 28, width: 34, height: 42 },
    video: { name: "Slot de vídeo", kind: "video", x: 56, y: 28, width: 34, height: 42 },
    text: {
      name: "Título",
      kind: "text",
      x: 8,
      y: 68,
      width: 42,
      height: 18,
      fontSize: 64,
      maxLines: 3,
      align: "left",
    },
    shape: {
      name: "Shape",
      kind: "shape",
      x: 8,
      y: 8,
      width: 22,
      height: 10,
      fill: "#0F172A",
      radius: 999,
    },
  };

  return {
    ...common,
    ...presets[kind],
  } as TemplateLayer;
}

export function createTemplate(name: string, description: string, aspectRatio: AspectRatioKey = "16:9"): TemplateSpec {
  const size = getSizeForRatio(aspectRatio);

  return {
    id: createId("template"),
    name,
    description,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    variants: [
      {
        id: createId("variant"),
        name: "Principal",
        aspectRatio,
        width: size.width,
        height: size.height,
        backgroundColor: "#0B1020",
        layers: [
          {
            ...createLayer("background", 0),
            name: "Base editorial",
            kind: "shape",
            fill: "linear-gradient(135deg, #0B1020 0%, #111827 52%, #18223D 100%)",
            editable: false,
          },
          {
            ...createLayer("shape", 1),
            name: "Faixa de destaque",
            x: 6,
            y: 6,
            width: 26,
            height: 9,
            fill: "#F97316",
          },
          {
            ...createLayer("text", 2),
            name: "Título principal",
            x: 8,
            y: 14,
            width: 56,
            height: 28,
            fontSize: 82,
            maxLines: 3,
            textPlaceholder: "Título da chamada",
          },
          {
            ...createLayer("text", 3),
            name: "Linha de apoio",
            x: 8,
            y: 44,
            width: 44,
            height: 12,
            fontSize: 34,
            fontWeight: 500,
            color: "#CBD5E1",
            maxLines: 2,
            textPlaceholder: "Resumo curto para contextualizar a peça",
          },
          {
            ...createLayer("image", 4),
            name: "Imagem principal",
            x: 58,
            y: 18,
            width: 34,
            height: 64,
            mediaFit: "cover",
          },
        ],
      },
    ],
  };
}

export function cloneVariant(variant: TemplateVariant, aspectRatio: AspectRatioKey): TemplateVariant {
  const size = getSizeForRatio(aspectRatio);

  return {
    ...variant,
    id: createId("variant"),
    name: `${variant.name} ${aspectRatio}`,
    aspectRatio,
    width: size.width,
    height: size.height,
    layers: variant.layers.map((layer) => ({ ...layer, id: createId("layer") })),
  };
}

export function createEmptyContent(variant: TemplateVariant): JournalContent {
  const texts: Record<string, string> = {};
  const media: Record<string, MediaInput | undefined> = {};

  for (const layer of variant.layers) {
    if (layer.kind === "text") {
      texts[layer.id] = "";
    }
    if (layer.kind === "image" || layer.kind === "video") {
      media[layer.id] = undefined;
    }
  }

  return { texts, media };
}

export function layerBounds(layer: TemplateLayer, width: number, height: number) {
  return {
    x: (layer.x / 100) * width,
    y: (layer.y / 100) * height,
    width: (layer.width / 100) * width,
    height: (layer.height / 100) * height,
  };
}

export function fitRect(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  mode: MediaFit,
) {
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = targetWidth / targetHeight;

  let width = targetWidth;
  let height = targetHeight;
  let x = 0;
  let y = 0;

  if (mode === "contain") {
    if (sourceRatio > targetRatio) {
      width = targetWidth;
      height = targetWidth / sourceRatio;
      y = (targetHeight - height) / 2;
    } else {
      height = targetHeight;
      width = targetHeight * sourceRatio;
      x = (targetWidth - width) / 2;
    }
  } else if (sourceRatio > targetRatio) {
    height = targetHeight;
    width = targetHeight * sourceRatio;
    x = (targetWidth - width) / 2;
  } else {
    width = targetWidth;
    height = targetWidth / sourceRatio;
    y = (targetHeight - height) / 2;
  }

  return { x, y, width, height };
}
