import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugify(text: string): string {
  return text
    .toLowerCase() // Convertir todo a minúsculas
    .replace(/\s+/g, '-') // Reemplazar los espacios por guiones
    .replace(/[^\w\-]+/g, '') // Eliminar caracteres no alfanuméricos ni guiones
    .replace(/\-\-+/g, '-') // Reemplazar guiones múltiples por uno solo
    .trim(); // Eliminar espacios al inicio y al final
}

