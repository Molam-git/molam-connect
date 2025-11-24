import { useMemo } from 'react';
import { explainFee } from '../api/fees';
export function useFees(kind: 'P2P' | 'CASHIN_SELF' | 'CASHIN_OTHER' | 'CASHOUT' | 'BILL' | 'MERCHANT', amount: number) {
    return useMemo(() => explainFee(kind, amount, 'USD'), [kind, amount]);
}