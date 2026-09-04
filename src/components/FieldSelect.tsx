"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";

export type FieldSelectOption = { value: string; label: string };

export function FieldSelect({
  label,
  value,
  options,
  onChange,
  disabled,
  title,
}: {
  label: string;
  value: string;
  options: FieldSelectOption[];
  onChange?: (value: string) => void;
  disabled?: boolean;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const titleId = useId();
  const selected = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="field w-full sm:w-auto">
      <span className="font-mono-ui text-[11px] uppercase tracking-[0.05em] text-subtle">{label}</span>
      <div className="relative">
        <button
          type="button"
          title={title}
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="field-select text-left"
          onClick={() => {
            if (!disabled) setOpen((v) => !v);
          }}
        >
          <span className="block truncate pr-1">{selected?.label ?? "—"}</span>
        </button>
      </div>

      {open && mounted
        ? createPortal(
            <div className="field-menu-layer">
              <button
                type="button"
                className="field-menu-backdrop"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
              />
              <div
                className="field-menu-sheet"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
              >
                <div className="field-menu-sheet-head">
                  <p id={titleId} className="field-menu-sheet-title">
                    {label}
                  </p>
                  <button type="button" className="field-menu-close" onClick={() => setOpen(false)}>
                    Done
                  </button>
                </div>
                <div className="field-menu-list" role="listbox" aria-label={label}>
                  {options.map((opt, idx) => {
                    const isOn = opt.value === value;
                    return (
                      <button
                        key={`${idx}::${opt.value}`}
                        type="button"
                        role="option"
                        aria-selected={isOn}
                        className={`field-menu-item ${isOn ? "is-selected" : ""}`}
                        onClick={() => {
                          onChange?.(opt.value);
                          setOpen(false);
                        }}
                      >
                        <span className="field-menu-check" aria-hidden="true">
                          {isOn ? "✓" : ""}
                        </span>
                        <span className="min-w-0 flex-1 text-left">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
