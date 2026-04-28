"use client";

import { useState } from "react";
import { StageCanvas } from "@/components/stage-canvas";
import {
  TEMPLATE_CATEGORIES,
  cloneVariant,
  createId,
  createLayer,
  createTemplate,
  ensureStandardVariants,
  type TemplateLayer,
  type TemplateSpec,
  type TemplateVariant,
} from "@/lib/template-spec";
import { fileToDataUrl, writeJson } from "@/lib/storage";

const STORAGE_KEY = "rede-studio.templates";

interface DesignerPanelProps {
  templates: TemplateSpec[];
  setTemplates: (next: TemplateSpec[]) => void;
  selectedTemplateId: string;
  setSelectedTemplateId: (value: string) => void;
  selectedVariantId: string;
  setSelectedVariantId: (value: string) => void;
}

function categoryLabel(categoryId: TemplateSpec["categoryId"]) {
  return TEMPLATE_CATEGORIES.find((category) => category.id === categoryId)?.label ?? "Tema";
}

function categoryTag(categoryId: TemplateSpec["categoryId"]) {
  return TEMPLATE_CATEGORIES.find((category) => category.id === categoryId)?.tagline ?? "";
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
  const selectedVariant = selectedTemplate?.variants.find((variant) => variant.id === selectedVariantId) ?? selectedTemplate?.variants[0];

  if (!selectedTemplate || !selectedVariant) {
    return null;
  }

  const selectedLayer = selectedVariant.layers.find((layer) => layer.id === selectedLayerId) ?? selectedVariant.layers[0];
  const orderedLayers = [...selectedVariant.layers].sort((a, b) => a.zIndex - b.zIndex);
  const blankContent = { texts: {}, media: {}, textStyles: {} };

  function persist(next: TemplateSpec[]) {
    setTemplates(next);
    writeJson(STORAGE_KEY, next);
  }

  function updateTemplate(mutator: (template: TemplateSpec) => TemplateSpec) {
    persist(
      templates.map((template) => (template.id === selectedTemplate.id ? mutator(template) : template)),
    );
  }

  function updateVariant(mutator: (variant: TemplateVariant) => TemplateVariant) {
    updateTemplate((template) => ({
      ...template,
      version: template.version + 1,
      updatedAt: new Date().toISOString(),
      variants: template.variants.map((variant) => (variant.id === selectedVariant.id ? mutator(variant) : variant)),
    }));
  }

  function updateLayer<K extends keyof TemplateLayer>(key: K, value: TemplateLayer[K]) {
    if (!selectedLayer) return;

    updateVariant((variant) => ({
      ...variant,
      layers: variant.layers.map((layer) => (layer.id === selectedLayer.id ? { ...layer, [key]: value } : layer)),
    }));
  }

  function selectTemplate(templateId: string) {
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;

    setSelectedTemplateId(template.id);
    setSelectedVariantId(template.variants[0]?.id ?? "");
    setSelectedLayerId(template.variants[0]?.layers[0]?.id ?? null);
  }

  function selectVariant(variantId: string) {
    setSelectedVariantId(variantId);
    const variant = selectedTemplate.variants.find((item) => item.id === variantId);
    setSelectedLayerId(variant?.layers[0]?.id ?? null);
  }

  async function importPng(files: FileList | null) {
    if (!files?.length) return;

    const imported = await Promise.all(
      Array.from(files).map(async (file, index) => {
        const dataUrl = await fileToDataUrl(file);
        return {
          ...createLayer("background", index),
          id: createId("layer"),
          name: file.name.replace(/\.[^.]+$/, "") || `Cartela ${index + 1}`,
          kind: "background" as const,
          editable: false,
          locked: false,
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          zIndex: -1000 + index,
          asset: {
            name: file.name,
            dataUrl,
            mimeType: file.type || "image/png",
          },
        };
      }),
    );

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

  function duplicateVariant(aspectRatio: TemplateVariant["aspectRatio"]) {
    const clone = cloneVariant(selectedVariant, aspectRatio);
    updateTemplate((template) => ({
      ...template,
      version: template.version + 1,
      updatedAt: new Date().toISOString(),
      variants: [...template.variants, clone],
    }));
    setSelectedVariantId(clone.id);
    setSelectedLayerId(clone.layers[0]?.id ?? null);
  }

  function createNewTemplate() {
    const created = ensureStandardVariants(createTemplate(
      `${categoryLabel(selectedTemplate.categoryId)} ${templates.length + 1}`,
      categoryTag(selectedTemplate.categoryId),
      "16:9",
      selectedTemplate.categoryId,
    ));

    const next = [created, ...templates];
    persist(next);
    setSelectedTemplateId(created.id);
    setSelectedVariantId(created.variants[0]!.id);
    setSelectedLayerId(created.variants[0]!.layers[0]?.id ?? null);
  }

  const aspectChoices: TemplateVariant["aspectRatio"][] = ["1:1", "4:5", "9:16", "16:9"];

  return (
    <section className="studio-grid designer-grid">
      <aside className="rail">
        <div className="rail-head">
          <div>
            <p className="eyebrow">Designer</p>
            <h2>Biblioteca</h2>
          </div>
          <button className="ghost-button" onClick={createNewTemplate}>
            Novo template
          </button>
        </div>

        <div className="stack">
          {templates.map((template) => (
            <button
              key={template.id}
              className={`template-card ${template.id === selectedTemplate.id ? "active" : ""}`}
              onClick={() => selectTemplate(template.id)}
            >
              <span>{categoryLabel(template.categoryId)}</span>
              <strong>{template.name}</strong>
              <p>{template.description}</p>
            </button>
          ))}
        </div>

        <div className="quick-actions">
          <label className="ghost-button">
            Importar PNG
            <input hidden type="file" accept="image/png" multiple onChange={(event) => void importPng(event.target.files)} />
          </label>
          <button className="ghost-button" onClick={() => addLayer("text")}>
            Texto
          </button>
          <button className="ghost-button" onClick={() => addLayer("image")}>
            Imagem
          </button>
          <button className="ghost-button" onClick={() => addLayer("video")}>
            Vídeo
          </button>
        </div>
      </aside>

      <section className="canvas-column">
        <div className="canvas-head">
          <div>
            <p className="eyebrow">Template ativo</p>
            <h2>{selectedTemplate.name}</h2>
            <p className="canvas-subtitle">{selectedVariant.name} · {selectedTemplate.categoryId}</p>
          </div>

          <div className="inline-actions">
            <select className="compact-select" value={selectedVariant.id} onChange={(event) => selectVariant(event.target.value)}>
              {selectedTemplate.variants.map((variant) => (
                <option key={variant.id} value={variant.id}>
                  {variant.name} · {variant.aspectRatio}
                </option>
              ))}
            </select>

            <select
              className="compact-select"
              value=""
              onChange={(event) => {
                const ratio = event.target.value as TemplateVariant["aspectRatio"];
                if (ratio) {
                  duplicateVariant(ratio);
                }
              }}
            >
              <option value="">Duplicar formato</option>
              {aspectChoices.map((ratio) => (
                <option key={ratio} value={ratio}>
                  {ratio}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="canvas-shell">
          <StageCanvas variant={selectedVariant} content={blankContent} className="studio-canvas" live={false} />
          <div className="canvas-overlay" style={{ aspectRatio: `${selectedVariant.width} / ${selectedVariant.height}` }}>
            {orderedLayers.map((layer) => (
              <button
                key={layer.id}
                className={`layer-hitbox ${selectedLayer?.id === layer.id ? "selected" : ""} ${layer.kind}`}
                style={{
                  left: `${layer.x}%`,
                  top: `${layer.y}%`,
                  width: `${layer.width}%`,
                  height: `${layer.height}%`,
                  zIndex: layer.zIndex + 1,
                }}
                onClick={() => setSelectedLayerId(layer.id)}
                onPointerDown={(event) => {
                  if (layer.locked) return;
                  const parent = event.currentTarget.parentElement;
                  if (!parent) return;

                  const startX = event.clientX;
                  const startY = event.clientY;
                  const start = { x: layer.x, y: layer.y };
                  const { width, height } = parent.getBoundingClientRect();

                  const move = (moveEvent: PointerEvent) => {
                    const dx = ((moveEvent.clientX - startX) / width) * 100;
                    const dy = ((moveEvent.clientY - startY) / height) * 100;
                    updateVariant((variant) => ({
                      ...variant,
                      layers: variant.layers.map((item) =>
                        item.id === layer.id
                          ? {
                              ...item,
                              x: Math.max(0, Math.min(100 - item.width, start.x + dx)),
                              y: Math.max(0, Math.min(100 - item.height, start.y + dy)),
                            }
                          : item,
                      ),
                    }));
                  };

                  const stop = () => {
                    window.removeEventListener("pointermove", move);
                    window.removeEventListener("pointerup", stop);
                  };

                  window.addEventListener("pointermove", move);
                  window.addEventListener("pointerup", stop);
                }}
              >
                <span>{layer.name}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <aside className="inspector">
        <div className="inspector-card">
          <div className="rail-head">
            <div>
              <p className="eyebrow">Inspector</p>
              <h2>{selectedLayer?.name ?? "Camada"}</h2>
            </div>
          </div>

          {selectedLayer ? (
            <>
              <div className="field-grid">
                <label className="field">
                  <span>Nome</span>
                  <input value={selectedLayer.name} onChange={(event) => updateLayer("name", event.target.value)} />
                </label>
                <label className="field">
                  <span>Tipo</span>
                  <select value={selectedLayer.kind} onChange={(event) => updateLayer("kind", event.target.value as TemplateLayer["kind"])}>
                    <option value="background">background</option>
                    <option value="shape">shape</option>
                    <option value="text">text</option>
                    <option value="image">image</option>
                    <option value="video">video</option>
                  </select>
                </label>
                <label className="field">
                  <span>X</span>
                  <input type="number" value={selectedLayer.x} onChange={(event) => updateLayer("x", Number(event.target.value))} />
                </label>
                <label className="field">
                  <span>Y</span>
                  <input type="number" value={selectedLayer.y} onChange={(event) => updateLayer("y", Number(event.target.value))} />
                </label>
                <label className="field">
                  <span>Largura</span>
                  <input type="number" value={selectedLayer.width} onChange={(event) => updateLayer("width", Number(event.target.value))} />
                </label>
                <label className="field">
                  <span>Altura</span>
                  <input type="number" value={selectedLayer.height} onChange={(event) => updateLayer("height", Number(event.target.value))} />
                </label>
                <label className="field">
                  <span>Z</span>
                  <input type="number" value={selectedLayer.zIndex} onChange={(event) => updateLayer("zIndex", Number(event.target.value))} />
                </label>
                <label className="field">
                  <span>Enter</span>
                  <input type="number" value={selectedLayer.enterAt} onChange={(event) => updateLayer("enterAt", Number(event.target.value))} />
                </label>
                <label className="field">
                  <span>Exit</span>
                  <input type="number" value={selectedLayer.exitAt} onChange={(event) => updateLayer("exitAt", Number(event.target.value))} />
                </label>
                <label className="field">
                  <span>Transição</span>
                  <select value={selectedLayer.transition} onChange={(event) => updateLayer("transition", event.target.value as TemplateLayer["transition"])}>
                    <option value="fade">fade</option>
                    <option value="slide-up">slide-up</option>
                    <option value="slide-left">slide-left</option>
                    <option value="none">none</option>
                  </select>
                </label>
                {selectedLayer.kind === "text" ? (
                  <>
                    <label className="field">
                      <span>Fonte</span>
                      <input value={selectedLayer.fontFamily} onChange={(event) => updateLayer("fontFamily", event.target.value)} />
                    </label>
                    <label className="field">
                      <span>Tamanho</span>
                      <input type="number" value={selectedLayer.fontSize} onChange={(event) => updateLayer("fontSize", Number(event.target.value))} />
                    </label>
                    <label className="field">
                      <span>Cor</span>
                      <input value={selectedLayer.color} onChange={(event) => updateLayer("color", event.target.value)} />
                    </label>
                    <label className="field">
                      <span>Máx linhas</span>
                      <input type="number" value={selectedLayer.maxLines} onChange={(event) => updateLayer("maxLines", Number(event.target.value))} />
                    </label>
                  </>
                ) : null}

                {selectedLayer.kind === "image" || selectedLayer.kind === "video" || selectedLayer.kind === "background" ? (
                  <label className="field">
                    <span>Fit</span>
                    <select value={selectedLayer.mediaFit} onChange={(event) => updateLayer("mediaFit", event.target.value as TemplateLayer["mediaFit"])}>
                      <option value="cover">cover</option>
                      <option value="contain">contain</option>
                    </select>
                  </label>
                ) : null}
              </div>
            </>
          ) : (
            <p className="muted">Selecione uma camada para editar.</p>
          )}
        </div>

        <div className="inspector-card soft">
          <p className="eyebrow">Estrutura</p>
          <div className="layer-stack">
            {orderedLayers.map((layer) => (
              <button
                key={layer.id}
                className={`mini-row ${selectedLayer?.id === layer.id ? "selected" : ""}`}
                onClick={() => setSelectedLayerId(layer.id)}
              >
                <strong>{layer.name}</strong>
                <span>{layer.kind}</span>
              </button>
            ))}
          </div>
        </div>
      </aside>
    </section>
  );
}
