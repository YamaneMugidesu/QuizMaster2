import React from 'react';
import { sanitizeHTML } from '../utils/sanitize';

interface RichTextPreviewProps {
  content: string;
  className?: string;
  placeholder?: string;
}

export const RichTextPreview: React.FC<RichTextPreviewProps> = ({ content, className = '', placeholder }) => {
  if (!content) {
    return <div className={`text-gray-400 ${className}`}>{placeholder || ''}</div>;
  }

  // Handle special case for array (like Multiple Select answers stored as JSON)
  try {
      if (content.startsWith('[') && content.endsWith(']')) {
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) {
              return (
                  <div className={`flex flex-wrap gap-2 ${className}`}>
                      {parsed.map((item, i) => (
                          <span 
                            key={i} 
                            className="inline-block px-2 py-0.5 rounded border border-gray-300 bg-white/80 rich-text-content"
                            dangerouslySetInnerHTML={{ __html: sanitizeHTML(item) }} 
                          />
                      ))}
                  </div>
              );
          }
      }
  } catch (e) {
      // Fallback to normal render if not valid JSON array
  }

  return (
    <div 
      className={`rich-text-content ql-editor !p-0 !min-h-0 ${className}`} 
      dangerouslySetInnerHTML={{ __html: sanitizeHTML(content) }} 
    />
  );
};
