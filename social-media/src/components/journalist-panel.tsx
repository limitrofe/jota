"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { zipSync, strToU8 } from "fflate";
import { StageCanvas, type StageCanvasHandle } from "@/components/stage-canvas";
import { renderTemplateFrame } from "@/lib/render-canvas";
import {
  createEmptyBundle,
  TEMPLATE_CATEGORIES,
  createEmptyContent,
  defaultTextStyle,
  getLayerContentKey,
  resolveVariantContent,
  type ContentBundle,
  type JournalContent,
  type MediaPosition,
  type TemplateCategoryId,
  type TemplateSpec,
  type TextPlacement,
  type TextStyleOverride,
} from "@/lib/template-spec";
import { revokeIfObjectUrl } from "@/lib/storage";

interface JournalistPanelProps {
  templates: TemplateSpec[];
  allTemplates: TemplateSpec[];
  selectedThemeId: TemplateCategoryId | null;
  setSelectedThemeId: (value: TemplateCategoryId | null) => void;
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
  const [selectedMediaLayerId, setSelectedMediaLayerId] = useState<string | null>(null);
  const [dropTargetLayerId, setDropTargetLayerId] = useState<string | null>(null);
  const [isDraggingMedia, setIsDraggingMedia] = useState(false);
  const mediaDropDepth = useRef(0);
  const initialVariant = templates[0]?.variants[0] ?? allTemplates[0]?.variants[0];
  const [content, setContent] = useState<JournalContent>(() =>
    initialVariant ? createEmptyContent(initialVariant) : { texts: {}, media: {}, textStyles: {}, variants: {} },
  );

  const selectedTheme = selectedThemeId ? TEMPLATE_CATEGORIES.find((theme) => theme.id === selectedThemeId) ?? null : null;
  const themeTemplates = useMemo(
    () => (selectedThemeId ? templates.filter((template) => template.categoryId === selectedThemeId) : []),
    [selectedThemeId, templates],
  );
  const selectedTemplate =
    themeTemplates.find((template) => template.id === selectedTemplateId) ??
    allTemplates.find((template) => template.id === selectedTemplateId) ??
    themeTemplates[0] ??
    allTemplates[0];
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
    if (selectedThemeId == null) {
      return;
    }

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
  const selectedMediaLayer = mediaLayers.find((layer) => layer.id === selectedMediaLayerId) ?? mediaLayers[0];
  const dropTargetLayer = mediaLayers.find((layer) => layer.id === dropTargetLayerId) ?? selectedMediaLayer ?? mediaLayers[0];
  useEffect(() => {
    if (!mediaLayers.length) {
      setSelectedMediaLayerId(null);
      setDropTargetLayerId(null);
      return;
    }

    if (!selectedMediaLayerId || !mediaLayers.some((layer) => layer.id === selectedMediaLayerId)) {
      setSelectedMediaLayerId(mediaLayers[0]?.id ?? null);
    }

    if (!dropTargetLayerId || !mediaLayers.some((layer) => layer.id === dropTargetLayerId)) {
      setDropTargetLayerId(mediaLayers[0]?.id ?? null);
    }
  }, [dropTargetLayerId, mediaLayers, selectedMediaLayerId]);
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

  function openTheme(themeId: TemplateCategoryId) {
    const filtered = templates.filter((template) => template.categoryId === themeId);
    const preferred = filtered[0] ?? allTemplates.find((template) => template.categoryId === themeId) ?? allTemplates[0];
    if (!preferred) return;

    setSelectedThemeId(themeId);
    setSelectedTemplateId(preferred.id);
    setSelectedVariantId(preferred.variants[0]?.id ?? "");
    setEditScope("all");
  }

  function backToThemes() {
    setSelectedThemeId(null);
    setEditScope("all");
  }

  function updateMedia(layer: (typeof activeVariant.layers)[number], file: File | null, kind: "image" | "video") {
    const key = getLayerContentKey(layer);
    const current = getEditingBundle().media[key];

    if (!file) {
      revokeIfObjectUrl(current?.src);
      updateEditingBundle((bundle) => ({
        ...bundle,
        media: { ...bundle.media, [key]: undefined },
      }));
      return;
    }

    revokeIfObjectUrl(current?.src);

    updateEditingBundle((bundle) => ({
      ...bundle,
      media: {
        ...bundle.media,
        [key]: {
          kind,
          src: URL.createObjectURL(file),
          name: file.name,
          position: current?.position ?? "center",
          scale: Math.max(1, current?.scale ?? 1),
        },
      },
    }));
  }

