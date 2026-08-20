import { redirect } from 'next/navigation';

export default function Home() {
  // Redirige inmediatamente al login
  redirect('/login');
}