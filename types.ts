
export enum AppTab {
  DASHBOARD = 'dashboard',
  INVENTORY = 'inventory',
  SALES = 'sales',
  PURCHASES = 'purchases',
  CUSTOMERS = 'customers',
  SUPPLIERS = 'suppliers',
  MANUFACTURING = 'manufacturing',
  CXC = 'cxc',
  CXP = 'cxp',
  EXPENSES = 'expenses',
  REPORTS = 'reports',
  SETTINGS = 'settings',
  PROMOTIONS = 'promotions'
}

export interface CompanyInfo {
  name: string;
  rif: string;
  address: string;
  phone: string;
  logo?: string;
  ownerName?: string;
  email?: string;
  bank?: string;
  mobilePhone?: string;
  dni?: string;
  slogan?: string;
  accountNumber?: string;
}

export interface AppSettings {
  exchangeRate: number;
  lastRateUpdate: string;
  autoUpdateExchangeRate?: boolean;
  exchangeRateSource?: string;
  lastAutoRateCheckDate?: string;
  isManualRate?: boolean;
  manualRateDate?: string;
  darkMode: boolean;
  showLogoOnTicket: boolean;
  showIvaOnTicket: boolean;
  includeQr: boolean;
  ticketHeader?: string;
  ticketFooter?: string;
  aiProvider?: 'gemini' | 'deepseek' | 'openai';
  geminiApiKey?: string;
  geminiModel?: string;
  deepseekApiKey?: string;
  deepseekModel?: string;
  openaiApiKey?: string;
  openaiModel?: string;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  priceUSD: number;
  costUSD: number;
  stock: number;
  minStock: number;
  mermaTotal?: number;
}

export interface Movement {
  id: string;
  date: string;
  productId: string;
  productName: string;
  type: 'sale' | 'purchase' | 'adjustment' | 'merma' | 'restoration' | 'obsequio';
  quantity: number; // Positive for additions, negative for subtractions
  stockAfter: number;
  relatedId?: string;
  customerId?: string;
  customerName?: string;
  promotionId?: string;
  promotionName?: string;
  reason?: string;
}

export interface Customer {
  id: string;
  name: string;
  rif: string;
  phone: string;
  email: string;
  address?: string;
  creditBalanceUSD?: number;
  visitDays?: string[]; // ['L', 'M', 'X', 'J', 'V']
  visitSequence?: number;
}

export interface Supplier {
  id: string;
  name: string;
  rif: string;
  phone: string;
  creditBalanceUSD?: number;
}

export interface Seller {
  id: string;
  name: string;
  phone: string;
  status: 'active' | 'inactive';
}

export interface Payment {
  id: string;
  date: string;
  relatedId: string; // Sale ID or Purchase ID
  entityId: string; // Customer ID or Supplier ID
  amountUSD: number;
  exchangeRate: number;
  type: 'cxc' | 'cxp';
  method?: string;
}

export interface SaleItem {
  productId: string;
  name: string;
  quantity: number;
  priceUSD: number;
}

export interface Sale {
  id: string;
  date: string;
  customerId: string;
  customerName: string;
  sellerId?: string;
  sellerName?: string;
  customerAddress?: string;
  items: SaleItem[];
  totalUSD: number;
  totalBS: number;
  exchangeRate: number;
  status: 'paid' | 'pending';
  type?: 'venta' | 'obsequio' | 'consumo';
  discountUSD?: number;
  initialPaymentUSD?: number;
  paidAmountUSD?: number;
}

export interface PurchaseItem {
  productId: string;
  name: string;
  quantity: number;
  costUSD: number;
}

export interface Purchase {
  id: string;
  date: string;
  supplierId: string;
  supplierName: string;
  items: PurchaseItem[];
  totalUSD: number;
  totalBS: number;
  exchangeRate: number;
  status: 'paid' | 'pending';
  discountUSD?: number;
  initialPaymentUSD?: number;
  paidAmountUSD?: number;
}

export interface Expense {
  id: string;
  date: string;
  description: string;
  category: string;
  amountUSD: number;
  amountBS: number;
  exchangeRate: number;
  paymentMethod: string;
  notes?: string;
}

export interface Ingredient {
  id: string;
  name: string;
  quantity: number;
  unit: 'gramos' | 'mililitros' | 'piezas' | 'kilogramos' | 'litros';
  priceUSD: number;
}

export interface RecipeIngredient {
  ingredientId: string;
  name: string;
  quantity: number;
  unit: string;
  costUSD: number;
}

export interface Recipe {
  id: string;
  name: string;
  ingredients: RecipeIngredient[];
  profitPercentage: number;
  portions: number;
  pricePerPortionUSD: number;
  totalCostUSD: number;
  totalProfitUSD: number;
  totalSaleUSD: number;
  costPerPortionUSD: number;
  profitPerPortionUSD: number;
  preparation?: string;
}

export interface Promotion {
  id: string;
  name: string;
  description: string;
  type: 'docena_13' | 'discount' | 'combo';
  enrollmentType: 'all' | 'manual';
  productId?: string;
  requiredQuantity: number;
  rewardQuantity: number;
  isActive: boolean;
  excludedPromotionIds?: string[];
}

export interface CustomerPromotion {
  id: string;
  customerId: string;
  promotionId: string;
  currentCount: number;
  totalRedeemed: number;
  lastUpdate: string;
}

export type UserRole = 'admin' | 'seller';

export interface User {
  id: string;
  username: string;
  role: UserRole;
  name: string;
  token?: string;
  permissions?: AppTab[];
  password?: string;
}
