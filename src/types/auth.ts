export type UserRole = 'super-admin' | 'admin' | 'employee';

export interface JWTPayload {
  userId: string;
  username: string;
  role: UserRole;
  name: string;
}

export interface AuthUser {
  _id: string;
  name: string;
  username: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserInput {
  name: string;
  username: string;
  password: string;
  role: UserRole;
}

export interface UpdateUserInput {
  name?: string;
  username?: string;
  role?: UserRole;
  isActive?: boolean;
}

export interface UpdatePasswordInput {
  currentPassword?: string;
  newPassword: string;
  confirmPassword: string;
}
