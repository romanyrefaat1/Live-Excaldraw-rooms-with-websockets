// hooks/useSocket.js
"use client";

import { useRef, useEffect, createContext, useContext, useState } from 'react';

const WebSocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const eventHandlersRef = useRef(new Map());

  useEffect(() => {
    if (isInitialized) return;

    const initializeWebSocket = () => {
      try {
        console.log('Initializing WebSocket connection...');
        
        // Connect to WebSocket server on port 3001
        const wsUrl = process.env.NODE_ENV === 'production'
          ? `wss://${window.location.host}`
          : 'ws://localhost:3001';

        const newSocket = new WebSocket(wsUrl);

        newSocket.onopen = () => {
          console.log('Connected to WebSocket server');
          setIsConnected(true);
          reconnectAttemptsRef.current = 0;
        };

        newSocket.onclose = (event) => {
          console.log('Disconnected from WebSocket server:', event.code, event.reason);
          setIsConnected(false);
          
          if (event.code !== 1000 && reconnectAttemptsRef.current < maxReconnectAttempts) {
            const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
            console.log(`Attempting to reconnect in ${delay}ms (attempt ${reconnectAttemptsRef.current + 1}/${maxReconnectAttempts})`);
            
            reconnectTimeoutRef.current = setTimeout(() => {
              reconnectAttemptsRef.current++;
              initializeWebSocket();
            }, delay);
          }
        };

        newSocket.onerror = (error) => {
          console.error('WebSocket error:', error);
          setIsConnected(false);
        };

        newSocket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            // Call registered event handlers
            if (eventHandlersRef.current.has(data.type)) {
              const handlers = eventHandlersRef.current.get(data.type);
              handlers.forEach(handler => handler(data));
            }
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };

        setSocket(newSocket);
        setIsInitialized(true);

      } catch (error) {
        console.error('Failed to initialize WebSocket:', error);
        
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current++;
            initializeWebSocket();
          }, delay);
        }
      }
    };

    initializeWebSocket();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (socket) {
        console.log('Cleaning up WebSocket connection...');
        socket.close(1000, 'Component unmounting');
        setSocket(null);
        setIsConnected(false);
        setIsInitialized(false);
      }
    };
  }, [isInitialized]);

  const sendMessage = (type, data) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      const message = JSON.stringify({ type, ...data });
      socket.send(message);
      return true;
    }
    console.warn('WebSocket not connected, message not sent:', type, data);
    return false;
  };

  const addEventListener = (eventType, handler) => {
    if (!eventHandlersRef.current.has(eventType)) {
      eventHandlersRef.current.set(eventType, new Set());
    }
    eventHandlersRef.current.get(eventType).add(handler);
  };

  const removeEventListener = (eventType, handler) => {
    if (eventHandlersRef.current.has(eventType)) {
      eventHandlersRef.current.get(eventType).delete(handler);
    }
  };

  return (
    <WebSocketContext.Provider value={{ 
      socket, 
      isConnected, 
      sendMessage, 
      addEventListener, 
      removeEventListener 
    }}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useSocketContext = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useSocketContext must be used within a SocketProvider');
  }
  return context;
};