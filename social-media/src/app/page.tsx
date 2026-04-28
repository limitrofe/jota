"use client";

import { useEffect, useMemo, useState } from "react";
import { DesignerPanel } from "@/components/designer-panel";
import { JournalistPanel } from "@/components/journalist-panel";
import type { TemplateSpec } from "@/lib/template-spec";
import { createTemplate } from "@/lib/template-spec";
import { readJson, writeJson } from "@/lib/storage";

const STORAGE_KEY = "rede-studio.templates";

const defaultTemplate = createTemplate(
  "Pacote Editorial",
  "Template com camadas de texto, slot de imagem e suporte a múltiplos formatos.",
);

type Mode = "designer" | "journalist";

export default function HomePage() {
  const [mode, setMode] = useState<Mode>("designer");
  const [templates, setTemplates] = useState<TemplateSpec[]>([defaultTemplate]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(defaultTemplate.id);
  const [selectedVariantId, setSelectedVariantId] = useState(defaultTemplate.variants[0]!.id);

  useEffect(() => {
    const saved = readJson<TemplateSpec[] | null>(STORAGE_KEY, null);
    if (saved?.length) {
      setTemplates(saved);
      setSelectedTemplateId(saved[0]!.id);
      setSelectedVariantId(saved[0]!.variants[0]!.id);
      return;
    }

    writeJson(STORAGE_KEY, [defaultTemplate]);
  }, []);

  useEffect(() => {
    if (!templates.length) {
      return;
    }

    const template = templates.find((item) => item.id === selectedTemplateId) ?? templates[0]!;
    const variant = template.variants.find((item) => item.id === selectedVariantId) ?? template.variants[0]!;
    if (template && template.id !== selectedTemplateId) {
      setSelectedTemplateId(template.id);
    }
    if (variant && variant.id !== selectedVariantId) {
      setSelectedVariantId(variant.id);
    }
  }, [templates, selectedTemplateId, selectedVariantId]);

  const currentTemplate = templates.find((template) => template.id === selectedTemplateId) ?? templates[0] ?? defaultTemplate;
  const currentVariant = currentTemplate.variants.find((variant) => variant.id === selectedVariantId) ?? currentTemplate.variants[0]!;

  const stats = useMemo(
    () => [
      { label: "Templates", value: templates.length.toString() },
      { label: "Formato ativo", value: currentVariant.aspectRatio },
      { label: "Camadas", value: currentVariant.layers.length.toString() },
      { label: "Persistência", value: "localStorage" },
    ],
    [currentVariant.aspectRatio, currentVariant.layers.length, templates.length],
  );

  return (
    <main className="page-shell">
      <header className="hero">
        <div className="hero-top">
          <div className="brand">
            <p className="eyebrow">Rede Studio</p>
            <h1>Templates para social e thumbs, criados por designers e preenchidos por jornalistas.</h1>
            <p>
              O fluxo separa criação, preenchimento e exportação. Designers montam cartelas, áreas de texto e slots de mídia;
              jornalistas escolhem o template, alimentam o conteúdo e exportam JPG ou vídeo a partir do mesmo render.
            </p>
          </div>

          <div className="mode-switch" role="tablist" aria-label="Modo do editor">
            <button className={mode === "designer" ? "active" : ""} onClick={() => setMode("designer")}>
              Designer
            </button>
            <button className={mode === "journalist" ? "active" : ""} onClick={() => setMode("journalist")}>
              Jornalista
            </button>
          </div>
        </div>

        <div className="hero-cards">
          {stats.map((stat) => (
            <article key={stat.label} className="stat-card">
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
            </article>
          ))}
        </div>
      </header>

      {mode === "designer" ? (
        <DesignerPanel
          templates={templates}
          setTemplates={setTemplates}
          selectedTemplateId={selectedTemplateId}
          setSelectedTemplateId={setSelectedTemplateId}
          selectedVariantId={selectedVariantId}
          setSelectedVariantId={setSelectedVariantId}
        />
      ) : (
        <JournalistPanel
          templates={templates}
          selectedTemplateId={selectedTemplateId}
          setSelectedTemplateId={setSelectedTemplateId}
          selectedVariantId={selectedVariantId}
          setSelectedVariantId={setSelectedVariantId}
        />
      )}
    </main>
  );
}
