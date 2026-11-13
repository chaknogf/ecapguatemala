import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Product {
  id: number;
  sku: string;
  name: string;
  category: string;
  stock: number;
  minStock: number;
  unit: string;
  createdAt: string;
}

export interface Movement {
  id: number;
  documentId: string | null;
  type: 'entrada' | 'salida';
  quantity: number;
  note: string | null;
  counterparty?: string | null;
  description?: string | null;
  productId: number;
  createdAt: string;
  productName?: string;
  productSku?: string;
}

export interface DocumentItem {
  productId: number;
  productName: string;
  productSku: string;
  unit: string;
  quantity: number;
  note: string | null;
}

export interface Doc {
  id: string;
  type: 'entrada' | 'salida';
  counterparty: string | null;
  description: string | null;
  createdAt: string;
  itemCount: number;
  totalQuantity: number;
  items: DocumentItem[];
}

@Injectable({ providedIn: 'root' })
export class InventoryService {
  private readonly http = inject(HttpClient);
  private readonly api = `${environment.apiUrl}/api`;

  getProducts(): Observable<Product[]> {
    return this.http
      .get<{ products: Product[] }>(`${this.api}/products`)
      .pipe(map((res) => res.products));
  }

  getMovements(): Observable<Movement[]> {
    return this.http
      .get<{ movements: Movement[] }>(`${this.api}/movements`)
      .pipe(map((res) => res.movements));
  }

  createMovement(input: {
    type: 'entrada' | 'salida';
    quantity: number;
    productId: number;
    note?: string;
  }): Observable<{ movement: Movement; product: Product }> {
    return this.http.post<{ movement: Movement; product: Product }>(
      `${this.api}/movements`,
      input
    );
  }

  createProduct(input: {
    sku: string;
    name: string;
    category: string;
    stock?: number;
    minStock?: number;
    unit?: string;
  }): Observable<{ product: Product }> {
    return this.http.post<{ product: Product }>(`${this.api}/products`, input);
  }

  getDocuments(): Observable<Doc[]> {
    return this.http
      .get<{ documents: Doc[] }>(`${this.api}/documents`)
      .pipe(map((res) => res.documents));
  }

  createDocument(input: {
    type: 'entrada' | 'salida';
    counterparty?: string;
    description?: string;
    items: { productId: number; quantity: number; note?: string }[];
  }): Observable<{ document: Doc }> {
    return this.http.post<{ document: Doc }>(`${this.api}/documents`, input);
  }

  getDocument(id: string): Observable<{ document: Doc }> {
    return this.http.get<{ document: Doc }>(`${this.api}/documents/${id}`);
  }

  deleteDocument(id: string): Observable<{ deleted: { id: string; type: string; itemCount: number; totalQuantity: number } }> {
    return this.http.delete<{ deleted: { id: string; type: string; itemCount: number; totalQuantity: number } }>(
      `${this.api}/documents/${id}`
    );
  }

  updateProduct(
    id: number,
    input: {
      name: string;
      category: string;
      stock?: number;
      minStock?: number;
      unit?: string;
    }
  ): Observable<{ product: Product }> {
    return this.http.patch<{ product: Product }>(`${this.api}/products/${id}`, input);
  }
}
