import { ChatInput } from "@/components/custom/chatinput";
import { PreviewMessage } from "../../components/custom/message";
import { useScrollToBottom } from '@/components/custom/use-scroll-to-bottom'; // Updated import
import { useState, useRef, useEffect, useCallback } from "react";
import { message } from "../../interfaces/interfaces"
import { Overview } from "@/components/custom/overview";
import { Header } from "@/components/custom/header";
import {v4 as uuidv4} from 'uuid';
import { ThreeDot } from 'react-loading-indicators'; // Import the ThreeDot loader

const socket = new WebSocket("ws://localhost:8090"); //change to your websocket endpoint

export function Chat() {
  // Use the updated useScrollToBottom hook
  const [messagesContainerRef, messagesEndRef, scrollToBottom, isAtBottom] = useScrollToBottom<HTMLDivElement>();
  const [messages, setMessages] = useState<message[]>([]);
  const [question, setQuestion] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // States specifically for the current assistant message being typed
  const [currentAssistantMessageId, setCurrentAssistantMessageId] = useState<string | null>(null);
  const [rawIncomingBuffer, setRawIncomingBuffer] = useState<string>(""); // Accumulates all raw chunks for the current message
  const [displayedContent, setDisplayedContent] = useState<string>(""); // The portion of rawIncomingBuffer currently shown
  const [chunksReceivedCount, setChunksReceivedCount] = useState<number>(0); // New state to count received chunks

  const messageHandlerRef = useRef<((event: MessageEvent) => void) | null>(null);
  const animationIntervalRef = useRef<number | null>(null); // Use setInterval for consistent typing speed

  const typingSpeed = 5; // Milliseconds per character. Adjust as needed for desired speed.
  const minimumChunksForTyping = 2; // The number of chunks to wait for before typing starts

  const cleanupAnimation = useCallback(() => {
    if (animationIntervalRef.current) {
      clearInterval(animationIntervalRef.current);
      animationIntervalRef.current = null;
    }
  }, []);

  const cleanupMessageHandler = useCallback(() => {
    if (messageHandlerRef.current && socket) {
      socket.removeEventListener("message", messageHandlerRef.current);
      messageHandlerRef.current = null;
    }
  }, []);

  // Effect to manage the character-by-character display and update the messages array
  useEffect(() => {
    cleanupAnimation(); // Clear any existing animation before starting a new one

    // Only start typing animation if enough chunks have been received
    if (rawIncomingBuffer.length > displayedContent.length && chunksReceivedCount >= minimumChunksForTyping) {
      // Start/continue typing animation
      animationIntervalRef.current = window.setInterval(() => {
        setDisplayedContent(prevDisplayed => {
          if (prevDisplayed.length < rawIncomingBuffer.length) {
            const nextChar = rawIncomingBuffer[prevDisplayed.length];
            const newContent = prevDisplayed + nextChar;

            // Update the actual messages array with the currently displayed content
            setMessages(prevMessages =>
              prevMessages.map(msg =>
                msg.id === currentAssistantMessageId
                  ? { ...msg, content: newContent } // Update current typing message
                  : msg
              )
            );
            // If the user was at the bottom, continue to scroll as new content appears
            if (isAtBottom) { // <--- IMPORTANT: Only scroll if at bottom
                scrollToBottom();
            }
            return newContent;
          } else {
            // All characters in buffer displayed, stop animation
            cleanupAnimation();
            return prevDisplayed;
          }
        });
      }, typingSpeed);
    } else if (currentAssistantMessageId && rawIncomingBuffer.includes("[END]")) {
      // If all content is displayed and [END] is present, finalize the message
      cleanupAnimation();
      setMessages(prevMessages =>
        prevMessages.map(msg =>
          msg.id === currentAssistantMessageId
            ? { ...msg, content: rawIncomingBuffer.replace("[END]", "").trim() }
            : msg
        )
      );
      // Reset states for the next message
      setCurrentAssistantMessageId(null);
      setRawIncomingBuffer("");
      setDisplayedContent("");
      setChunksReceivedCount(0); // Reset chunks received count
      // After message is finalized, if at bottom, scroll one last time
      if (isAtBottom) { // <--- IMPORTANT: Only scroll if at bottom
          scrollToBottom();
      }
    }

    // Cleanup on unmount or when dependencies change
    return () => {
      cleanupAnimation();
    };
  }, [rawIncomingBuffer, displayedContent, currentAssistantMessageId, typingSpeed, cleanupAnimation, chunksReceivedCount, isAtBottom, scrollToBottom]); // Add isAtBottom and scrollToBottom to dependencies

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      cleanupMessageHandler();
      cleanupAnimation();
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close(); // Close socket on unmount if it's still open
      }
    };
  }, [cleanupMessageHandler, cleanupAnimation]);

  async function handleSubmit(text?: string) {
    if (!socket || socket.readyState !== WebSocket.OPEN || isLoading) return;

    const messageText = text || question;
    setIsLoading(true);

    cleanupMessageHandler(); // Stop any previous message handler
    cleanupAnimation(); // Stop any ongoing typing animation

    const userMessageId = uuidv4();
    const assistantMessageId = uuidv4(); // Unique ID for the new assistant message

    // 1. Add user message
    setMessages(prev => {
        const newMessages = [...prev, { content: messageText, role: "user", id: userMessageId }];
        // After adding user message, always scroll to bottom
        scrollToBottom(); // <-- Always scroll when user sends a message
        return newMessages;
    });


    // 2. Prepare for new assistant response: Reset states and add placeholder
    setCurrentAssistantMessageId(assistantMessageId);
    setRawIncomingBuffer("");
    setDisplayedContent("");
    setChunksReceivedCount(0); // Reset chunks received count for the new message
    setMessages(prev => {
        const newMessages = [...prev, { content: "", role: "assistant", id: assistantMessageId }]; // Placeholder for the new message
        if (isAtBottom) { // If user was at bottom when assistant started, scroll
            scrollToBottom();
        }
        return newMessages;
    });


    socket.send(messageText);
    setQuestion("");

    try {
      const messageHandler = (event: MessageEvent) => {
        setIsLoading(false);
        const data = String(event.data);

        // Append new data to the raw buffer
        setRawIncomingBuffer(prev => prev + data);
        setChunksReceivedCount(prev => prev + 1); // Increment chunk count

        // If it's the end of the stream, handle final state
        if (data.includes("[END]")) {
          // The useEffect will pick this up and finalize the message
          // No need to reset here, let the useEffect handle it after full display and commit
        }
      };

      messageHandlerRef.current = messageHandler;
      socket.addEventListener("message", messageHandler);
    } catch (error) {
      console.error("WebSocket error:", error);
      setIsLoading(false);
      cleanupMessageHandler();
      cleanupAnimation();
      // Reset states on error
      setCurrentAssistantMessageId(null);
      setRawIncomingBuffer("");
      setDisplayedContent("");
      setChunksReceivedCount(0); // Reset chunks received count on error
    }
  }

  return (
    <div className="flex flex-col min-w-0 h-dvh bg-background">
      <Header/>
      <div className="flex flex-col min-w-0 gap-6 flex-1 overflow-y-scroll pt-4" ref={messagesContainerRef}>
        {messages.length === 0 && <Overview />}
        {messages.map((msg, index) => (
          // Use message ID for key. If msg.id is not available (shouldn't happen for new messages), fallback to index.
          <PreviewMessage key={msg.id || index} message={msg} />
        ))}
        {/* Conditional rendering for the ThreeDot loader */}
        {isLoading && (
          <div className="flex justify-center py-4"> {/* Center the loader */}
            <ThreeDot color={["#373c37", "#505650", "#687168", "#818b81"]} />
          </div>
        )}
        <div ref={messagesEndRef} className="shrink-0 min-w-[24px] min-h-[24px]"/>
      </div>
      <div className="flex mx-auto px-4 bg-background pb-4 md:pb-6 gap-2 w-full md:max-w-3xl">
        <ChatInput
          question={question}
          setQuestion={setQuestion}
          onSubmit={handleSubmit}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
};