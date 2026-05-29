import React, { useRef, useState, useEffect } from 'react';

interface SmartCommandEditorProps {
  commands: string[];
  onChange: (commands: string[]) => void;
  label?: string;
}

export const SmartCommandEditor: React.FC<SmartCommandEditorProps> = ({ commands, onChange, label }) => {
  const text = commands.join('\n');
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value.split('\n'));
  };

  const handleScroll = () => {
    if (backdropRef.current && textareaRef.current) {
      backdropRef.current.scrollTop = textareaRef.current.scrollTop;
      backdropRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  // Sync scroll on text change as well
  useEffect(() => {
    handleScroll();
  }, [text]);

  const renderHighlightedText = () => {
    if (!text) {
      return <span className="text-[#d8dee9]/30">Enter commands... e.g., show run int &#123;interface&#125;</span>;
    }
    
    const parts = text.split(/(\{.*?\})/g);
    return parts.map((part, i) => {
      if (part.startsWith('{') && part.endsWith('}')) {
        return (
          <span key={i} className="text-[#a3be8c] bg-[#a3be8c]/20 rounded-sm">
            {part}
          </span>
        );
      }
      return <span key={i} className="text-[#eceff4]">{part}</span>;
    });
  };

  return (
    <div className="mt-2 space-y-1">
      {label && <label className="block text-[13px] font-black uppercase tracking-[0.15em] text-[#81a1c1] mb-2">{label}</label>}
      <div className={`relative w-full border rounded-lg transition-colors bg-[#2e3440]/50 shadow-inner overflow-hidden ${isFocused ? 'border-[#81a1c1]' : 'border-[#4c566a]/30'}`}>
        
        {/* Highlight Backdrop */}
        <div 
          ref={backdropRef}
          className="absolute inset-0 whitespace-pre-wrap break-all overflow-hidden pointer-events-none select-none z-0 m-0"
          aria-hidden="true"
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
            fontSize: '14px',
            lineHeight: '1.625',
            padding: '16px',
          }}
        >
          {renderHighlightedText()}
          {text.endsWith('\n') ? <br /> : null}
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onScroll={handleScroll}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className="w-full min-h-[120px] bg-transparent focus:outline-none resize-y relative z-10 m-0 whitespace-pre-wrap break-all overflow-x-hidden overflow-y-auto custom-scrollbar block box-border"
          spellCheck={false}
          style={{ 
            color: 'transparent',
            caretColor: '#eceff4',
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
            fontSize: '14px',
            lineHeight: '1.625',
            padding: '16px',
            border: '0',
          }}
        />
      </div>
    </div>
  );
};
