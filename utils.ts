
export const getTodayDateString = (d: Date = new Date()): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const calculateBS = (amountUSD: number, status: string, storedRate?: number, currentRate?: number): number => {
  const rate = status === 'paid' ? (storedRate || currentRate || 0) : (currentRate || 0);
  return amountUSD * rate;
};

export const parseNumber = (value: any): number => {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return value;
  
  // Convert to string, replace comma with dot, and parse
  const sanitized = String(value).replace(',', '.');
  const parsed = parseFloat(sanitized);
  
  return isNaN(parsed) ? 0 : parsed;
};

export const searchMatch = (text: string, query: string): boolean => {
  if (!query) return true;
  const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const keywords = normalize(query).split(' ').filter(k => k.length > 0);
  const target = normalize(text);
  return keywords.every(k => target.includes(k));
};
