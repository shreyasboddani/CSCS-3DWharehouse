import { useRef, useState } from "react";
/** Keep incomplete typing local; commit once on blur or Enter to avoid rebuilding the scene per digit. */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled = false,
  integer = false,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  integer?: boolean;
}) {
  const [text, setText] = useState(String(Math.round(value * 10000) / 10000));
  const [previous, setPrevious] = useState(value);
  const cancelled = useRef(false);
  if (previous !== value) {
    setPrevious(value);
    setText(String(Math.round(value * 10000) / 10000));
  }
  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false;
      setText(String(Math.round(value * 10000) / 10000));
      return;
    }
    let n = Number(text);
    if (!text.trim() || !Number.isFinite(n)) n = value;
    if (integer) n = Math.round(n);
    n = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, n));
    setText(String(Math.round(n * 10000) / 10000));
    if (Math.abs(n - value) > 0.0001) onChange(n);
  };
  return (
    <input
      type="number"
      value={text}
      min={min !== undefined && Number.isFinite(min) ? min : undefined}
      max={max}
      step={step}
      disabled={disabled}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          e.preventDefault();
          cancelled.current = true;
          setText(String(Math.round(value * 10000) / 10000));
          e.currentTarget.blur();
        }
      }}
    />
  );
}
