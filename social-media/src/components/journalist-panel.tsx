"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { StageCanvas, type StageCanvasHandle } from "@/components/stage-canvas";
import {
  TEMPLATE_CATEGORIES,
  createEmptyContent,
  type JournalContent,
  type TemplateCategoryId,
  type TemplateSpec,
} from "@/lib/template-spec";

interface JournalistPanelProps {
  templates: TemplateSpec[];
  allTemplates: TemplateSpec[];
  selectedThemeId: TemplateCategoryId;
  setSelectedThemeId: (value: TemplateCategoryId) => void;
  selectedTemplateId: string;
  setSelectedTemplateId: (value: string) => void;
  selectedVariantId: string;
  setSelectedVariantId: (value: string) => void;
}

function themeCount(allTemplates: TemplateSpec[], themeId: TemplateCategoryId) {
  return allTemplates.filter((template) => template.categoryId === themeId).length;
}

export function JournalistPanel({
  templates,
  allTemplates,
  selectedThemeId,
  setSelectedThemeId,
  selectedTemplateId,
  setSelectedTemplateId,
  selectedVariantId,
  setSelectedVariantId,
}: JournalistPanelProps) {
  const stageRef = useRef<StageCanvasHandle | null>(null);
  const [status, setStatus] = useState("Pronto para montar.");
  const initialVariant = templates[0]?.variants[0] ?? allTemplates[0]?.variants[0];
  const [content, setContent] = useState<JournalContent>(() =>
    initialVariant ? createEmptyContent(initialVariant) : { texts: {}, media: {} },
  );

  const selectedTheme = TEMPLATE_CATEGORIES.find((theme) => theme.id === selectedThemeId) ?? TEMPLATE_CATEGORIES[0];
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? templates[0];
  const selectedVariant = selectedTemplate?.variants.find((variant) => variant.id === selectedVariantId) ?? selectedTemplate?.variants[0];

  useEffect(() => {
    const current = selectedTemplate ?? templates[0] ?? allTemplates[0];
    const variant = current?.variants[0];
    if (!variant) return;

    setContent((previous) => {
      const base = createEmptyContent(variant);
      return {
        texts: { ...base.texts, ...previous.texts },
        media: { ...base.media, ...previous.media },
      };
    });
  }, [selectedTemplate?.id]);

  useEffect(() => {
    const currentThemeTemplates = allTemplates.filter((template) => template.categoryId === selectedThemeId);
    const preferred = currentThemeTemplates[0] ?? allTemplates[0];
    if (!preferred) return;

    if (!currentThemeTemplates.some((template) => template.id === selectedTemplateId)) {
      setSelectedTemplateId(preferred.id);
      setSelectedVariantId(preferred.variants[0]?.id ?? "");
    }
  }, [allTemplates, selectedTemplateId, selectedThemeId, setSelectedTemplateId, setSelectedVariantId]);

  useEffect(() => {
    const nextTemplate = templates.find((template) => template.id === selectedTemplateId) ?? templates[0];
    if (!nextTemplate) return;

    const nextVariant = nextTemplate.variants.find((variant) => variant.id === selectedVariantId) ?? nextTemplate.variants[0];
    if (nextVariant && nextVariant.id !== selectedVariantId) {
      setSelectedVariantId(nextVariant.id);
    }
  }, [selectedTemplateId, selectedVariantId, selectedThemeId, setSelectedVariantId, templates]);

  const textLayers = useMemo(
    () => selectedVariant?.layers.filter((layer) => layer.kind === "text") ?? [],
    [selectedVariant],
  );
  const mediaLayers = useMemo(
    () => selectedVariant?.layers.filter((layer) => layer.kind === "image" || layer.kind === "video") ?? [],
    [selectedVariant],
  );

  if (!selectedTemplate || !selectedVariant) {
    return null;
  }

  function persistStatus(next: string) {
    setStatus(next);
  }

  function setTemplate(templateId: string) {
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;

    setSelectedTemplateId(template.id);
    setSelectedVariantId(template.variants[0]?.id ?? "");
  }

  function updateMedia(layerId: string, file: File | null, kind: "image" | "video") {
    if (!file) {
      setContent((current) => ({
        ...current,
        media: { ...current.media, [layerId]: undefined },
      }));
      return;
    }

    setContent((current) => ({
      ...current,
      media: {
        ...current.media,
        [layerId]: {
          kind,
          src: URL.createObjectURL(file),
          name: file.name,
        },
      },
    }));
  }

  async function exportImage() {
    persistStatus("Gerando JPG...");
    const blob = await stageRef.current?.exportJpg();
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    download(url, `${selectedTemplate.name}.jpg`);
    persistStatus("JPG pronto.");
  }

  async function exportVideo() {
    persistStatus("Gerando vídeo...");
    const blob = await stageRef.current?.exportVideo(5);
    if (!blob) return;

    const extension = blob.type.includes("mp4") ? "mp4" : "webm";
    const url = URL.createObjectURL(blob);
    download(url, `${selectedTemplate.name}.${extension}`);
    persistStatus(extension === "mp4" ? "MP4 pronto." : "Exportado em WebM.");
  }

  return (
    <section className="studio-grid journalist-grid">
      <aside className="rail">
        <div className="rail-head">
          <div>
            <p className="eyebrow">Jornalista</p>
            <h2>Escolha um tema</h2>
          </div>
          <span className="status-pill">{status}</span>
        </div>

        <div className="theme-grid">
          {TEMPLATE_CATEGORIES.map((theme) => (
            <button
              key={theme.id}
              className={`theme-card ${selectedThemeId === theme.id ? "active" : ""}`}
              onClick={() => setSelectedThemeId(theme.id)}
            >
              <span>{theme.label}</span>
              <strong>{themeCount(allTemplates, theme.id)}</strong>
              <p>{theme.tagline}</p>
            </button>
          ))}
        </div>

        <div className="stack">
          {templates.map((template) => (
            <button
              key={template.id}
              className={`template-card ${template.id === selectedTemplate.id ? "active" : ""}`}
              onClick={() => setTemplate(template.id)}
            >
              <span>{template.categoryId}</span>
              <strong>{template.name}</strong>
              <p>{template.description}</p>
            </button>
          ))}
        </div>
      </aside>

      <section className="canvas-column">
        <div className="canvas-head">
          <div>
            <p className="eyebrow">Montagem</p>
            <h2>{selectedTemplate.name}</h2>
            <p className="canvas-subtitle">
              {selectedTheme.label} · {selectedVariant.aspectRatio}
            </p>
          </div>

          <div className="inline-actions">
            <button className="accent-button" onClick={() => void exportImage()}>
              Exportar JPG
            </button>
            <button className="accent-button" onClick={() => void exportVideo()}>
              Exportar vídeo
            </button>
          </div>
        </div>

        <div className="canvas-shell">
          <StageCanvas ref={stageRef} variant={selectedVariant} content={content} className="studio-canvas" live />
        </div>
      </section>

      <aside className="inspector">
        <div className="inspector-card">
          <div className="rail-head">
            <div>
              <p className="eyebrow">Conteúdo</p>
              <h2>Preencha os campos</h2>
            </div>
          </div>

          <div className="stack compact">
            {textLayers.map((layer) => (
              <label key={layer.id} className="field">
                <span>{layer.name}</span>
                <textarea
                  rows={4}
                  value={content.texts[layer.id] ?? ""}
                  placeholder={layer.textPlaceholder}
                  onChange={(event) =>
                    setContent((current) => ({
                      ...current,
                      texts: { ...current.texts, [layer.id]: event.target.value },
                    }))
                  }
                />
              </label>
            ))}
          </div>

          <div className="stack compact">
            {mediaLayers.map((layer) => (
              <label key={layer.id} className="field">
                <span>{layer.name}</span>
                <input
                  type="file"
                  accept={layer.kind === "video" ? "video/*" : "image/*"}
                  onChange={(event) => updateMedia(layer.id, event.target.files?.[0] ?? null, layer.kind === "video" ? "video" : "image")}
                />
              </label>
            ))}
          </div>
        </div>

        <div className="inspector-card soft">
          <p className="eyebrow">Slots</p>
          <div className="layer-stack">
            {[...selectedVariant.layers]
              .sort((a, b) => a.zIndex - b.zIndex)
              .map((layer) => (
                <div key={layer.id} className="mini-row readonly">
                  <strong>{layer.name}</strong>
                  <span>{layer.kind}</span>
                </div>
              ))}
          </div>
        </div>
      </aside>
    </section>
  );
}

function download(url: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