  function setMediaPosition(layer: (typeof activeVariant.layers)[number], position: MediaPosition) {
    const key = getLayerContentKey(layer);
    const current = getEditingBundle().media[key];
    if (!current) return;

    updateEditingBundle((bundle) => ({
      ...bundle,
      media: {
        ...bundle.media,
        [key]: {
          ...current,
          position,
        },
      },
    }));
  }

  function handleMediaDrop(layer: (typeof activeVariant.layers)[number], files: FileList | null) {
    if (!files?.length) return;

    const file = files[0]!;
    const kind = file.type.startsWith("video/") ? "video" : "image";
    updateMedia(layer, file, kind);
  }

  function resolveMediaSlot(layer: (typeof activeVariant.layers)[number]) {
    const key = getLayerContentKey(layer);
    const current = getEditingBundle().media[key];
    const source = current?.src ?? layer.asset?.dataUrl ?? "";

    return {
      current,
      source,
      kind: current?.kind ?? layer.kind,
      label: current?.name ?? layer.name,
      hasSource: Boolean(source),
    };
  }

  function handleMediaDragEnter(layerId?: string) {
    mediaDropDepth.current += 1;
    setIsDraggingMedia(true);
    if (layerId) {
      setDropTargetLayerId(layerId);
    }
  }

  function handleMediaDragLeave(event: { currentTarget: HTMLElement; relatedTarget: EventTarget | null }) {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) {
      return;
    }

