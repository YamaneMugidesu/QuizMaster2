import DOMPurify from 'dompurify';

export const sanitizeHTML = (html: string): string => {
    if (!html) return '';
    return DOMPurify.sanitize(html, {
        USE_PROFILES: { html: true }, // Ensure only HTML is allowed
        ADD_ATTR: ['target', 'style', 'class'], // Allow style and class for rich text formatting
        ADD_TAGS: ['em-dot'] // Allow custom tags like emphasis dot
    });
};
