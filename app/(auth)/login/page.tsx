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

    // El aviso de cierre de sesión es informativo, no un error
    const isInfoMessage = error === "Has cerrado sesión correctamente.";

    return (
        <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr] bg-white">
            {/* Panel de marca */}
            <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-gradient-to-br from-[#8f0f1d] via-[#b3162a] to-[#d42a3c] p-12 text-white">
                {/* Patrón de circuito sutil */}
                <svg className="absolute inset-0 h-full w-full opacity-[0.08]" aria-hidden="true">
                    <defs>
                        <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
                            <path d="M48 0H0V48" fill="none" stroke="white" strokeWidth="1" />
                            <circle cx="0" cy="0" r="2.5" fill="white" />
                        </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#grid)" />
                </svg>
                <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-white/10 blur-3xl" aria-hidden="true" />
                <div className="absolute -bottom-40 -left-24 h-[28rem] w-[28rem] rounded-full bg-[#f5c518]/20 blur-3xl" aria-hidden="true" />

                <div className="relative">
                    <div className="inline-flex rounded-xl bg-white px-4 py-3 shadow-lg shadow-black/10">
                        <Image src="/logo.png" alt="Computadores de la Costa" width={180} height={64} className="h-10 w-auto object-contain" priority />
                    </div>
                </div>

                <div className="relative max-w-md">
                    <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium ring-1 ring-inset ring-white/20">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#f5c518]" />
                        Panel administrativo
                    </p>
                    <h2 className="text-4xl font-semibold leading-tight tracking-tight">
                        Gestiona tu tienda desde un solo lugar.
                    </h2>
                    <p className="mt-4 text-base text-white/75">
                        Catálogo, pedidos, facturación electrónica y atención al cliente, sincronizados en tiempo real.
                    </p>
                    <ul className="mt-8 space-y-3 text-sm text-white/85">
                        {["Inventario y precios sincronizados con Shopify", "Facturación electrónica integrada al ERP", "Chat con clientes en tiempo real"].map((item) => (
                            <li key={item} className="flex items-center gap-3">
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/15">
                                    <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" /></svg>
                                </span>
                                {item}
                            </li>
                        ))}
                    </ul>
                </div>

                <p className="relative text-xs text-white/60">© {new Date().getFullYear()} Computadores de la Costa</p>
            </aside>

            {/* Formulario */}
            <main className="flex items-center justify-center px-6 py-12 sm:px-12">
                <div className="w-full max-w-sm">
                    <div className="lg:hidden mb-10 flex justify-center">
                        <Image src="/logo.png" alt="Computadores de la Costa" width={220} height={80} className="h-14 w-auto object-contain" priority />
                    </div>

                    <div className="mb-8">
                        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Iniciar sesión</h1>
                        <p className="mt-1.5 text-sm text-gray-500">Ingresa tus credenciales para acceder al panel.</p>
                    </div>

                    {error && (
                        <div
                            role={isInfoMessage ? "status" : "alert"}
                            className={`mb-6 flex items-start gap-3 rounded-lg border p-3 text-sm ${
                                isInfoMessage
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                    : "border-red-200 bg-red-50 text-red-800"
                            }`}
                        >
                            <svg className={`mt-0.5 h-4 w-4 shrink-0 ${isInfoMessage ? "text-emerald-600" : "text-red-600"}`} fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                            </svg>
                            <p className="font-medium">{error}</p>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="space-y-1.5">
                            <label htmlFor="usuario" className="block text-sm font-medium text-gray-700">
                                Usuario
                            </label>
                            <div className="relative group">
                                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                                    <svg className="h-[18px] w-[18px] text-gray-400 transition-colors group-focus-within:text-[#b3162a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                    </svg>
                                </div>
                                <input
                                    id="usuario"
                                    name="usuario"
                                    type="text"
                                    required
                                    autoFocus
                                    value={credentials.usuario}
                                    onChange={handleChange}
                                    className="h-11 w-full rounded-lg border border-gray-300 bg-white pl-10 pr-3 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 transition focus:border-[#b3162a] focus:outline-none focus:ring-4 focus:ring-[#b3162a]/10"
                                    placeholder="Tu usuario"
                                    autoComplete="username"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label htmlFor="contraseña" className="block text-sm font-medium text-gray-700">
                                Contraseña
                            </label>
                            <div className="relative group">
                                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                                    <svg className="h-[18px] w-[18px] text-gray-400 transition-colors group-focus-within:text-[#b3162a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                    </svg>
                                </div>
                                <input
                                    id="contraseña"
                                    name="contraseña"
                                    type={showPassword ? "text" : "password"}
                                    required
                                    value={credentials.contraseña}
                                    onChange={handleChange}
                                    className="h-11 w-full rounded-lg border border-gray-300 bg-white pl-10 pr-11 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 transition focus:border-[#b3162a] focus:outline-none focus:ring-4 focus:ring-[#b3162a]/10"
                                    placeholder="••••••••"
                                    autoComplete="current-password"
                                />
                                <button
                                    type="button"
                                    onClick={togglePasswordVisibility}
                                    className="absolute inset-y-0 right-0 flex items-center rounded-r-lg px-3 text-gray-400 transition-colors hover:text-gray-700 focus:outline-none focus-visible:text-[#b3162a]"
                                    aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                                >
                                    {showPassword ? (
                                        <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                                        </svg>
                                    ) : (
                                        <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                        </svg>
                                    )}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading || isTemporarilyDisabled}
                            className="group flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#b3162a] px-4 text-sm font-semibold text-white shadow-sm shadow-[#b3162a]/30 transition hover:bg-[#9a1324] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#b3162a]/25 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-gray-300 disabled:shadow-none"
                        >
                            {isLoading ? (
                                <>
                                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                                    </svg>
                                    Verificando...
                                </>
                            ) : (
                                <>
                                    Iniciar sesión
                                    <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                    </svg>
                                </>
                            )}
                        </button>
                    </form>

                    <p className="mt-10 text-center text-xs text-gray-400">
                        Acceso restringido a personal autorizado.
                    </p>
                </div>
            </main>
        </div>
    );
}

function LoginSkeleton() {
    return (
        <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr] bg-white">
            <div className="hidden lg:block bg-gradient-to-br from-[#8f0f1d] via-[#b3162a] to-[#d42a3c]" />
            <div className="flex items-center justify-center px-6">
                <div className="w-full max-w-sm space-y-5 animate-pulse">
                    <div className="h-7 w-40 rounded-md bg-gray-200" />
                    <div className="h-4 w-64 rounded bg-gray-100" />
                    <div className="h-11 rounded-lg bg-gray-100" />
                    <div className="h-11 rounded-lg bg-gray-100" />
                    <div className="h-11 rounded-lg bg-gray-200" />
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