    mediaDropDepth.current = Math.max(0, mediaDropDepth.current - 1);
    if (mediaDropDepth.current === 0) {
      clearMediaDragState();
    }
  }

  function handleMediaDragOver(event: { preventDefault(): void; dataTransfer: DataTransfer }) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDraggingMedia(true);
  }

  function clearMediaDragState() {
    mediaDropDepth.current = 0;
    setIsDraggingMedia(false);
    setDropTargetLayerId(null);
  }

  function updateMediaStyle(
    layer: (typeof activeVariant.layers)[number],
    mutator: (current: NonNullable<ContentBundle["media"][string]>) => NonNullable<ContentBundle["media"][string]>,
  ) {
    const key = getLayerContentKey(layer);
    const current = getEditingBundle().media[key];
    if (!current) return;

    updateEditingBundle((bundle) => ({
      ...bundle,
      media: {
        ...bundle.media,
        [key]: mutator(current),
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

  async function exportAllImages() {
    persistStatus("Gerando ZIP...");
    const mediaCache = new Map<string, HTMLImageElement | HTMLVideoElement>();
    const files: Record<string, Uint8Array> = {};
    const folderName = slugifyFilename(selectedTemplate.name);

    for (const variant of selectedTemplate.variants) {
      const canvas = document.createElement("canvas");
      canvas.width = variant.width;
      canvas.height = variant.height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        continue;
      }

      const variantContent = resolveVariantContent(content, variant);
      await renderTemplateFrame(ctx, variant, variantContent, mediaCache);
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((result) => resolve(result), "image/jpeg", 0.95);
      });

      if (!blob) {
        continue;
      }

      files[`${folderName}/${variant.aspectRatio}.jpg`] = new Uint8Array(await blob.arrayBuffer());
    }

    if (!Object.keys(files).length) {
      persistStatus("Nada para exportar.");
      return;
    }

    files[`${folderName}/manifest.txt`] = strToU8(
      `Template: ${selectedTemplate.name}\nCategoria: ${selectedTheme?.label ?? "Tema"}\nFormatos: ${selectedTemplate.variants.length}`,
    );

    const zipData = zipSync(files, { level: 6 });
    const zipBlob = new Blob(
      [zipData.buffer.slice(zipData.byteOffset, zipData.byteOffset + zipData.byteLength) as ArrayBuffer],
      { type: "application/zip" },
    );
    const url = URL.createObjectURL(zipBlob);
    download(url, `${folderName}.zip`);
    persistStatus("ZIP pronto.");
  }

  const editingBundle = getEditingBundle();
  if (selectedThemeId == null) {
    return (
      <section className="journalist-theme-screen">
        <div className="journalist-theme-hero">
          <div>
            <p className="eyebrow">Jornalista</p>
            <h2>Escolha um tema para montar o post</h2>
          </div>
          <div className="theme-hero-copy">
            <p className="subtle-note">
              Primeiro selecione um tema. Depois você entra na montagem só daquele conjunto de templates, sem ruído na lateral.
            </p>
            <span className="role-pill">Seleção inicial</span>
          </div>
        </div>

        <div className="theme-grid theme-grid-large">
          {TEMPLATE_CATEGORIES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              className="theme-card theme-card-large"
              onClick={() => openTheme(theme.id)}
            >
              <span>{theme.id === selectedThemeId ? "Tema ativo" : "Tema"}</span>
              <strong>{theme.label}</strong>
              <p>{theme.tagline}</p>
              <div className="theme-card-meta">
                <strong>{themeCount(allTemplates, theme.id)}</strong>
                <span>templates</span>
              </div>
            </button>
          ))}
        </div>
      </section>
    );
  }

  const displayedTemplates = themeTemplates.length ? themeTemplates : allTemplates.filter((template) => template.categoryId === selectedThemeId);

  return (
    <section className="studio-grid journalist-grid">
      <aside className="rail journalist-rail">
        <div className="rail-head">
          <div>
            <p className="eyebrow">Jornalista</p>
            <h2>{selectedTheme?.label ?? "Tema"}</h2>
          </div>
          <div className="topbar-actions">
            <span className="role-pill">{displayedTemplates.length} templates</span>
            <button className="ghost-button" onClick={backToThemes}>
              Trocar tema
            </button>
          </div>
        </div>

        <div className="stack">
          {displayedTemplates.map((template) => (
            <button
              key={template.id}
              type="button"
              className={`template-card ${template.id === selectedTemplate.id ? "active" : ""}`}
              onClick={() => setTemplate(template.id)}
            >
              <span>{selectedTheme?.label ?? "Tema"}</span>
              <strong>{template.name}</strong>
              <p>{template.description}</p>
              <div className="template-card-meta">
                <span>{template.variants.length} formatos</span>
                <span>Editar agora</span>
              </div>
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
              {selectedTheme?.label ?? "Tema"} · {displayedTemplates.length} templates · {activeVariant.aspectRatio}
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
            <span className="status-pill">{status}</span>
            <button className="accent-button" onClick={() => void exportImage()}>
              Exportar JPG
            </button>
            <button className="accent-button" onClick={() => void exportVideo()}>
              Exportar vídeo
            </button>
            <button className="accent-button" onClick={() => void exportAllImages()}>
              Exportar ZIP
            </button>
          </div>
        </div>

        <div
          className={`canvas-shell drop-target ${selectedMediaLayer ? "has-media-target" : ""} ${isDraggingMedia ? "dragging" : ""}`}
          onDragEnter={() => handleMediaDragEnter(selectedMediaLayer?.id ?? mediaLayers[0]?.id)}
          onDragOver={handleMediaDragOver}
          onDragLeave={handleMediaDragLeave}
          onDrop={(event) => {
            event.preventDefault();
            clearMediaDragState();
            const targetLayer = dropTargetLayer ?? selectedMediaLayer ?? mediaLayers[0];
            if (!targetLayer) return;
            handleMediaDrop(targetLayer, event.dataTransfer.files);
            setSelectedMediaLayerId(targetLayer.id);
          }}
        >
          {mediaLayers.length ? (
            <div className="media-slot-strip">
              {mediaLayers.map((layer) => {
                const slot = resolveMediaSlot(layer);
                const isActive = layer.id === (dropTargetLayer?.id ?? selectedMediaLayer?.id);
                return (
                  <button
                    key={layer.id}
                    type="button"
                    className={`media-slot-chip ${isActive ? "active" : ""} ${slot.hasSource ? "filled" : "empty"}`}
                    onClick={() => setSelectedMediaLayerId(layer.id)}
                    onDragEnter={() => handleMediaDragEnter(layer.id)}
                    onDragOver={handleMediaDragOver}
                    onDragLeave={handleMediaDragLeave}
                    onDrop={(event) => {
                      event.preventDefault();
                      clearMediaDragState();
                      handleMediaDrop(layer, event.dataTransfer.files);
                      setSelectedMediaLayerId(layer.id);
                      setDropTargetLayerId(layer.id);
                    }}
                  >
                    <div className="media-slot-thumb">
                      {slot.hasSource ? (
                        slot.kind === "video" ? (
                          <video src={slot.source} muted playsInline autoPlay loop />
                        ) : (
                          <img src={slot.source} alt="" />
                        )
                      ) : (
                        <span>Solte aqui</span>
                      )}
                    </div>
                    <div className="media-slot-meta">
                      <strong>{layer.name}</strong>
                      <span>{slot.hasSource ? `${slot.kind === "video" ? "vídeo" : "imagem"}` : "vazio"}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}

          <StageCanvas ref={stageRef} variant={activeVariant} content={activeContent} className="studio-canvas" live />
          <div className={`canvas-drop-hint ${isDraggingMedia ? "visible" : ""}`}>
            <strong>{dropTargetLayer ? `Arraste a mídia para ${dropTargetLayer.name}` : "Sem slot de mídia"}</strong>
            <span>ou solte um arquivo aqui para preencher o fundo do post</span>
          </div>
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
                <span>
                  {variant.width} × {variant.height}
                </span>
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
            {textLayers.map((layer) => {
              const key = getLayerContentKey(layer);
              const style = editingBundle.textStyles[key] ?? defaultTextStyle(layer);

              return (
                <div key={layer.id} className="text-editor-card">
                  <label className="field">
                    <span>
                      {layer.name} · até 4 linhas
                    </span>
                    <textarea
                      rows={4}
                      value={editingBundle.texts[key] ?? ""}
                      placeholder={layer.textPlaceholder}
                      onChange={(event) =>
                        updateEditingBundle((bundle) => ({
                          ...bundle,
                          texts: { ...bundle.texts, [key]: event.target.value },
                        }))
                      }
                    />
                  </label>

                  <div className="text-style-grid">
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
                        <option value="top-left">Topo esquerda</option>
                        <option value="bottom-left">Base esquerda</option>
                        <option value="top-right">Topo direita</option>
                        <option value="bottom-right">Base direita</option>
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
                  </div>
                </div>
              );
            })}
          </div>

          <div className="stack compact">
            {mediaLayers.map((layer) => {
              const slot = resolveMediaSlot(layer);

              return (
                <div
                  key={layer.id}
                  className={`text-editor-card media-editor-card ${selectedMediaLayerId === layer.id ? "active" : ""} ${isDraggingMedia ? "dragging" : ""}`}
                  onClick={() => setSelectedMediaLayerId(layer.id)}
                  onDragEnter={() => handleMediaDragEnter(layer.id)}
                  onDragOver={handleMediaDragOver}
                  onDragLeave={handleMediaDragLeave}
                  onDrop={(event) => {
                    event.preventDefault();
                    clearMediaDragState();
                    handleMediaDrop(layer, event.dataTransfer.files);
                    setSelectedMediaLayerId(layer.id);
                    setDropTargetLayerId(layer.id);
                  }}
                >
                  <div className={`media-preview ${slot.hasSource ? "filled" : "empty"}`}>
                    {slot.hasSource ? (
                      slot.kind === "video" ? (
                        <video src={slot.source} muted playsInline autoPlay loop />
                      ) : (
                        <img src={slot.source} alt="" />
                      )
                    ) : (
                      <div className="media-preview-placeholder">
                        <strong>{layer.kind === "video" ? "Vídeo" : "Imagem"}</strong>
                        <span>Arraste um arquivo ou clique para escolher</span>
                      </div>
                    )}
                  </div>

                  <label className="field">
                    <span>{layer.name}</span>
                    <input
                      type="file"
                      accept={layer.kind === "video" ? "video/*" : "image/*"}
                      onChange={(event) =>
                        updateMedia(layer, event.target.files?.[0] ?? null, layer.kind === "video" ? "video" : "image")
                      }
                    />
                  </label>

                  <div className="media-style-grid">
                    <label className="field">
                      <span>Posição</span>
                      <select
                        value={slot.current?.position ?? "center"}
                        onChange={(event) =>
                          setMediaPosition(layer, event.target.value as MediaPosition)
                        }
                      >
                        <option value="top">Topo</option>
                        <option value="bottom">Base</option>
                        <option value="left">Esquerda</option>
                        <option value="right">Direita</option>
                        <option value="center">Centro</option>
                      </select>
                    </label>

                    <label className="field">
                      <span>Tamanho</span>
                      <input
                        type="range"
                        min="1"
                        max="2.5"
                        step="0.01"
                        value={slot.current?.scale ?? 1}
                        onChange={(event) =>
                          updateMediaStyle(layer, (current) => ({
                            ...current,
                            scale: Math.max(1, Number(event.target.value)),
                          }))
                        }
                      />
                    </label>

                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() =>
                        updateMediaStyle(layer, (current) => ({
                          ...current,
                          position: "center",
                          scale: 1,
                        }))
                      }
                    >
                      Resetar mídia
                    </button>
                  </div>

                  <p className="subtle-note compact">
                    A mídia ocupa o fundo inteiro do canva e você só ajusta enquadramento e escala.
                  </p>
                </div>
              );
            })}
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

function slugifyFilename(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "template";
}
