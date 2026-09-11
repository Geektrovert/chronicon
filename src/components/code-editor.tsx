"use client";

import { useDeferredValue, useRef } from "react";
import { highlight } from "sugar-high";

export function CodeEditor({
  value,
  onChange,
  label = "HTML source",
  readOnly = false,
}: {
  value: string;
  onChange?: (value: string) => void;
  label?: string;
  readOnly?: boolean;
}) {
  const preview = useRef<HTMLPreElement>(null);
  const deferredValue = useDeferredValue(value);

  const highlighted =
    deferredValue.length <= 150_000 ? highlight(deferredValue, { lang: "html" }) : undefined;

  return (
    <div className={`code-editor ${highlighted ? "highlighted" : ""}`}>
      {highlighted && (
        <pre ref={preview} aria-hidden="true">
          <code dangerouslySetInnerHTML={{ __html: `${highlighted}\n` }} />
        </pre>
      )}
      <textarea
        aria-label={label}
        value={value}
        readOnly={readOnly}
        wrap="off"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        onChange={(event) => onChange?.(event.target.value)}
        onScroll={(event) => {
          if (preview.current) {
            preview.current.scrollTop = event.currentTarget.scrollTop;
            preview.current.scrollLeft = event.currentTarget.scrollLeft;
          }
        }}
      />
    </div>
  );
}
