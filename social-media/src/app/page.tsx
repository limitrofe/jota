"use client";

import { useEffect, useMemo, useState } from "react";
import { DesignerPanel } from "@/components/designer-panel";
import { JournalistPanel } from "@/components/journalist-panel";
import {
  TEMPLATE_CATEGORIES,
  createStarterTemplates,
  ensureStandardVariants,
  normalizeTemplateLayout,
  type TemplateCategoryId,
  type TemplateSpec,
} from "@/lib/template-spec";
import { readJson, writeJson } from "@/lib/storage";

const ROLE_KEY = "rede-studio.role";
const TEMPLATES_KEY = "rede-studio.templates";

type Role = "designer" | "journalist";

function normalizeTemplates(templates: TemplateSpec[]): TemplateSpec[] {
  return templates.map((template) =>
    ensureStandardVariants(
      normalizeTemplateLayout({
        ...template,
        categoryId: template.categoryId ?? "mkt",
      }),
    ),
  );
}

function initialTemplates() {
  return createStarterTemplates();
}

export default function HomePage() {
  const [role, setRole] = useState<Role | null>(null);
  const [templates, setTemplates] = useState<TemplateSpec[]>(() => initialTemplates());
  const [selectedTemplateId, setSelectedTemplateId] = useState(templates[0]?.id ?? "");
  const [selectedVariantId, setSelectedVariantId] = useState(templates[0]?.variants[0]?.id ?? "");
  const [selectedThemeId, setSelectedThemeId] = useState<TemplateCategoryId>("dia_a_dia");

  useEffect(() => {
    const savedRole = readJson<Role | null>(ROLE_KEY, null);
    const savedTemplates = readJson<TemplateSpec[] | null>(TEMPLATES_KEY, null);

    if (savedRole) {
      setRole(savedRole);
    }

    if (savedTemplates?.length) {
      const hydrated = normalizeTemplates(savedTemplates);
      setTemplates(hydrated);
      setSelectedTemplateId(hydrated[0]!.id);
      setSelectedVariantId(hydrated[0]!.variants[0]!.id);
      const categoryId = hydrated[0]!.categoryId ?? "dia_a_dia";
      setSelectedThemeId(categoryId);
      return;
    }

    writeJson(TEMPLATES_KEY, templates);
  }, []);

  useEffect(() => {
    writeJson(TEMPLATES_KEY, templates);
  }, [templates]);

  useEffect(() => {
    if (role) {
      writeJson(ROLE_KEY, role);
    }
  }, [role]);

  useEffect(() => {
    if (!templates.length) {
      return;
    }

    const template = templates.find((item) => item.id === selectedTemplateId) ?? templates[0]!;
    const variant = template.variants.find((item) => item.id === selectedVariantId) ?? template.variants[0]!;

    if (template.id !== selectedTemplateId) {
      setSelectedTemplateId(template.id);
    }
    if (variant.id !== selectedVariantId) {
      setSelectedVariantId(variant.id);
    }
  }, [role, selectedTemplateId, selectedThemeId, selectedVariantId, templates]);

  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? templates[0];
  const selectedVariant = selectedTemplate?.variants.find((variant) => variant.id === selectedVariantId) ?? selectedTemplate?.variants[0];

  const selectedTheme = TEMPLATE_CATEGORIES.find((theme) => theme.id === selectedThemeId) ?? TEMPLATE_CATEGORIES[0];
  const visibleTemplates = useMemo(() => {
    if (role !== "journalist") {
      return templates;
    }

    const filtered = templates.filter((template) => template.categoryId === selectedTheme.id);
    return filtered.length > 0 ? filtered : templates;
  }, [role, selectedTheme.id, templates]);

  function chooseRole(nextRole: Role) {
    setRole(nextRole);
    writeJson(ROLE_KEY, nextRole);
  }

  function clearRole() {
    setRole(null);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(ROLE_KEY);
    }
  }

  if (!role) {
    return (
      <main className="welcome-screen">
        <section className="welcome-card">
          <p className="eyebrow">Rede Studio</p>
          <h1>Escolha seu perfil para abrir a interface certa.</h1>
          <p className="lead">
            Designers montam templates e layers. Jornalistas apenas escolhem o tema, preenchem os campos e exportam a peça.
          </p>

          <div className="role-grid">
            <button className="role-card" onClick={() => chooseRole("designer")}>
              <span>Designer</span>
              <strong>Criar templates</strong>
              <p>Subir cartelas PNG, definir slots e deixar tudo pronto para a redação.</p>
            </button>

            <button className="role-card" onClick={() => chooseRole("journalist")}>
              <span>Jornalista</span>
              <strong>Montar peças</strong>
              <p>Escolher um tema, preencher texto, anexar mídia e exportar rápido.</p>
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Rede Studio</p>
          <h1>{role === "designer" ? "Workspace de design" : "Workspace da redação"}</h1>
        </div>

        <div className="topbar-actions">
          <span className="role-pill">{role === "designer" ? "Designer" : "Jornalista"}</span>
          <button className="ghost-button" onClick={clearRole}>
            Trocar perfil
          </button>
        </div>
      </header>

      <p className="subtle-note">
        {role === "designer"
          ? "Crie um template uma vez e deixe a redação só preencher."
          : "Escolha um tema e use a mesma estrutura para social, thumb, podcast ou vídeo."}
      </p>

      {role === "designer" ? (
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
          templates={visibleTemplates}
          allTemplates={templates}
          selectedThemeId={selectedTheme.id}
          setSelectedThemeId={setSelectedThemeId}
          selectedTemplateId={selectedTemplateId}
          setSelectedTemplateId={setSelectedTemplateId}
          selectedVariantId={selectedVariantId}
          setSelectedVariantId={setSelectedVariantId}
        />
      )}
    </main>
  );
}
