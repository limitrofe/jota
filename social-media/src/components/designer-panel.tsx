"use client";

import { useMemo, useState } from "react";
import type { TemplateLayer, TemplateSpec, TemplateVariant } from "@/lib/template-spec";
import { cloneVariant, createLayer, createTemplate, createId } from "@/lib/template-spec";
import { fileToDataUrl, writeJson } from "@/lib/storage";
import { StageCanvas } from "@/components/stage-canvas";

const STORAGE_KEY = "rede-studio.templates";

interface DesignerPanelProps {
  templates: TemplateSpec[];
  setTemplates: (next: TemplateSpec[]) => void;
  selectedTemplateId: string;
  setSelectedTemplateId: (value: string) => void;
  selectedVariantId: string;
  setSelectedVariantId: (value: string) => void;
}

function boundsStyle(layer: TemplateLayer) {
  return {
    left: `${layer.x}%`,
    top: `${layer.y}%`,
    width: `${layer.width}%`,
    height: `${layer.height}%`,
  };
}

function pickFirstVariant(template?: TemplateSpec) {
  return template?.variants[0];
}

export function DesignerPanel({
  templates,
  setTemplates,
  selectedTemplateId,
  setSelectedTemplateId,
  selectedVariantId,
  setSelectedVariantId,
}: DesignerPanelProps) {
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);

  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? templates[0];
  const selectedVariant = selectedTemplate?.variants.find((variant) => variant.id === selectedVariantId) ?? pickFirstVariant(selectedTemplate);

  if (!selectedTemplate || !selectedVariant) {
    return null;
  }

  const activeVariant = selectedVariant;
  const selectedLayer = activeVariant.layers.find((layer) => layer.id === selectedLayerId) ?? activeVariant.layers[0];
  const orderedLayers = [...activeVariant.layers].sort((a, b) => a.zIndex - b.zIndex);
  const emptyContent = useMemo(() => ({ texts: {}, media: {} }), []);

  function updateTemplate(mutator: (template: TemplateSpec) => TemplateSpec) {
    const next = templates.map((template) => {
      if (template.id !== selectedTemplate.id) {
        return template;
      }
      return mutator(template);
    });
    setTemplates(next);
    writeJson(STORAGE_KEY, next);
  }

  function updateVariant(mutator: (variant: TemplateVariant) => TemplateVariant) {
    updateTemplate((template) => ({
      ...template,
      version: template.version + 1,
      updatedAt: new Date().toISOString(),
      variants: template.variants.map((variant) => (variant.id === activeVariant.id ? mutator(variant) : variant)),
    }));
  }

  function setLayerField<K extends keyof TemplateLayer>(key: K, value: TemplateLayer[K]) {
    if (!selectedLayer) {
      return;
    }

    updateVariant((variant) => ({
      ...variant,
      layers: variant.layers.map((layer) => (layer.id === selectedLayer.id ? { ...layer, [key]: value } : layer)),
    }));
  }

  async function addImportedPngLayers(files: FileList | null) {
    if (!files?.length) {
      return;
    }

    const imported: TemplateLayer[] = [];
    for (const [index, file] of Array.from(files).entries()) {
      const dataUrl = await fileToDataUrl(file);
      imported.push({
        ...createLayer("background", index),
        id: createId("layer"),
        name: file.name.replace(/\.[^.]+$/, "") || `Cartela ${index + 1}`,
        kind: "background",
        editable: false,
        locked: false,
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        zIndex: activeVariant.layers.length + index,
        asset: {
          name: file.name,
          dataUrl,
          mimeType: file.type || "image/png",
        },
      });
    }

    updateVariant((variant) => ({
      ...variant,
      layers: [...variant.layers, ...imported],
    }));
    setSelectedLayerId(imported[0]?.id ?? null);
  }

  function addLayer(kind: TemplateLayer["kind"]) {
    updateVariant((variant) => ({
      ...variant,
      layers: [...variant.layers, createLayer(kind, variant.layers.length)],
    }));
  }

  function removeLayer(layerId: string) {
    updateVariant((variant) => ({
      ...variant,
      layers: variant.layers.filter((layer) => layer.id !== layerId),
    }));
    if (selectedLayerId === layerId) {
      setSelectedLayerId(null);
    }
  }

  function moveLayer(layerId: string, direction: "up" | "down") {
    updateVariant((variant) => {
      const layers = [...variant.layers].sort((a, b) => a.zIndex - b.zIndex);
      const index = layers.findIndex((layer) => layer.id === layerId);
      if (index < 0) {
        return variant;
      }

      const swapIndex = direction === "up" ? index + 1 : index - 1;
      if (swapIndex < 0 || swapIndex >= layers.length) {
        return variant;
      }

      const current = layers[index]!;
      layers[index] = layers[swapIndex]!;
      layers[swapIndex] = current;

      return {
        ...variant,
        layers: layers.map((layer, order) => ({ ...layer, zIndex: order })),
      };
    });
  }

  function createTemplateInLibrary() {
    const nextTemplate = createTemplate(`Template ${templates.length + 1}`, "Novo template editorial");
    const next = [nextTemplate, ...templates];
    setTemplates(next);
    writeJson(STORAGE_KEY, next);
    setSelectedTemplateId(nextTemplate.id);
    setSelectedVariantId(nextTemplate.variants[0]!.id);
    setSelectedLayerId(nextTemplate.variants[0]!.layers[0]?.id ?? null);
  }

  function duplicateVariant(aspectRatio: TemplateVariant["aspectRatio"]) {
    const clone = cloneVariant(activeVariant, aspectRatio);
    updateTemplate((template) => ({
      ...template,
      version: template.version + 1,
      updatedAt: new Date().toISOString(),
      variants: [...template.variants, clone],
    }));
    setSelectedVariantId(clone.id);
    setSelectedLayerId(clone.layers[0]?.id ?? null);
  }

  async function replaceSelectedLayerAsset(file: File | null) {
    if (!file || !selectedLayer) {
      return;
    }

    const dataUrl = await fileToDataUrl(file);
    setLayerField("asset", {
      name: file.name,
      dataUrl,
      mimeType: file.type || "image/png",
    });
  }

  return (
    <div className="panel-grid">
      <aside className="sidebar">
        <div className="sidebar-section">
          <div className="section-header">
            <div>
              <p className="eyebrow">Designer</p>
              <h2>Templates e cartelas</h2>
            </div>
            <button className="ghost-button" onClick={createTemplateInLibrary}>
              Novo template
            </button>
          </div>

          <label className="field">
            <span>Template ativo</span>
            <select value={selectedTemplate.id} onChange={(event) => setSelectedTemplateId(event.target.value)}>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Formato</span>
            <select value={activeVariant.id} onChange={(event) => setSelectedVariantId(event.target.value)}>
              {selectedTemplate.variants.map((variant) => (
                <option key={variant.id} value={variant.id}>
                  {variant.name} · {variant.aspectRatio}
                </option>
              ))}
            </select>
          </label>

          <div className="inline-actions">
            <label className="chip-button">
              Importar PNG
              <input
                hidden
                type="file"
                accept="image/png"
                multiple
                onChange={(event) => void addImportedPngLayers(event.target.files)}
              />
            </label>
            <button className="chip-button" onClick={() => addLayer("text")}>
              Texto
            </button>
            <button className="chip-button" onClick={() => addLayer("image")}>
              Imagem
            </button>
            <button className="chip-button" onClick={() => addLayer("video")}>
              Vídeo
            </button>
          </div>

          <div className="inline-actions" style={{ marginTop: 12 }}>
            {(["1:1", "4:5", "9:16", "16:9"] as const).map((ratio) => (
              <button key={ratio} className="chip-button" onClick={() => duplicateVariant(ratio)}>
                Duplicar {ratio}
              </button>
            ))}
          </div>
        </div>

        <div className="sidebar-section">
          <div className="section-header">
            <h3>Camadas</h3>
            <span className="muted">{orderedLayers.length} layers</span>
          </div>
          <div className="layer-list">
            {orderedLayers.map((layer) => (
              <div
                key={layer.id}
                className={`layer-row ${selectedLayer?.id === layer.id ? "active" : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedLayerId(layer.id)}
              >
                <div>
                  <strong>{layer.name}</strong>
                  <p>
                    {layer.kind} · z {layer.zIndex}
                  </p>
                </div>
                <div className="layer-controls">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      moveLayer(layer.id, "up");
                    }}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      moveLayer(layer.id, "down");
                    }}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      removeLayer(layer.id);
                    }}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="sidebar-section">
          <div className="section-header">
            <h3>Publicação</h3>
            <button
              className="ghost-button"
              onClick={() =>
                updateTemplate((template) => ({
                  ...template,
                  version: template.version + 1,
                  updatedAt: new Date().toISOString(),
                }))
              }
            >
              Salvar versão
            </button>
          </div>
          <label className="field">
            <span>Nome</span>
            <input
              value={selectedTemplate.name}
              onChange={(event) =>
                updateTemplate((template) => ({ ...template, name: event.target.value }))
              }
            />
          </label>
          <label className="field">
            <span>Descrição</span>
            <textarea
              rows={4}
              value={selectedTemplate.description}
              onChange={(event) =>
                updateTemplate((template) => ({ ...template, description: event.target.value }))
              }
            />
          </label>
          <div className="muted small">
            O template é salvo localmente no navegador, incluindo as cartelas PNG importadas.
          </div>
        </div>
      </aside>

      <section className="workspace">
        <div className="stage-shell">
          <div className="stage-toolbar">
            <div>
              <p className="eyebrow">Canvas</p>
              <h2>{activeVariant.name}</h2>
            </div>
            <div className="inline-actions">
              <label className="chip-button">
                Novo formato
                <select value="" onChange={(event) => duplicateVariant(event.target.value as TemplateVariant["aspectRatio"])}>
                  <option value="">Duplicar formato</option>
                  {(["1:1", "4:5", "9:16", "16:9"] as const).map((ratio) => (
                    <option key={ratio} value={ratio}>
                      {ratio}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="stage-frame">
            <StageCanvas variant={activeVariant} content={emptyContent} className="stage-canvas" live={false} />
            <div className="editor-overlay" style={{ aspectRatio: `${activeVariant.width} / ${activeVariant.height}` }}>
              {orderedLayers.map((layer) => (
                <button
                  key={layer.id}
                  className={`overlay-layer ${selectedLayer?.id === layer.id ? "selected" : ""} ${layer.kind}`}
                  style={boundsStyle(layer)}
                  onClick={() => setSelectedLayerId(layer.id)}
                  onPointerDown={(event) => {
                    if (layer.locked) {
                      return;
                    }

                    const target = event.currentTarget as HTMLButtonElement;
                    const container = target.parentElement;
                    if (!container) {
                      return;
                    }

                    const startX = event.clientX;
                    const startY = event.clientY;
                    const startBounds = { x: layer.x, y: layer.y };
                    const { width, height } = container.getBoundingClientRect();

                    const onMove = (moveEvent: PointerEvent) => {
                      const dx = ((moveEvent.clientX - startX) / width) * 100;
                      const dy = ((moveEvent.clientY - startY) / height) * 100;
                      updateVariant((variant) => ({
                        ...variant,
                        layers: variant.layers.map((item) =>
                          item.id === layer.id
                            ? {
                                ...item,
                                x: Math.max(0, Math.min(100 - item.width, startBounds.x + dx)),
                                y: Math.max(0, Math.min(100 - item.height, startBounds.y + dy)),
                              }
                            : item,
                        ),
                      }));
                    };

                    const onUp = () => {
                      window.removeEventListener("pointermove", onMove);
                      window.removeEventListener("pointerup", onUp);
                    };

                    window.addEventListener("pointermove", onMove);
                    window.addEventListener("pointerup", onUp);
                  }}
                >
                  <span>{layer.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="properties">
          <div className="sidebar-section">
            <div className="section-header">
              <div>
                <p className="eyebrow">Propriedades</p>
                <h3>{selectedLayer?.name ?? "Selecione uma camada"}</h3>
              </div>
              <label className="ghost-button">
                Trocar asset
                <input
                  hidden
                  type="file"
                  accept="image/*"
                  onChange={(event) => void replaceSelectedLayerAsset(event.target.files?.[0] ?? null)}
                />
              </label>
            </div>

            {selectedLayer ? (
              <div className="property-grid">
                <label className="field">
                  <span>Nome</span>
                  <input value={selectedLayer.name} onChange={(event) => setLayerField("name", event.target.value)} />
                </label>
                <label className="field">
                  <span>Tipo</span>
                  <select
                    value={selectedLayer.kind}
                    onChange={(event) => setLayerField("kind", event.target.value as TemplateLayer["kind"])}
                  >
                    <option value="background">background</option>
                    <option value="shape">shape</option>
                    <option value="text">text</option>
                    <option value="image">image</option>
                    <option value="video">video</option>
                  </select>
                </label>
                <label className="field">
                  <span>X %</span>
                  <input type="number" value={selectedLayer.x} onChange={(event) => setLayerField("x", Number(event.target.value))} />
                </label>
                <label className="field">
                  <span>Y %</span>
                  <input type="number" value={selectedLayer.y} onChange={(event) => setLayerField("y", Number(event.target.value))} />
                </label>
                <label className="field">
                  <span>Largura %</span>
                  <input
                    type="number"
                    value={selectedLayer.width}
                    onChange={(event) => setLayerField("width", Number(event.target.value))}
                  />
                </label>
                <label className="field">
                  <span>Altura %</span>
                  <input
                    type="number"
                    value={selectedLayer.height}
                    onChange={(event) => setLayerField("height", Number(event.target.value))}
                  />
                </label>
                <label className="field">
                  <span>Z-index</span>
                  <input
                    type="number"
                    value={selectedLayer.zIndex}
                    onChange={(event) => setLayerField("zIndex", Number(event.target.value))}
                  />
                </label>
                <label className="field">
                  <span>Entrada</span>
                  <input
                    type="number"
                    min={0}
                    value={selectedLayer.enterAt}
                    onChange={(event) => setLayerField("enterAt", Number(event.target.value))}
                  />
                </label>
                <label className="field">
                  <span>Saída</span>
                  <input
                    type="number"
                    min={0}
                    value={selectedLayer.exitAt}
                    onChange={(event) => setLayerField("exitAt", Number(event.target.value))}
                  />
                </label>
                <label className="field">
                  <span>Transição</span>
                  <select
                    value={selectedLayer.transition}
                    onChange={(event) =>
                      setLayerField("transition", event.target.value as TemplateLayer["transition"])
                    }
                  >
                    <option value="fade">fade</option>
                    <option value="slide-up">slide-up</option>
                    <option value="slide-left">slide-left</option>
                    <option value="none">none</option>
                  </select>
                </label>
                <label className="field">
                  <span>Opacidade</span>
                  <input
                    type="number"
                    step="0.05"
                    min={0}
                    max={1}
                    value={selectedLayer.opacity}
                    onChange={(event) => setLayerField("opacity", Number(event.target.value))}
                  />
                </label>
                <label className="field">
                  <span>Cor</span>
                  <input value={selectedLayer.color} onChange={(event) => setLayerField("color", event.target.value)} />
                </label>
                <label className="field">
                  <span>Fonte</span>
                  <input
                    type="text"
                    value={selectedLayer.fontFamily}
                    onChange={(event) => setLayerField("fontFamily", event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Tamanho</span>
                  <input
                    type="number"
                    value={selectedLayer.fontSize}
                    onChange={(event) => setLayerField("fontSize", Number(event.target.value))}
                  />
                </label>
                <label className="field">
                  <span>Máx linhas</span>
                  <input
                    type="number"
                    value={selectedLayer.maxLines}
                    onChange={(event) => setLayerField("maxLines", Number(event.target.value))}
                  />
                </label>
              </div>
            ) : (
              <div className="muted">Selecione uma camada para editar.</div>
            )}
          </div>

          <div className="sidebar-section">
            <h3>Notas do template</h3>
            <p className="muted">
              Esse layout usa coordenadas percentuais, então o mesmo template pode ser reproduzido em vários formatos sem quebrar a composição.
            </p>
            <p className="muted">
              A cartela PNG entra como layer base; textos e slots de mídia ficam em camadas separadas e versionadas.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
