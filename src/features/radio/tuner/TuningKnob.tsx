"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { indexFromAngle, knobAngle, stepIndex } from "./dial";

interface Props {
  count: number;
  index: number;
  onChange: (index: number) => void;
  valueText: string;
  disabled?: boolean;
}

/**
 * Rotary tuning knob. For assistive tech and keyboards it is a standard slider:
 * arrows step one station, Page Up/Down five, Home/End jump to the ends.
 * With a pointer, drag around the knob to turn it.
 */
export function TuningKnob({ count, index, onChange, valueText, disabled = false }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  function angleFromPointer(e: PointerEvent) {
    const r = ref.current!.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    return (Math.atan2(dx, -dy) * 180) / Math.PI; // 0° = up, clockwise positive
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (disabled || count === 0) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    onChange(indexFromAngle(angleFromPointer(e), count));
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;
    const next = indexFromAngle(angleFromPointer(e), count);
    if (next !== index) onChange(next);
  }
  function onPointerUp() {
    dragging.current = false;
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (disabled || count === 0) return;
    const steps: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 5, PageDown: -5 };
    let next: number | null = null;
    if (e.key in steps) next = stepIndex(index, steps[e.key], count);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = count - 1;
    if (next === null) return;
    e.preventDefault();
    if (next !== index) onChange(next);
  }

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label="Tuning knob"
      aria-valuemin={count ? 1 : 0}
      aria-valuemax={count}
      aria-valuenow={count ? index + 1 : 0}
      aria-valuetext={valueText}
      aria-disabled={disabled || count === 0}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="tuner__knob shrink-0"
    >
      <span className="tuner__knob-cap" style={{ transform: `rotate(${knobAngle(index, count)}deg)` }} aria-hidden />
    </div>
  );
}
