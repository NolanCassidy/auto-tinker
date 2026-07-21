"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";

type CopyPromptButtonProps = {
  action: string;
  recordId?: string;
  label?: string;
  compact?: boolean;
  className?: string;
};

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

export function CopyPromptButton({
  action,
  recordId,
  label = "Copy to chat",
  compact = false,
  className = "",
}: CopyPromptButtonProps) {
  const [state, setState] = useState<"idle" | "loading" | "copied" | "error">(
    "idle",
  );

  async function handleCopy() {
    setState("loading");
    try {
      const response = await fetch("/api/prompts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, recordId }),
      });
      if (!response.ok) {
        throw new Error("Prompt could not be generated");
      }
      const payload = (await response.json()) as { prompt?: string };
      if (!payload.prompt) {
        throw new Error("Prompt was empty");
      }
      await copyText(payload.prompt);
      setState("copied");
      window.setTimeout(() => setState("idle"), 2200);
    } catch {
      setState("error");
      window.setTimeout(() => setState("idle"), 2800);
    }
  }

  const message =
    state === "loading"
      ? "Preparing…"
      : state === "copied"
        ? "Copied"
        : state === "error"
          ? "Try again"
          : label;

  return (
    <button
      className={`copy-prompt-button ${compact ? "is-compact" : ""} ${
        state === "copied" ? "is-copied" : ""
      } ${className}`}
      disabled={state === "loading"}
      onClick={handleCopy}
      type="button"
      title="Generate a plain-language instruction and copy it to your clipboard. This does not run an agent."
    >
      <Icon name={state === "copied" ? "check" : "copy"} size={compact ? 14 : 16} />
      <span>{message}</span>
    </button>
  );
}
