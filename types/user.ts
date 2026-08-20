import { Timestamp } from 'firebase/firestore';

export interface User {
  id: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  createdAt?: Timestamp;
  lastLogin?: Timestamp;
  isActive?: boolean;
  role?: string;
}