import React, { useEffect, useRef, useMemo } from 'react';
import ReactQuill, { Quill } from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

// --- Custom Blot for Emphasis Dot ---
const Inline = Quill.import('blots/inline') as any;
class EmphasisDot extends Inline {
  static blotName = 'emphasis-dot';
  static tagName = 'em-dot'; // Use a custom tag to ensure uniqueness
  static className = 'emphasis-dot'; // Also apply class for easier styling

  static create(value: any) {
    return super.create(value);
  }
}
Quill.register('formats/emphasis-dot', EmphasisDot);

// --- Custom Toolbar Implementation ---
// Prevent default on mousedown to keep focus in the editor
// Wrap in React.memo to prevent re-renders destroying Quill listeners/state
const CustomToolbar = React.memo(({ id }: { id: string }) => (
  <div id={id} onMouseDown={(e) => e.preventDefault()}>
    <span className="ql-formats">
      <button type="button" className="ql-bold" />
      <button type="button" className="ql-italic" />
      <button type="button" className="ql-underline" />
      <button type="button" className="ql-strike" />
      <button type="button" className="ql-emphasis-dot">
        <svg viewBox="0 0 18 18">
             <path className="ql-stroke" d="M9,3.5L5.5,12h1.4l0.7-2h3l0.7,2h1.4L9,3.5z M6.8,9L9,4.5L11.2,9H6.8z" stroke="currentColor" strokeWidth="1" fill="none"/>
             <circle className="ql-fill" cx="9" cy="14.5" r="1.5" fill="currentColor"/>
        </svg>
      </button>
    </span>
    <span className="ql-formats">
      <button type="button" className="ql-script" value="sub" />
      <button type="button" className="ql-script" value="super" />
    </span>
    <span className="ql-formats">
      <button type="button" className="ql-clean" />
    </span>
  </div>
));

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string; // Add optional id prop
}

// Static formats array to prevent re-renders
const formats = [
  'bold', 'italic', 'underline', 'strike',
  'script', 'emphasis-dot' // Replaces list/emphasis with script, added emphasis-dot back
];

export const RichTextEditor: React.FC<RichTextEditorProps> = ({ value, onChange, placeholder, id }) => {
  const registeredRef = useRef(false);
  // Generate a unique ID for the toolbar if not provided
  const toolbarId = useRef(id || `toolbar-${Math.random().toString(36).substr(2, 9)}`).current;

  // Helper function to toggle standard formats safely
  const toggleStandardFormat = (quill: any, format: string) => {
      let range = quill.getSelection();
      if (!range) {
          quill.focus();
          range = quill.getSelection();
      }
      if (!range) return;
      
      const currentFormat = quill.getFormat(range);
      // If format is present (true or some value), toggle it off (false)
      // If format is absent (undefined/false), toggle it on (true)
      const value = !currentFormat[format];
      quill.format(format, value);
  };

  // Helper function for script (sub/super)
  const toggleScript = (quill: any, value: string) => {
      let range = quill.getSelection();
      if (!range) {
          quill.focus();
          range = quill.getSelection();
      }
      if (!range) return;

      const currentFormat = quill.getFormat(range);
      if (currentFormat.script === value) {
          quill.format('script', false);
      } else {
          quill.format('script', value);
      }
  };

  // MEMOIZE modules to prevent Quill re-initialization on every render
  const modules = useMemo(() => ({
    toolbar: {
      container: `#${toolbarId}`,
      handlers: {
        'bold': function(this: any) {
            toggleStandardFormat(this.quill, 'bold');
        },
        'italic': function(this: any) {
            toggleStandardFormat(this.quill, 'italic');
        },
        'underline': function(this: any) {
            toggleStandardFormat(this.quill, 'underline');
        },
        'strike': function(this: any) {
            toggleStandardFormat(this.quill, 'strike');
        },
        'script': function(this: any, value: string) {
            toggleScript(this.quill, value);
        },
        'emphasis-dot': function(this: any) {
            const quill = this.quill;
            const range = quill.getSelection();
            if (range) {
                const current = quill.getFormat(range);
                const value = !current['emphasis-dot'];
                quill.format('emphasis-dot', value);
            }
        }
      }
    }
  }), [toolbarId]);

  // Defensive check: if ReactQuill is undefined, render a fallback textarea
  if (!ReactQuill) {
    console.error("RichTextEditor: ReactQuill component is undefined. Falling back to textarea.");
    return (
      <div className="rich-text-editor-fallback">
        <textarea 
            value={value} 
            onChange={(e) => onChange(e.target.value)} 
            placeholder={placeholder}
            className="w-full min-h-[200px] p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:outline-none"
        />
        <p className="text-xs text-red-500 mt-1">Rich Text Editor failed to load. Using plain text mode.</p>
      </div>
    );
  }

  return (
    <div className="rich-text-editor">
        <CustomToolbar id={toolbarId} />
        <ReactQuill 
            theme="snow"
            value={value}
            onChange={onChange}
            modules={modules}
            formats={formats}
            placeholder={placeholder}
            className="bg-white"
        />
    </div>
  );
};
