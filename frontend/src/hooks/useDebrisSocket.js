import { useEffect, useState, useRef } from 'react';

const BACKEND_WS_URL = import.meta.env.VITE_BACKEND_WS_URL || 'ws://localhost:4000';

export function useDebrisSocket() {
  const [debris, setDebris] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [kessler, setKessler] = useState(12.5);
  const [status, setStatus] = useState('connecting');
  
  const socketRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  const connect = () => {
    setStatus('connecting');
    console.log(`[useDebrisSocket] Connecting to WS server at ${BACKEND_WS_URL}...`);
    
    const ws = new WebSocket(BACKEND_WS_URL);
    socketRef.current = ws;

    ws.onopen = () => {
      console.log('[useDebrisSocket] Connected to WS gateway.');
      setStatus('connected');
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const { type, data } = payload;

        switch (type) {
          case 'sys_connect':
            console.log('[useDebrisSocket] Authorized system channel.');
            break;
            
          case 'debris_update':
            // Fast catalog update
            setDebris(data);
            break;

          case 'new_conjunction':
            // Sound the alarm and prepend to alert feed
            setAlerts((prev) => [
              {
                id: Math.random().toString(36).substring(7),
                type: 'HIGH_COLLISION_RISK',
                severity: 'CRITICAL',
                createdAt: new Date().toISOString(),
                payload: data
              },
              ...prev
            ]);
            break;

          case 'kessler_update':
            setKessler(data.score);
            break;

          default:
            break;
        }
      } catch (e) {
        console.error('[useDebrisSocket] Error parsing WS payload:', e);
      }
    };

    ws.onerror = (err) => {
      console.error('[useDebrisSocket] Socket encountered an error:', err);
      setStatus('disconnected');
    };

    ws.onclose = () => {
      console.warn('[useDebrisSocket] Socket connection closed. Attempting reconnect in 5s...');
      setStatus('disconnected');
      
      // Auto reconnect
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 5000);
    };
  };

  useEffect(() => {
    connect();

    // Fetch initial log of alerts from DB REST endpoint
    fetch('/api/alerts')
      .then(res => res.json())
      .then(res => {
        if (res.success && res.data) {
          setAlerts(res.data);
        }
      })
      .catch(e => console.error('[useDebrisSocket] Failed to fetch initial alert history:', e));

    return () => {
      if (socketRef.current) {
        socketRef.current.onclose = null; // Prevent triggering reconnect
        socketRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  return { debris, alerts, kessler, status };
}
