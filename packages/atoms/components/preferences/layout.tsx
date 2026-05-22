"use client";

import * as React from "react";

import { Label, Separator, cn, useSidebar } from "@openconsole/shadcn";

import { useLayout } from "../../providers/layout-provider";
import { collapsibleOptions, sideOptions, sidebarVariants } from "./data";

// ---- Visual primitives -----------------------------------------------------

const Bars = () => (
  <>
    <div className="h-0.5 w-full bg-foreground/60 rounded" />
    <div className="h-0.5 w-3/4 bg-foreground/50 rounded" />
    <div className="h-0.5 w-2/3 bg-foreground/40 rounded" />
    <div className="h-0.5 w-3/4 bg-foreground/30 rounded" />
  </>
);

const MainArea = ({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) => (
  <div
    className={cn(
      "flex-1 m-1 rounded-sm border-dashed border border-muted-foreground/20",
      className,
    )}
  >
    {children}
  </div>
);

function OptionCard({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative p-4 border rounded-md cursor-pointer transition-colors",
        active
          ? "border-primary bg-primary/10"
          : "border-border hover:border-border/60",
      )}
      onClick={onClick}
    >
      <div className="space-y-2">
        <div className="text-xs font-semibold text-center">{label}</div>
        {children}
      </div>
    </div>
  );
}

function Section({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-sm font-medium">{label}</Label>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}

// ---- Per-variant previews --------------------------------------------------

function VariantPreview({ value }: { value: "sidebar" | "floating" | "inset" }) {
  const sidebarCls = cn(
    "w-3 shrink-0 bg-muted flex flex-col gap-0.5 p-1",
    value === "floating" && "border-r m-1 rounded",
    value === "inset" && "m-1 ms-0 rounded bg-muted/80",
    value === "sidebar" && "border-r",
  );
  return (
    <div
      className={cn(
        "flex h-12 rounded border",
        value === "inset" ? "bg-muted" : "bg-background",
      )}
    >
      <div className={sidebarCls}>
        <Bars />
      </div>
      <MainArea
        className={
          value === "inset" ? "bg-background ms-0" : "bg-background/50"
        }
      />
    </div>
  );
}

function CollapsiblePreview({ value }: { value: "offcanvas" | "icon" | "none" }) {
  return (
    <div className="flex h-12 rounded border bg-background">
      {value === "offcanvas" && (
        <MainArea className="bg-background/50 flex items-center justify-start pl-2">
          <div className="flex flex-col gap-0.5">
            <div className="w-3 h-0.5 bg-foreground/60 rounded" />
            <div className="w-3 h-0.5 bg-foreground/60 rounded" />
            <div className="w-3 h-0.5 bg-foreground/60 rounded" />
          </div>
        </MainArea>
      )}
      {value === "icon" && (
        <>
          <div className="w-4 shrink-0 bg-muted flex flex-col gap-1 p-1 border-r items-center">
            <div className="w-2 h-2 bg-foreground/60 rounded-sm" />
            <div className="w-2 h-2 bg-foreground/40 rounded-sm" />
            <div className="w-2 h-2 bg-foreground/30 rounded-sm" />
          </div>
          <MainArea className="bg-background/50" />
        </>
      )}
      {value === "none" && (
        <>
          <div className="w-6 shrink-0 bg-muted flex flex-col gap-0.5 p-1 border-r">
            <Bars />
          </div>
          <MainArea className="bg-background/50" />
        </>
      )}
    </div>
  );
}

function SidePreview({ value }: { value: "left" | "right" }) {
  const bars = (
    <div
      className={cn(
        "w-6 shrink-0 bg-muted flex flex-col gap-0.5 p-1",
        value === "left" ? "border-r" : "border-l",
      )}
    >
      <Bars />
    </div>
  );
  const main = <MainArea className="bg-background/50" />;
  return (
    <div className="flex h-12 rounded border bg-background">
      {value === "left" ? (
        <>
          {bars}
          {main}
        </>
      ) : (
        <>
          {main}
          {bars}
        </>
      )}
    </div>
  );
}

// ---- Main component --------------------------------------------------------

export function Layout() {
  const { config, updateConfig } = useLayout();
  const { toggleSidebar, state: sidebarState } = useSidebar();

  const variantDescription = sidebarVariants.find(
    (v) => v.value === config.variant,
  )?.description;
  const collapsibleDescription = collapsibleOptions.find(
    (o) => o.value === config.collapsible,
  )?.description;
  const sideDescription = sideOptions.find(
    (s) => s.value === config.side,
  )?.description;

  const setCollapsible = (collapsible: "offcanvas" | "icon" | "none") => {
    updateConfig({ collapsible });
    // Auto-collapse when switching to icon mode while expanded.
    if (collapsible === "icon" && sidebarState === "expanded") toggleSidebar();
  };

  return (
    <div className="p-4 space-y-6">
      <Section label="Sidebar Variant" description={variantDescription}>
        <div className="grid grid-cols-3 gap-3">
          {sidebarVariants.map((v) => (
            <OptionCard
              key={v.value}
              active={config.variant === v.value}
              label={v.name}
              onClick={() => updateConfig({ variant: v.value })}
            >
              <VariantPreview value={v.value} />
            </OptionCard>
          ))}
        </div>
      </Section>

      <Separator />

      <Section
        label="Sidebar Collapsible Mode"
        description={collapsibleDescription}
      >
        <div className="grid grid-cols-3 gap-3">
          {collapsibleOptions.map((o) => (
            <OptionCard
              key={o.value}
              active={config.collapsible === o.value}
              label={o.name}
              onClick={() => setCollapsible(o.value)}
            >
              <CollapsiblePreview value={o.value} />
            </OptionCard>
          ))}
        </div>
      </Section>

      <Separator />

      <Section label="Sidebar Position" description={sideDescription}>
        <div className="grid grid-cols-2 gap-3">
          {sideOptions.map((s) => (
            <OptionCard
              key={s.value}
              active={config.side === s.value}
              label={s.name}
              onClick={() => updateConfig({ side: s.value })}
            >
              <SidePreview value={s.value} />
            </OptionCard>
          ))}
        </div>
      </Section>
    </div>
  );
}
