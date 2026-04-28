"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { StageCanvas, type StageCanvasHandle } from "@/components/stage-canvas";
import {
  createEmptyBundle,
  TEMPLATE_CATEGORIES,
  createEmptyContent,
  defaultTextStyle,
  getLayerContentKey,
  resolveVariantContent,
  type ContentBundle,
  type JournalContent,
  type TemplateCategoryId,
  type TemplateSpec,
  type TextPlacement,
  type TextStyleOverride,
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
  const [editScope, setEditScope] = useState<"all" | "variant">("all");
  const initialVariant = templates[0]?.variants[0] ?? allTemplates[0]?.variants[0];
  const [content, setContent] = useState<JournalContent>(() =>
    initialVariant ? createEmptyContent(initialVariant) : { texts: {}, media: {}, textStyles: {}, variants: {} },
  );

  const selectedTheme = TEMPLATE_CATEGORIES.find((theme) => theme.id === selectedThemeId) ?? TEMPLATE_CATEGORIES[0];
  const selectedTemplate =
    templates.find((template) => template.id === selectedTemplateId) ?? allTemplates.find((template) => template.id === selectedTemplateId) ?? templates[0];
  const activeVariant = selectedTemplate?.variants.find((variant) => variant.id === selectedVariantId) ?? selectedTemplate?.variants[0];

  useEffect(() => {
    const current = selectedTemplate ?? templates[0] ?? allTemplates[0];
    const variant = current?.variants.find((item) => item.id === selectedVariantId) ?? current?.variants[0];
    if (!variant) return;

    setContent((previous) => {
      const base = createEmptyContent(variant);
      const existingVariant = previous.variants[variant.id] ?? createEmptyBundle(variant);
      return {
        texts: { ...base.texts, ...previous.texts },
        media: { ...base.media, ...previous.media },
        textStyles: { ...base.textStyles, ...previous.textStyles },
        variants: {
          ...previous.variants,
          [variant.id]: {
            texts: { ...base.texts, ...existingVariant.texts },
            media: { ...base.media, ...existingVariant.media },
            textStyles: { ...base.textStyles, ...existingVariant.textStyles },
          },
        },
      };
    });
  }, [selectedTemplate?.id, selectedVariantId]);

  useEffect(() => {
    const currentThemeTemplates = allTemplates.filter((template) => template.categoryId === selectedThemeId);
    const preferred = currentThemeTemplates[0] ?? allTemplates[0];
    if (!preferred) return;

    if (currentThemeTemplates.length === 0) {
      setSelectedThemeId(preferred.categoryId);
    }

    if (!currentThemeTemplates.some((template) => template.id === selectedTemplateId)) {
      setSelectedTemplateId(preferred.id);
      setSelectedVariantId(preferred.variants[0]?.id ?? "");
    }
  }, [allTemplates, selectedTemplateId, selectedThemeId, setSelectedThemeId, setSelectedTemplateId, setSelectedVariantId]);

  useEffect(() => {
    const nextTemplate = templates.find((template) => template.id === selectedTemplateId) ?? templates[0];
    if (!nextTemplate) return;

    const nextVariant = nextTemplate.variants.find((variant) => variant.id === selectedVariantId) ?? nextTemplate.variants[0];
    if (nextVariant && nextVariant.id !== selectedVariantId) {
      setSelectedVariantId(nextVariant.id);
    }
  }, [selectedTemplateId, selectedVariantId, setSelectedVariantId, templates]);

  const textLayers = useMemo(
    () => activeVariant?.layers.filter((layer) => layer.kind === "text") ?? [],
    [activeVariant],
  );
  const mediaLayers = useMemo(
    () => activeVariant?.layers.filter((layer) => layer.kind === "image" || layer.kind === "video") ?? [],
    [activeVariant],
  );
  const activeContent = useMemo(
    () => (activeVariant ? resolveVariantContent(content, activeVariant) : { texts: {}, media: {}, textStyles: {} }),
    [activeVariant, content],
  );
  const variantPreviews = useMemo(
    () => selectedTemplate?.variants.map((variant) => ({
      variant,
      content: resolveVariantContent(content, variant),
    })) ?? [],
    [content, selectedTemplate?.variants],
  );

  if (!selectedTemplate || !activeVariant) {
    return null;
  }

  function persistStatus(next: string) {
    setStatus(next);
  }

  function getEditingBundle() {
    if (editScope === "all") {
      return content;
    }

    return content.variants[activeVariant.id] ?? resolveVariantContent(content, activeVariant);
  }

  function updateEditingBundle(mutator: (bundle: ContentBundle) => ContentBundle) {
    if (editScope === "all") {
      setContent((current) => {
        const next = mutator(current);
        return {
          ...current,
          texts: next.texts,
          media: next.media,
          textStyles: next.textStyles,
        };
      });
      return;
    }

    setContent((current) => {
      const currentBundle = current.variants[activeVariant.id] ?? resolveVariantContent(current, activeVariant);
      return {
        ...current,
        variants: {
          ...current.variants,
          [activeVariant.id]: mutator(currentBundle),
        },
      };
    });
  }

  function setTemplate(templateId: string) {
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;

    setSelectedThemeId(template.categoryId);
    setSelectedTemplateId(template.id);
    setSelectedVariantId(template.variants[0]?.id ?? "");
    setEditScope("all");
  }

  function updateMedia(layer: (typeof activeVariant.layers)[number], file: File | null, kind: "image" | "video") {
    const key = getLayerContentKey(layer);

    if (!file) {
      updateEditingBundle((bundle) => ({
        ...bundle,
        media: { ...bundle.media, [key]: undefined },
      }));
      return;
    }

    updateEditingBundle((bundle) => ({
      ...bundle,
      media: {
        ...bundle.media,
        [key]: {
          kind,
          src: URL.createObjectURL(file),
          name: file.name,
        },
      },
    }));
  }

  function updateTextStyle(layer: (typeof activeVariant.layers)[number], mutator: (current: TextStyleOverride) => TextStyleOverride) {
    const key = getLayerContentKey(layer);
    const base = getEditingBundle().textStyles[key] ?? defaultTextStyle(layer);

    updateEditingBundle((bundle) => ({
      ...bundle,
      textStyles: {
        ...bundle.textStyles,
        [key]: mutator(base),
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

  const editingBundle = getEditingBundle();

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
              {selectedTheme.label} · {activeVariant.aspectRatio}
            </p>
          </div>

          <div className="inline-actions wrap">
            <div className="scope-switch">
              <button
                type="button"
                className={`toggle-chip ${editScope === "all" ? "active" : ""}`}
                onClick={() => setEditScope("all")}
              >
                Todos os formatos
              </button>
              <button
                type="button"
                className={`toggle-chip ${editScope === "variant" ? "active" : ""}`}
                onClick={() => setEditScope("variant")}
              >
                Formato ativo
              </button>
            </div>
            <button className="accent-button" onClick={() => void exportImage()}>
              Exportar JPG
            </button>
            <button className="accent-button" onClick={() => void exportVideo()}>
              Exportar vídeo
            </button>
          </div>
        </div>

        <div className="canvas-shell">
          <StageCanvas ref={stageRef} variant={activeVariant} content={activeContent} className="studio-canvas" live />
        </div>

        <div className="variant-strip">
          {variantPreviews.map(({ variant, content: previewContent }) => (
            <button
              key={variant.id}
              type="button"
              className={`variant-preview-card ${variant.id === activeVariant.id ? "active" : ""}`}
              onClick={() => setSelectedVariantId(variant.id)}
            >
              <div className="variant-preview-canvas-shell">
                <StageCanvas variant={variant} content={previewContent} className="variant-preview-canvas" live={false} />
              </div>
              <div className="variant-preview-meta">
                <strong>{variant.aspectRatio}</strong>
                <span>{variant.width} × {variant.height}</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <aside className="inspector">
        <div className="inspector-card">
          <div className="rail-head">
            <div>
              <p className="eyebrow">Conteúdo</p>
              <h2>{editScope === "all" ? "Preencha a base" : `Ajuste ${activeVariant.aspectRatio}`}</h2>
            </div>
          </div>

          <p className="subtle-note compact">
            {editScope === "all"
              ? "O que você digita aqui vai para todos os formatos."
              : "O que você digita aqui vale só para o formato ativo."}
          </p>

          <div className="stack compact">
            {textLayers.map((layer) => (
              <div key={layer.id} className="text-editor-card">
                <label className="field">
                  <span>{layer.name}</span>
                  <textarea
                    rows={4}
                    value={editingBundle.texts[getLayerContentKey(layer)] ?? ""}
                    placeholder={layer.textPlaceholder}
                    onChange={(event) =>
                      updateEditingBundle((bundle) => ({
                        ...bundle,
                        texts: { ...bundle.texts, [getLayerContentKey(layer)]: event.target.value },
                      }))
                    }
                  />
                </label>

                {(() => {
                  const key = getLayerContentKey(layer);
                  const style = editingBundle.textStyles[key] ?? defaultTextStyle(layer);
                  return (
                    <div className="text-style-grid">
                      <label className="field">
                        <span>Cor</span>
                        <input
                          type="color"
                          value={style.color}
                          onChange={(event) =>
                            updateTextStyle(layer, (current) => ({
                              ...current,
                              color: event.target.value,
                            }))
                          }
                        />
                      </label>

                      <label className="field">
                        <span>Posição</span>
                        <select
                          value={style.placement}
                          onChange={(event) =>
                            updateTextStyle(layer, (current) => ({
                              ...current,
                              placement: event.target.value as TextPlacement,
                            }))
                          }
                        >
                          <option value="template">Padrão</option>
                          <option value="top">Topo</option>
                          <option value="middle">Meio</option>
                          <option value="bottom">Base</option>
                        </select>
                      </label>

                      <label className="field field-inline">
                        <span>Tarja</span>
                        <button
                          type="button"
                          className={`toggle-chip ${style.backgroundEnabled ? "active" : ""}`}
                          onClick={() =>
                            updateTextStyle(layer, (current) => ({
                              ...current,
                              backgroundEnabled: !current.backgroundEnabled,
                            }))
                          }
                        >
                          {style.backgroundEnabled ? "Ligada" : "Desligada"}
                        </button>
                      </label>

                      <label className="field">
                        <span>Tarja cor</span>
                        <input
                          type="color"
                          value={style.backgroundColor}
                          onChange={(event) =>
                            updateTextStyle(layer, (current) => ({
                              ...current,
                              backgroundColor: event.target.value,
                            }))
                          }
                        />
                      </label>

                      <label className="field">
                        <span>Opacidade</span>
                        <input
                          type="range"
                          min="0.15"
                          max="0.9"
                          step="0.01"
                          value={style.backgroundOpacity}
                          onChange={(event) =>
                            updateTextStyle(layer, (current) => ({
                              ...current,
                              backgroundOpacity: Number(event.target.value),
                            }))
                          }
                        />
                      </label>
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>

          <div className="stack compact">
            {mediaLayers.map((layer) => (
              <label key={layer.id} className="field">
                <span>{layer.name}</span>
                <input
                  type="file"
                  accept={layer.kind === "video" ? "video/*" : "image/*"}
                  onChange={(event) => updateMedia(layer, event.target.files?.[0] ?? null, layer.kind === "video" ? "video" : "image")}
                />
              </label>
            ))}
          </div>
        </div>

        <div className="inspector-card soft">
          <p className="eyebrow">Slots</p>
          <div className="layer-stack">
            {[...activeVariant.layers]
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
