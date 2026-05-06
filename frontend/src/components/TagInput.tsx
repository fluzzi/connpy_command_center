import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  label?: string;
  suggestions?: string[];
}

// Simple fuzzy match: checks if all chars of the query appear in order in the target
function fuzzyMatch(query: string, target: string): { match: boolean; indices: number[] } {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  const indices: number[] = [];
  let qi = 0;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      indices.push(ti);
      qi++;
    }
  }

  return { match: qi === q.length, indices };
}

function HighlightedText({ text, indices }: { text: string; indices: number[] }) {
  const indexSet = new Set(indices);
  return (
    <span>
      {text.split('').map((char, i) => (
        <span key={i} className={indexSet.has(i) ? 'text-[#88c0d0] font-bold' : ''}>
          {char}
        </span>
      ))}
    </span>
  );
}

export const TagInput: React.FC<TagInputProps> = ({ tags, onChange, placeholder, label, suggestions }) => {
  const [inputValue, setInputValue] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter suggestions based on input
  const filtered = React.useMemo(() => {
    if (!suggestions || !inputValue.trim()) return [];
    const query = inputValue.trim();
    return suggestions
      .filter(s => !tags.includes(s)) // exclude already-added
      .map(s => ({ value: s, ...fuzzyMatch(query, s) }))
      .filter(s => s.match)
      .slice(0, 12);
  }, [suggestions, inputValue, tags]);

  // Show dropdown when there are matches
  useEffect(() => {
    setShowDropdown(filtered.length > 0 && inputValue.trim().length > 0);
    setSelectedIndex(0);
  }, [filtered.length, inputValue]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Scroll selected item into view
  useEffect(() => {
    if (dropdownRef.current) {
      const selected = dropdownRef.current.children[selectedIndex] as HTMLElement;
      if (selected) selected.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const addTag = useCallback((value: string) => {
    const newTag = value.trim().replace(/,$/, '');
    if (newTag && !tags.includes(newTag)) {
      onChange([...tags, newTag]);
    }
    setInputValue('');
    setShowDropdown(false);
  }, [tags, onChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showDropdown && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      setSelectedIndex(prev => {
        if (e.key === 'ArrowDown') return Math.min(prev + 1, filtered.length - 1);
        return Math.max(prev - 1, 0);
      });
      return;
    }

    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (showDropdown && filtered[selectedIndex]) {
        addTag(filtered[selectedIndex].value);
      } else {
        addTag(inputValue);
      }
    } else if (e.key === 'Backspace' && inputValue === '' && tags.length > 0) {
      onChange(tags.slice(0, -1));
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  const removeTag = (indexToRemove: number) => {
    onChange(tags.filter((_, index) => index !== indexToRemove));
  };

  return (
    <div className="mt-2 relative" ref={containerRef}>
      {label && <label className="block text-[13px] font-black uppercase tracking-[0.15em] text-[#81a1c1] mb-2">{label}</label>}
      <div className="flex flex-wrap gap-2 p-3 bg-[#2e3440]/50 border border-[#4c566a]/30 rounded-lg focus-within:border-[#81a1c1] min-h-[42px] items-center transition-colors shadow-inner">
        {tags.map((tag, index) => (
          <span key={index} className="flex items-center gap-1 bg-[#81a1c1]/20 text-[#88c0d0] border border-[#81a1c1]/30 px-2 py-0.5 rounded text-xs font-mono">
            {tag}
            <button onClick={() => removeTag(index)} className="hover:text-[#bf616a] focus:outline-none opacity-80 hover:opacity-100 transition-colors">
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            // Delay to allow dropdown click to fire first
            setTimeout(() => {
              if (inputValue.trim()) {
                addTag(inputValue);
              }
              setShowDropdown(false);
            }, 150);
          }}
          onFocus={() => {
            if (filtered.length > 0 && inputValue.trim()) setShowDropdown(true);
          }}
          placeholder={tags.length === 0 ? placeholder : ''}
          className="flex-1 bg-transparent border-none text-sm font-mono text-[#eceff4] placeholder:text-[#d8dee9]/30 focus:outline-none min-w-[120px]"
        />
      </div>

      {/* Suggestions Dropdown */}
      {showDropdown && (
        <div
          ref={dropdownRef}
          className="absolute z-50 left-0 right-0 mt-1 bg-[#3b4252] border border-[#4c566a]/50 rounded-lg shadow-xl max-h-[200px] overflow-y-auto custom-scrollbar"
        >
          {filtered.map((item, i) => (
            <div
              key={item.value}
              onMouseDown={(e) => {
                e.preventDefault();
                addTag(item.value);
                inputRef.current?.focus();
              }}
              onMouseEnter={() => setSelectedIndex(i)}
              className={`px-4 py-2 text-xs font-mono cursor-pointer transition-colors ${
                i === selectedIndex
                  ? 'bg-[#81a1c1]/20 text-[#eceff4]'
                  : 'text-[#d8dee9]/80 hover:bg-[#4c566a]/30'
              }`}
            >
              <HighlightedText text={item.value} indices={item.indices} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
