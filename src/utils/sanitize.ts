import DOMPurify from 'dompurify';

export const sanitizeHTML = (html: string): string => {
    if (!html) return '';
    return DOMPurify.sanitize(html, {
        USE_PROFILES: { html: true }, // Ensure only HTML is allowed
        ADD_ATTR: ['target'], // Allow target attribute for links
    });
};
