"use client";

import { useEffect, useRef, useState } from "react";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

export default function ChatView() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<string>("Connecting...");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<WebSocket | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const socket = new WebSocket("ws://localhost:3000/api/terminal");
    socketRef.current = socket;

    socket.onopen = () => {
      setStatus("Connected");
      addMessage("system", "Connected to Claude. How can I help you?");
    };

    socket.onerror = () => {
      setStatus("Connection error");
      addMessage("system", "Connection error occurred.");
    };

    socket.onclose = () => {
      setStatus("Disconnected");
      addMessage("system", "Disconnected from Claude.");
    };

    socket.onmessage = (e) => {
      const data = e.data;
      // Filter out terminal control characters and prompts
      const cleanData = data
        .replace(/\x1b\[[0-9;]*m/g, "") // Remove ANSI color codes
        .replace(/\x1b\[.*?[A-Za-z]/g, "") // Remove other ANSI sequences
        .trim();

      if (cleanData && cleanData.length > 0) {
        setIsTyping(false);
        addMessage("assistant", cleanData);
      }
    };

    return () => {
      socket.close();
    };
  }, []);

  const addMessage = (role: "user" | "assistant" | "system", content: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).substr(2, 9),
        role,
        content,
        timestamp: new Date(),
      },
    ]);
  };

  const sendMessage = () => {
    if (!input.trim() || !socketRef.current) return;

    addMessage("user", input);
    setIsTyping(true);

    // Send to Claude CLI
    socketRef.current.send(input + "\n");
    setInput("");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="h-screen w-full flex flex-col bg-gradient-to-b from-gray-50 to-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-pink-500 rounded-full flex items-center justify-center">
              <span className="text-white font-bold text-lg">C</span>
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-800">Claude</h1>
              <span
                className={`text-xs ${
                  status === "Connected" ? "text-green-600" : "text-yellow-600"
                }`}
              >
                {status}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${
              message.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-[70%] rounded-2xl px-4 py-3 ${
                message.role === "user"
                  ? "bg-blue-500 text-white"
                  : message.role === "system"
                  ? "bg-gray-300 text-gray-700 text-sm italic"
                  : "bg-white text-gray-800 shadow-md border border-gray-200"
              }`}
            >
              <div className="whitespace-pre-wrap break-words">
                {message.content}
              </div>
              <div
                className={`text-xs mt-1 ${
                  message.role === "user" ? "text-blue-100" : "text-gray-500"
                }`}
              >
                {message.timestamp.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-white rounded-2xl px-4 py-3 shadow-md border border-gray-200">
              <div className="flex space-x-2">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="bg-white border-t border-gray-200 px-4 py-4">
        <div className="flex items-end space-x-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message..."
            className="flex-1 resize-none rounded-2xl border border-gray-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows={1}
            style={{ minHeight: "44px", maxHeight: "120px" }}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim()}
            className="bg-blue-500 text-white rounded-2xl px-6 py-3 font-medium hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
