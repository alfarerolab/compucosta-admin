// lib/wompiService.ts
import axios from 'axios';

const WOMPI_API_URL = 'https://sandbox.wompi.co/v1'; // Cambia a la URL de producción cuando estés listo

export const createPayment = async (amount: number, currency: string) => {
  const response = await axios.post(`${WOMPI_API_URL}/transactions`, {
    amount,
    currency,
    // Otros parámetros necesarios según la documentación de Wompi
  }, {
    headers: {
      'Authorization': `Bearer YOUR_SECRET_KEY`, // Cambia por tu secret key
    },
  });

  return response.data;
};