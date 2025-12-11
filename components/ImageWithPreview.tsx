import React, { useState, useEffect } from 'react';

interface ImageWithPreviewProps extends React.ImgHTMLAttributes<HTMLImageElement> {
    previewClassName?: string; // Class for the modal image
}

export const ImageWithPreview: React.FC<ImageWithPreviewProps> = ({ className, previewClassName, onClick, ...props }) => {
    const [isOpen, setIsOpen] = useState(false);

    // Prevent body scroll when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    const handleClick = (e: React.MouseEvent<HTMLImageElement>) => {
        e.preventDefault(); // Prevent default behavior (like link following if wrapped)
        e.stopPropagation(); // Prevent triggering parent clicks
        setIsOpen(true);
        if (onClick) onClick(e);
    };

    return (
        <>
            <img 
                loading="lazy"
                {...props} 
                className={`${className || ''} cursor-zoom-in transition-opacity hover:opacity-90`} 
                onClick={handleClick} 
                title="点击放大查看"
            />
            
            {isOpen && (
                <div 
                    className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-sm animate-fade-in p-4"
                    onClick={() => setIsOpen(false)}
                >
                    <div className="relative max-w-full max-h-full flex items-center justify-center">
                        <img 
                            src={props.src} 
                            alt={props.alt || 'Preview'} 
                            className={`max-w-full max-h-[90vh] object-contain rounded-sm shadow-2xl select-none ${previewClassName || ''}`}
                            onClick={(e) => e.stopPropagation()} // Clicking image doesn't close
                        />
                        <button 
                            className="absolute -top-12 right-0 md:-right-12 text-white/70 hover:text-white transition-colors p-2 rounded-full hover:bg-white/10"
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsOpen(false);
                            }}
                            title="关闭"
                        >
                            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}
        </>
    );
};
