// src/services/productService.ts
import { ProductModel } from '../models/Product';
import { TopupProduct } from '../types/topup';

export class ProductService {
  static async getProductsByOperator(operatorId: string): Promise<TopupProduct[]> {
    if (!operatorId) {
      throw new Error('Operator ID is required');
    }
    
    return await ProductModel.findByOperator(operatorId);
  }
}