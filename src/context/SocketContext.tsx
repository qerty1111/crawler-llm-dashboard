import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { FactClassified } from '../types';

export type ConnectionStatus = 'online' | 'reconnecting' | 'offline';

interface SocketContextType {
  status: ConnectionStatus;
  lastMessageTime: Date | null;
  feedItems: FactClassified[];
  isFeedPaused: boolean;
  unreadFeedCount: number;
  pauseFeed: () => void;
  resumeFeed: () => void;
  kpiTick: any;
  healthData: any;
  chartPoint: any;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, scoreThreshold } = useAuth();
  const [status, setStatus] = useState<ConnectionStatus>('offline');
  const [lastMessageTime, setLastMessageTime] = useState<Date | null>(null);
  const [feedItems, setFeedItems] = useState<FactClassified[]>([]);
  const [isFeedPaused, setIsFeedPaused] = useState<boolean>(false);
  const [unreadBuffer, setUnreadBuffer] = useState<FactClassified[]>([]);
  const [kpiTick, setKpiTick] = useState<any>(null);
  const [healthData, setHealthData] = useState<any>(null);
  const [chartPoint, setChartPoint] = useState<any>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectDelayRef = useRef<number>(1000);

  const isFeedPausedRef = useRef(isFeedPaused);
  useEffect(() => {
    isFeedPausedRef.current = isFeedPaused;
  }, [isFeedPaused]);

  const connect = useCallback(() => {
    if (!user) {
      if (socketRef.current) {
        socketRef.current.close();
      }
      setStatus('offline');
      return;
    }

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      return;
    }

    setStatus('reconnecting');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host; // Vite proxies /ws to :3001
    const wsUrl = `${protocol}//${host}/ws`;

    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      setStatus('online');
      reconnectDelayRef.current = 1000; // reset backoff

      // Send subscription packet
      ws.send(JSON.stringify({
        type: 'subscribe',
        channels: ['kpi', 'feed', 'health', 'chart'],
        userId: user.id,
        userRole: user.role,
        threshold: scoreThreshold,
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        setLastMessageTime(new Date());

        if (msg.type === 'feed_item' && msg.data) {
          const item: FactClassified = msg.data;

          if (isFeedPausedRef.current) {
            setUnreadBuffer(prev => [item, ...prev].slice(0, 50));
          } else {
            setFeedItems(prev => [item, ...prev].slice(0, 100));
          }
        } else if (msg.type === 'kpi_tick') {
          setKpiTick(msg.data);
        } else if (msg.type === 'health') {
          setHealthData(msg.data);
        } else if (msg.type === 'chart_point') {
          setChartPoint(msg.data);
        }
      } catch (err) {
        // ignore
      }
    };

    ws.onclose = () => {
      setStatus('offline');
      socketRef.current = null;

      // Exponential backoff reconnect
      if (user) {
        setStatus('reconnecting');
        const delay = Math.min(reconnectDelayRef.current * 1.5, 10000);
        reconnectDelayRef.current = delay;
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      }
    };

    ws.onerror = () => {
      setStatus('offline');
    };
  }, [user, scoreThreshold]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [connect]);

  // When scoreThreshold changes, send updated threshold to WS
  useEffect(() => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN && user) {
      socketRef.current.send(JSON.stringify({
        type: 'subscribe',
        channels: ['kpi', 'feed', 'health', 'chart'],
        userId: user.id,
        userRole: user.role,
        threshold: scoreThreshold,
      }));
    }
  }, [scoreThreshold, user]);

  const pauseFeed = () => {
    setIsFeedPaused(true);
  };

  const resumeFeed = () => {
    setIsFeedPaused(false);
    if (unreadBuffer.length > 0) {
      setFeedItems(prev => [...unreadBuffer, ...prev].slice(0, 100));
      setUnreadBuffer([]);
    }
  };

  return (
    <SocketContext.Provider
      value={{
        status,
        lastMessageTime,
        feedItems,
        isFeedPaused,
        unreadFeedCount: unreadBuffer.length,
        pauseFeed,
        resumeFeed,
        kpiTick,
        healthData,
        chartPoint,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};
