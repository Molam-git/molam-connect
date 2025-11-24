// src/controllers/operatorsController.ts
import { Request, Response } from 'express';
import { OperatorService } from '../services/operatorService';

export const getOperators = async (req: Request, res: Response) => {
    try {
        const { country_code } = req.query;

        if (!country_code) {
            return res.status(400).json({ error: 'country_code parameter is required' });
        }

        const operators = await OperatorService.getOperatorsByCountry(country_code as string);
        res.json(operators);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};