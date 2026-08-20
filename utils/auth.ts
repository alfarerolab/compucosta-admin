import { auth, db } from '@/lib/firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, User as FirebaseUser } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, updateDoc } from 'firebase/firestore';

export async function registerUser(email: string, password: string, userData: Record<string, any> = {}) {
  try {
    // Registrar usuario con Firebase Auth
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // Guardar datos adicionales en Firestore
    await setDoc(doc(db, 'users', user.uid), {
      email: user.email,
      displayName: userData.displayName || null,
      photoURL: user.photoURL,
      createdAt: serverTimestamp(),
      lastLogin: serverTimestamp(),
      isActive: true,
      role: userData.role || 'user',
      ...userData
    });
    
    return user;
  } catch (error) {
    console.error('Error al registrar usuario:', error);
    throw error;
  }
}

export async function loginUser(email: string, password: string) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // Actualizar último login
    await updateDoc(doc(db, 'users', user.uid), {
      lastLogin: serverTimestamp(),
      isActive: true
    });
    
    return user;
  } catch (error) {
    console.error('Error al iniciar sesión:', error);
    throw error;
  }
}

export function getCurrentUser(): Promise<FirebaseUser | null> {
  return new Promise((resolve) => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      unsubscribe();
      resolve(user);
    });
  });
}