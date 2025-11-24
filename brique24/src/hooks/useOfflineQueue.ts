import { useState, useCallback } from 'react';

export function useOfflineQueue() {
    const [queue, setQueue] = useState<any[]>([]);

    const addToQueue = useCallback((action: any) => {
        setQueue(prev => [...prev, { ...action, id: Date.now(), retries: 0 }]);
    }, []);

    const processQueue = useCallback(async () => {
        // Implémentation de la logique de traitement de la file d'attente hors ligne
        console.log('Processing offline queue:', queue);
    }, [queue]);

    return { queue, addToQueue, processQueue };
}