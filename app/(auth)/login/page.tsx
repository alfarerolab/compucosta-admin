"use client";

import { Suspense, useState, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";

function Login() {
    const [credentials, setCredentials] = useState({
        usuario: "",
        contraseña: "",
    });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [isTemporarilyDisabled, setIsTemporarilyDisabled] = useState(false);

    const router = useRouter();
    const searchParams = useSearchParams();

    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setCredentials((prev) => ({
            ...prev,
            [name]: value,
        }));
    }, []);

    const togglePasswordVisibility = () => {
        setShowPassword(!showPassword);
    };

    const isLogout = searchParams.get("logout");
    const isExpired = searchParams.get("expired");

    useEffect(() => {
        if (isLogout) {
            setError("Has cerrado sesión correctamente.");
            window.history.replaceState({}, "", "/login");
        }

        if (isExpired === "true") {
            setError("Tu sesión ha expirado. Por favor, inicia sesión nuevamente.");
            window.history.replaceState({}, "", "/login");
        }
    }, [isLogout, isExpired]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (isTemporarilyDisabled) return;

        setError("");
        setIsLoading(true);

        try {
            console.log("📤 [LOGIN] Enviando credenciales:", { usuario: credentials.usuario });

            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Cache-Control": "no-cache",
                },
                credentials: "include",
                body: JSON.stringify(credentials),
                cache: "no-store",
            });

            console.log("📥 [LOGIN] Response status:", res.status);

            let data;
            try {
                data = await res.json();
            } catch (jsonError) {
                console.error("❌ [LOGIN] Error parseando JSON:", jsonError);
                throw new Error("El servidor no respondió correctamente.");
            }

            if (!res.ok) {
                console.error("❌ [LOGIN] Error del servidor:", data);

                if (res.status === 401 || res.status === 400) {
                    setCredentials((prev) => ({ ...prev, contraseña: "" }));
                    setIsTemporarilyDisabled(true);
                    const pwdInput = document.getElementById("contraseña") as HTMLInputElement | null;
                    if (pwdInput) pwdInput.focus();
                    setTimeout(() => setIsTemporarilyDisabled(false), 2000);
                }

                throw new Error(data.message || `Error del servidor: ${res.status}`);
            }

            if (!data.success) {
                console.error("❌ [LOGIN] Respuesta sin success:", data);
                if (res.status === 200 && data.message && /credencial/i.test(String(data.message).toLowerCase())) {
                    setCredentials((prev) => ({ ...prev, contraseña: "" }));
                    setIsTemporarilyDisabled(true);
                    const pwdInput = document.getElementById("contraseña") as HTMLInputElement | null;
                    if (pwdInput) pwdInput.focus();
                    setTimeout(() => setIsTemporarilyDisabled(false), 2000);
                }
                throw new Error(data.message || "Respuesta de login inválida");
            }

            console.log("🎉 [LOGIN] Login exitoso");

            if (data.user) {
                sessionStorage.setItem("user", JSON.stringify(data.user));
            }

            const redirectPath = searchParams.get("from") || "/dashboard";
            console.log("🔄 [LOGIN] Redirigiendo a:", redirectPath);

            setTimeout(() => {
                window.location.href = redirectPath;
            }, 100);
        } catch (err) {
            console.error("💥 [LOGIN] Error en login:", err);

            if (err instanceof Error) {
                setError(err.message);
            } else {
                setError("Error al iniciar sesión. Por favor, intente nuevamente.");
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="h-screen bg-white flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <div className="bg-gray-100/30 backdrop-blur-md border border-red-500/60 rounded-3xl p-8 space-y-6 shadow-lg">
                    <div className="text-center space-y-4">
                        <div className="relative mx-auto w-64 h-32">
                            <Image src="/logo.png" alt="Logo" width={128} height={128} className="w-full h-full object-contain rounded-lg" priority />
                        </div>

                        <div className="space-y-1">
                            <h1 className="text-2xl font-bold text-gray-900">Iniciar Sesión</h1>
                            <p className="text-gray-600 text-sm">Bienvenido al sistema</p>
                        </div>
                    </div>

                    {error && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                            <div className="flex items-center space-x-2">
                                <div className="flex-shrink-0">
                                    <div className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center">
                                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                </div>
                                <p className="text-red-800 text-sm font-medium">{error}</p>
                            </div>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-4">
                            <div className="space-y-1">
                                <label htmlFor="usuario" className="block text-sm font-medium text-gray-700">
                                    Usuario
                                </label>
                                <div className="relative group">
                                    <input
                                        id="usuario"
                                        name="usuario"
                                        type="text"
                                        required
                                        value={credentials.usuario}
                                        onChange={handleChange}
                                        className="w-full px-4 py-3 pl-10 bg-white border border-gray-300 rounded-lg 
                                                                                                     focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 
                                                                                                     hover:border-red-400 transition-all duration-200 text-gray-900 placeholder-gray-500"
                                        placeholder="Ingrese su usuario"
                                        autoComplete="username"
                                    />
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <svg className="h-5 w-5 text-gray-400 group-hover:text-red-500 group-focus-within:text-red-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                        </svg>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label htmlFor="contraseña" className="block text-sm font-medium text-gray-700">
                                    Contraseña
                                </label>
                                <div className="relative group">
                                    <input
                                        id="contraseña"
                                        name="contraseña"
                                        type={showPassword ? "text" : "password"}
                                        required
                                        value={credentials.contraseña}
                                        onChange={handleChange}
                                        className="w-full px-4 py-3 pl-10 pr-10 bg-white border border-gray-300 rounded-lg 
                                                                                                     focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 
                                                                                                     hover:border-red-400 transition-all duration-200 text-gray-900 placeholder-gray-500"
                                        placeholder="Ingrese su contraseña"
                                        autoComplete="current-password"
                                    />
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <svg className="h-5 w-5 text-gray-400 group-hover:text-red-500 group-focus-within:text-red-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                        </svg>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={togglePasswordVisibility}
                                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-red-500 focus:text-red-600 focus:outline-none transition-colors duration-200"
                                        aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                                    >
                                        {showPassword ? (
                                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                                            </svg>
                                        ) : (
                                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                            </svg>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="pt-2">
                            <button
                                type="submit"
                                disabled={isLoading || isTemporarilyDisabled}
                                className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 disabled:from-gray-400 disabled:to-gray-500 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-red-200 disabled:cursor-not-allowed disabled:transform-none"
                            >
                                {isLoading ? (
                                    <div className="flex items-center justify-center space-x-2">
                                        <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        <span>Iniciando sesión...</span>
                                    </div>
                                ) : (
                                    <span className="flex items-center justify-center space-x-2">
                                        <span>Iniciar Sesión</span>
                                        <svg className="w-4 h-4 transform group-hover:translate-x-1 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                        </svg>
                                    </span>
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}

function LoginSkeleton() {
    return (
        <div className="h-screen bg-white flex items-center justify-center p-4">
            <div className="relative w-full max-w-md">
                <div className="bg-white/70 border border-gray-200 rounded-2xl p-8 space-y-6 backdrop-blur-sm">
                    <div className="text-center space-y-4">
                        <div className="mx-auto w-32 h-32 bg-gray-200 rounded-lg animate-pulse"></div>
                        <div className="space-y-1">
                            <div className="h-6 bg-gray-200 rounded-lg animate-pulse mx-auto w-40"></div>
                            <div className="h-4 bg-gray-200 rounded animate-pulse mx-auto w-28"></div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-4">
                            <div className="space-y-1">
                                <div className="h-4 bg-gray-200 rounded animate-pulse w-16"></div>
                                <div className="h-12 bg-gray-200 rounded-lg animate-pulse"></div>
                            </div>
                            <div className="space-y-1">
                                <div className="h-4 bg-gray-200 rounded animate-pulse w-20"></div>
                                <div className="h-12 bg-gray-200 rounded-lg animate-pulse"></div>
                            </div>
                        </div>

                        <div className="h-12 bg-gray-300 rounded-lg animate-pulse"></div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={<LoginSkeleton />}>
            <Login />
        </Suspense>
    );
}