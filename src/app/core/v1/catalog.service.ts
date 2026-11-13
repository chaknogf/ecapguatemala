import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

const BASE = '/api/v1';

export interface Unit { id: string; code: string; name: string; dimension: string; active: boolean }
export interface Category { id: string; code: string; name: string; parent_id: string | null; active: boolean }
export interface Brand { id: string; code?: string; name: string; manufacturer: string | null; active?: boolean }
export interface Tax { id: string; code: string; name: string; rate: string; included_in_price: boolean; jurisdiction: string; active: boolean }
export interface AttributeDef {
  id: string; code: string; label: string; value_type: 'text' | 'number' | 'date' | 'bool' | 'enum';
  required: boolean; enum_options: string[]; scope_kind: string; scope_ref: string | null; active: boolean;
}
export interface Variant { id: string; sku: string; barcode: string | null; attrs: Record<string, string>; sale_price: string | null; active: boolean }
export interface UnitConv { id: string; unit_id: string; usage: 'stock' | 'purchase' | 'sale'; factor: string }
export interface Product {
  id: string; sku: string; name: string; short_name: string | null; internal_code: string | null;
  barcode: string | null; product_type: 'finished' | 'raw' | 'service' | 'package' | 'kit';
  category_id: string | null; brand_id: string | null; model_ref: string | null;
  cost_avg: string; purchase_cost: string; sale_price: string; min_price: string | null;
  margin_target_pct: string | null; margin_mode: string; tax_id: string | null; tax_treatment: string;
  min_stock: string | null; max_stock: string | null; reorder_point: string | null;
  track_lots: boolean; track_expiry: boolean; track_serials: boolean;
  valuation_method: string; saleable: boolean; purchasable: boolean;
  default_warehouse_id: string | null; usual_supplier_name: string | null; lead_time_days: number | null;
  notes: string | null; extra_attrs: Record<string, unknown>; active: boolean; description?: string | null;
}
export interface ProductDetail extends Product { units: UnitConv[]; variants: Variant[] }

export interface ProductCreatePayload {
  sku: string; name: string; short_name?: string | null; internal_code?: string | null;
  barcode?: string | null; product_type?: string; category_id?: string | null; brand_id?: string | null;
  stock_unit_id?: string | null; purchase_unit_id?: string | null; sale_unit_id?: string | null;
  purchase_cost?: string; sale_price?: string; wholesale_price?: string | null;
  retail_price?: string | null; min_price?: string | null; margin_target_pct?: string | null;
  tax_id?: string | null; tax_treatment?: string;
  min_stock?: string | null; max_stock?: string | null; reorder_point?: string | null;
  suggested_purchase_qty?: string | null; track_lots?: boolean; track_expiry?: boolean;
  track_serials?: boolean; valuation_method?: string; saleable?: boolean; purchasable?: boolean;
  default_warehouse_id?: string | null; usual_supplier_name?: string | null;
  lead_time_days?: number | null; notes?: string | null; extra_attrs?: Record<string, unknown>;
  units?: { unit_id: string; usage: string; factor: string }[];
  variants?: { sku: string; barcode?: string | null; attrs: Record<string, string>; sale_price?: string | null }[];
}

export interface PricingAnalyze {
  cost: string; price_net?: string | null; price_with_tax?: string | null;
  tax_rate_pct?: string; tax_included?: boolean; target_margin_pct?: string | null;
}
export interface PricingResult {
  price_net: string | null; margin_pct: string | null; markup_pct: string | null;
  gross_profit: string | null; suggested_price_for_margin: string | null;
}
export interface LookupResult { product: Product; variant: Variant | null }

@Injectable({ providedIn: 'root' })
export class V1CatalogService {
  private readonly http = inject(HttpClient);

  units() { return this.http.get<Unit[]>(`${BASE}/catalog/units`); }
  categories() { return this.http.get<Category[]>(`${BASE}/catalog/categories`); }
  brands() { return this.http.get<Brand[]>(`${BASE}/catalog/brands`); }
  taxes() { return this.http.get<Tax[]>(`${BASE}/catalog/taxes`); }
  attributes() { return this.http.get<AttributeDef[]>(`${BASE}/catalog/attributes`); }

  createUnit(p: { code: string; name: string; dimension?: string }): Observable<Unit> {
    return this.http.post<Unit>(`${BASE}/catalog/units`, p);
  }
  createCategory(p: { code: string; name: string; parent_id?: string | null }): Observable<Category> {
    return this.http.post<Category>(`${BASE}/catalog/categories`, p);
  }
  createBrand(p: { name: string; manufacturer?: string | null }): Observable<Brand> {
    return this.http.post<Brand>(`${BASE}/catalog/brands`, p);
  }
  createTax(p: { code: string; name: string; rate: string; included_in_price?: boolean }): Observable<Tax> {
    return this.http.post<Tax>(`${BASE}/catalog/taxes`, p);
  }
  createAttribute(p: Partial<AttributeDef> & { code: string; label: string; value_type: string }): Observable<AttributeDef> {
    return this.http.post<AttributeDef>(`${BASE}/catalog/attributes`, { scope_kind: 'company', ...p });
  }

  products(params: { q?: string; category_id?: string; page?: number; size?: number } = {}): Observable<Product[]> {
    let hp = new HttpParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') hp = hp.set(k, String(v)); });
    return this.http.get<Product[]>(`${BASE}/catalog/products`, { params: hp });
  }
  product(id: string): Observable<ProductDetail> {
    return this.http.get<ProductDetail>(`${BASE}/catalog/products/${id}`);
  }
  createProduct(p: ProductCreatePayload): Observable<ProductDetail> {
    return this.http.post<ProductDetail>(`${BASE}/catalog/products`, p);
  }
  updateProduct(id: string, p: Partial<ProductCreatePayload> & { active?: boolean }): Observable<ProductDetail> {
    return this.http.patch<ProductDetail>(`${BASE}/catalog/products/${id}`, p);
  }
  lookup(term: string): Observable<LookupResult> {
    return this.http.get<LookupResult>(`${BASE}/catalog/lookup`, { params: { term } });
  }
  analyze(p: PricingAnalyze): Observable<PricingResult> {
    return this.http.post<PricingResult>(`${BASE}/catalog/pricing/analyze`, p);
  }
}
