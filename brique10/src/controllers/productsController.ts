// src/controllers/productsController.ts
import { Request, Response } from 'express';
import { ProductService } from '../services/productService';

export const getProducts = async (req: Request, res: Response) => {
    try {
        const { operator_id } = req.query;

        if (!operator_id) {
            return res.status(400).json({ error: 'operator_id parameter is required' });
        }

        const products = await ProductService.getProductsByOperator(operator_id as string);
        res.json(products);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};