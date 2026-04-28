"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { JournalContent, MediaInput, TemplateSpec, TemplateVariant } from "@/lib/template-spec";
import { createEmptyContent } from "@/lib/template-spec";
import { readJson, writeJson } from "@/lib/storage";
import { StageCanvas, type StageCanvasHandle } from "@/components/stage-canvas";

const STORAGE_KEY = "rede-studio.templates";

interface JournalistPanelProps {
  templates: TemplateSpec[];
  selectedTemplateId: string;
  setSelectedTemplateId: (value: string) => void;
  selectedVariantId: string;
  setSelectedVariantId: (value: string) => void;
}

export function JournalistPanel({
  templates,
  selectedTemplateId,
  setSelectedTemplateId,
  selectedVariantId,
  setSelectedVariantId,
}: JournalistPanelProps) {
  const stageRef = useRef<StageCanvasHandle | null>(null);
  const [content, setContent] = useState<JournalContent>({ texts: {}, media: {} });
  const [status, setStatus] = useState<string>("Pronto para preencher e exportar.");

  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? templates[0];
  const selectedVariant =
    selectedTemplate?.variants.find((variant) => variant.id === selectedVariantId) ?? selectedTemplate?.variants[0];

  useEffect(() => {
    if (!selectedVariant) {
      return;
    }

    const base = createEmptyContent(selectedVariant);
    setContent((current) => ({
      texts: { ...base.texts, ...current.texts },
      media: { ...base.media, ...current.media },
    }));
  }, [selectedVariant?.id]);

  const textLayers = useMemo(() => {
    return selectedVariant?.layers.filter((layer) => layer.kind === "text") ?? [];
  }, [selectedVariant]);

  const mediaLayers = useMemo(() => {
    return selectedVariant?.layers.filter((layer) => layer.kind === "image" || layer.kind === "video") ?? [];
  }, [selectedVariant]);

  if (!selectedTemplate || !selectedVariant) {
    return null;
  }

  function persistStatus(next: string) {
    setStatus(next);
  }

  function updateMedia(layerId: string, file: File | null, kind: "image" | "video") {
    if (!file) {
      setContent((current) => ({
        ...current,
        media: { ...current.media, [layerId]: undefined },
      }));
      return;
    }

    const src = URL.createObjectURL(file);
    setContent((current) => ({
      ...current,
      media: {
        ...current.media,
        [layerId]: { kind, src, name: file.name },
      },
    }));
  }

  async function exportImage() {
    persistStatus("Gerando JPG...");
    const blob = await stageRef.current?.exportJpg();
    if (!blob) {
      return;
    }
    const url = URL.createObjectURL(blob);
    downloadUrl(url, `${selectedTemplate.name}.jpg`);
    persistStatus("JPG pronto.");
  }

  async function exportVideo() {
    persistStatus("Gerando vídeo...");
    const blob = await stageRef.current?.exportVideo(5);
    if (!blob) {
      return;
    }
    const isMp4 = blob.type.includes("mp4");
    const extension = isMp4 ? "mp4" : "webm";
    const url = URL.createObjectURL(blob);
    downloadUrl(url, `${selectedTemplate.name}.${extension}`);
    persistStatus(isMp4 ? "MP4 pronto." : "O navegador exportou WebM como fallback.");
  }

  return (
    <div className="panel-grid journalist-grid">
      <aside className="sidebar">
        <div className="sidebar-section">
          <div className="section-header">
            <div>
              <p className="eyebrow">Jornalista</p>
              <h2>Montagem e exportação</h2>
            </div>
            <span className="badge">{status}</span>
          </div>

          <label className="field">
            <span>Template</span>
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
            <select
              value={selectedVariant.id}
              onChange={(event) => setSelectedVariantId(event.target.value)}
            >
              {selectedTemplate.variants.map((variant) => (
                <option key={variant.id} value={variant.id}>
                  {variant.name} · {variant.aspectRatio}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="sidebar-section">
          <div className="section-header">
            <h3>Texto</h3>
            <span className="muted">{textLayers.length} slots</span>
          </div>
          <div className="property-stack">
            {textLayers.map((layer) => (
              <label key={layer.id} className="field">
                <span>{layer.name}</span>
                <textarea
                  rows={4}
                  value={content.texts[layer.id] ?? ""}
                  onChange={(event) =>
                    setContent((current) => ({
                      ...current,
                      texts: { ...current.texts, [layer.id]: event.target.value },
                    }))
                  }
                  placeholder={layer.textPlaceholder}
                />
              </label>
            ))}
          </div>
        </div>

        <div className="sidebar-section">
          <div className="section-header">
            <h3>Mídia</h3>
            <span className="muted">{mediaLayers.length} slots</span>
          </div>
          <div className="property-stack">
            {mediaLayers.map((layer) => {
              const accepted = layer.kind === "video" ? "video/*" : "image/*";
              const current = content.media[layer.id];
              return (
                <label key={layer.id} className="field">
                  <span>{layer.name}</span>
                  <input
                    type="file"
                    accept={accepted}
                    onChange={(event) =>
                      updateMedia(
                        layer.id,
                        event.target.files?.[0] ?? null,
                        layer.kind === "video" ? "video" : "image",
                      )
                    }
                  />
                  {current ? <small className="muted">{current.name}</small> : null}
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() =>
                      setContent((currentContent) => ({
                        ...currentContent,
                        media: { ...currentContent.media, [layer.id]: undefined },
                      }))
                    }
                  >
                    Limpar
                  </button>
                </label>
              );
            })}
          </div>
        </div>
      </aside>

      <section className="workspace">
        <div className="stage-shell">
          <div className="stage-toolbar">
            <div>
              <p className="eyebrow">Preview</p>
              <h2>{selectedVariant.name}</h2>
            </div>
            <div className="inline-actions">
              <button className="accent-button" onClick={() => void exportImage()}>
                Exportar JPG
              </button>
              <button className="accent-button" onClick={() => void exportVideo()}>
                Exportar MP4
              </button>
            </div>
          </div>

          <div className="stage-frame">
            <StageCanvas ref={stageRef} variant={selectedVariant} content={content} className="stage-canvas" live />
          </div>
        </div>

        <div className="sidebar">
          <div className="sidebar-section">
            <h3>Como isso foi desenhado</h3>
            <p className="muted">
              O jornalista só preenche os slots definidos pelo designer. A exportação usa o mesmo motor de render do preview, então o resultado fica previsível.
            </p>
          </div>
          <div className="sidebar-section">
            <h3>Saída</h3>
            <p className="muted">
              JPG é gerado direto do canvas. Vídeo usa `MediaRecorder` e tenta `mp4` primeiro, com fallback para `webm` quando o navegador não suporta MP4 nativo.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function downloadUrl(url: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
