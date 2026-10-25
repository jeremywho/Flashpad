import { useEffect, useRef, useState } from 'react';
import { NEW_CATEGORY_NAME } from '@shared/index';

interface CategoryQuickAddProps {
  color: string;
  onCommit: (name: string) => Promise<void>;
  onCancel: () => void;
}

export default function CategoryQuickAdd({ color, onCommit, onCancel }: CategoryQuickAddProps) {
  const [name, setName] = useState(NEW_CATEGORY_NAME);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const settledRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const cancel = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    onCancel();
  };

  const commit = async () => {
    if (settledRef.current) return;
    const trimmed = name.trim();
    if (!trimmed) {
      cancel();
      return;
    }
    settledRef.current = true;
    setSaving(true);
    try {
      await onCommit(trimmed);
    } catch {
      settledRef.current = false;
      setSaving(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  return (
    <div className="sidebar-item sidebar-quick-add">
      <span className="sidebar-color-dot" style={{ backgroundColor: color }} />
      <input
        ref={inputRef}
        className="sidebar-quick-add-input"
        aria-label="New category name"
        value={name}
        maxLength={100}
        readOnly={saving}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            cancel();
          }
        }}
        onBlur={() => void commit()}
      />
    </div>
  );
}
