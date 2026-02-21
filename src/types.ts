export interface User {
  email: string;
  role: 'user' | 'admin';
}

export interface Component {
  id: number;
  category: string;
  description: string;
  mpn: string;
  make: string;
  unit_price_inr: number;
  unit_price_usd: number;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}
