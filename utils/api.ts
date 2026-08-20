// utils/api.ts

export class TokenExpiredError extends Error {
    constructor(message = 'Token expirado') {
        super(message);
        this.name = 'TokenExpiredError';
    }
}

export async function authenticatedFetch(url: string, options: RequestInit = {}) {
    const token = localStorage.getItem('token');

    // Verificar si el token está expirado antes de hacer la petición
    if (token) {
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            const currentTime = Math.floor(Date.now() / 1000);
            
            if (payload.exp && payload.exp < currentTime) {
                // Token expirado, limpiar y redirigir
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.location.href = '/login?expired=true';
                throw new TokenExpiredError();
            }
        } catch (e) {
            if (e instanceof TokenExpiredError) {
                throw e;
            }
            // Token malformado, limpiar
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/login?expired=true';
            throw new TokenExpiredError();
        }
    }

    // Agregar el token a los headers
    const headers = {
        ...options.headers,
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    };

    const response = await fetch(url, {
        ...options,
        headers,
    });

    // Manejar respuesta 401 (no autorizado)
    if (response.status === 401) {
        const data = await response.json().catch(() => ({}));
        
        if (data.error === 'TOKEN_EXPIRED' || data.message?.includes('expirado')) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/login?expired=true';
            throw new TokenExpiredError();
        }
    }

    return response;
}

// Hook de React para usar en componentes
export function useAuthenticatedFetch() {
    return authenticatedFetch;
}