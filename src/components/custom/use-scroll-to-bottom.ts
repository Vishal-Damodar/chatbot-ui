import { useRef, useEffect, useState, useCallback } from 'react';

export function useScrollToBottom<T extends HTMLElement = HTMLDivElement>(): [
    React.RefObject<T>,
    React.RefObject<HTMLDivElement>,
    () => void, // scrollToBottom function
    boolean // isAtBottom state
] {
    const messagesContainerRef = useRef<T>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [isAtBottom, setIsAtBottom] = useState(true); // Start at bottom initially

    // Function to scroll to bottom
    const scrollToBottom = useCallback(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, []);

    // Effect to observe scroll events on the container
    useEffect(() => {
        const container = messagesContainerRef.current;
        if (!container) return;

        const handleScroll = () => {
            // Check if user is at the very bottom (with a small tolerance)
            const newIsAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 10;
            setIsAtBottom(newIsAtBottom);
        };

        container.addEventListener('scroll', handleScroll);

        // Initial check in case content is already too large to fit
        handleScroll();

        return () => {
            container.removeEventListener('scroll', handleScroll);
        };
    }, []);

    return [messagesContainerRef, messagesEndRef, scrollToBottom, isAtBottom];
}