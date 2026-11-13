export interface V1Tokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface V1UserOut {
  id: string;
  email: string;
  full_name: string;
  role_code: string;
  active: boolean;
}

export interface V1LoginResponse {
  tokens: V1Tokens;
  user: V1UserOut;
}
