// src/services/operatorService.ts
import { OperatorModel } from '../models/Operator';
import { TelecomOperator } from '../types/topup';

export class OperatorService {
    static async getOperatorsByCountry(countryCode: string): Promise<TelecomOperator[]> {
        if (!countryCode || countryCode.length !== 2) {
            throw new Error('Invalid country code');
        }

        return await OperatorModel.findByCountry(countryCode.toUpperCase());
    }
}