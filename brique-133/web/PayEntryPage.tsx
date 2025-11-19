// ============================================================================
// Molam Pay Entry Page - React Web/PWA
// ============================================================================

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

interface PayEntryData {
  user_id: string;
  preferred_module?: string;
  last_module_used?: string;
  modules_enabled: string[];
  auto_redirect: boolean;
  redirect_target?: string;
  locale: string;
}

export default function PayEntryPage() {
  const navigate = useNavigate();
  const [entry, setEntry] = useState<PayEntryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEntry();
    trackAccess();
  }, []);

  async function fetchEntry() {
    try {
      const res = await fetch("/api/pay/entry", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("authToken")}`,
        },
      });
      const data = await res.json();
      setEntry(data);

      // Auto-redirect if enabled
      if (data.auto_redirect && data.redirect_target) {
        setTimeout(() => {
          navigateToModule(data.redirect_target);
        }, 500);
      }
    } catch (e) {
      console.error("Failed to fetch pay entry:", e);
    } finally {
      setLoading(false);
    }
  }

  async function trackAccess() {
    try {
      await fetch("/api/pay/track", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("authToken")}`,
        },
        body: JSON.stringify({
          module: "pay_entry",
          device_type: "web",
          platform: "browser",
        }),
      });
    } catch (e) {
      console.error("Failed to track access:", e);
    }
  }

  function navigateToModule(module: string) {
    // Track module access
    fetch("/api/pay/track", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("authToken")}`,
      },
      body: JSON.stringify({
        module,
        device_type: "web",
        platform: "browser",
      }),
    });

    // Navigate
    const routes: { [key: string]: string } = {
      wallet: "/wallet",
      connect: "/connect",
      eats: "/eats",
      shop: "/shop",
      talk: "/talk",
      ads: "/ads",
    };

    navigate(routes[module] || "/wallet");
  }

  async function enableModule(module: string) {
    try {
      await fetch(`/api/pay/modules/${module}/enable`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("authToken")}`,
        },
      });
      fetchEntry(); // Refresh
    } catch (e) {
      console.error("Failed to enable module:", e);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-white to-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-gray-600">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-600">Erreur de chargement</p>
      </div>
    );
  }

  // If auto-redirect is enabled, show loading screen
  if (entry.auto_redirect && entry.redirect_target) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-white to-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-gray-600">
            Redirection vers {entry.redirect_target}...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-gray-50 to-blue-50">
      <div className="max-w-6xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold text-gray-900 mb-3">
            Bienvenue sur Molam Pay
          </h1>
          <p className="text-lg text-gray-600">
            Choisissez votre module préféré
          </p>
        </div>

        {/* Main Modules */}
        <div className="flex justify-center gap-8 mb-16">
          {/* Molam Ma (Wallet) */}
          {entry.modules_enabled.includes("wallet") && (
            <button
              onClick={() => navigateToModule("wallet")}
              className="group relative w-64 h-64 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 shadow-2xl hover:shadow-3xl transition-all duration-300 hover:scale-105"
            >
              <div className="absolute inset-0 rounded-full bg-white opacity-0 group-hover:opacity-10 transition-opacity"></div>
              <div className="flex flex-col items-center justify-center h-full">
                <div className="text-6xl mb-4">💳</div>
                <div className="text-2xl font-bold text-white mb-2">
                  Molam Ma
                </div>
                <div className="text-sm text-blue-100">Wallet</div>
              </div>
            </button>
          )}

          {/* Molam Connect */}
          {entry.modules_enabled.includes("connect") && (
            <button
              onClick={() => navigateToModule("connect")}
              className="group relative w-64 h-64 rounded-full bg-gradient-to-br from-green-500 to-green-700 shadow-2xl hover:shadow-3xl transition-all duration-300 hover:scale-105"
            >
              <div className="absolute inset-0 rounded-full bg-white opacity-0 group-hover:opacity-10 transition-opacity"></div>
              <div className="flex flex-col items-center justify-center h-full">
                <div className="text-6xl mb-4">🏪</div>
                <div className="text-2xl font-bold text-white mb-2">
                  Molam Connect
                </div>
                <div className="text-sm text-green-100">Merchants</div>
              </div>
            </button>
          )}
        </div>

        {/* Additional Modules */}
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-semibold text-gray-900 mb-6">
            Autres modules
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { id: "eats", icon: "🍔", name: "Eats" },
              { id: "shop", icon: "🛍️", name: "Shop" },
              { id: "talk", icon: "💬", name: "Talk" },
              { id: "ads", icon: "📢", name: "Ads" },
            ].map((module) => (
              <button
                key={module.id}
                onClick={() =>
                  entry.modules_enabled.includes(module.id)
                    ? navigateToModule(module.id)
                    : enableModule(module.id)
                }
                className={`p-6 rounded-2xl transition-all duration-200 hover:scale-105 ${
                  entry.modules_enabled.includes(module.id)
                    ? "bg-white border-2 border-blue-500 shadow-lg hover:shadow-xl"
                    : "bg-gray-100 border border-gray-300 hover:bg-gray-200"
                }`}
              >
                <div className="text-4xl mb-3">{module.icon}</div>
                <div className="font-semibold text-gray-900 mb-1">
                  {module.name}
                </div>
                {!entry.modules_enabled.includes(module.id) && (
                  <div className="text-xs text-blue-600 font-medium">
                    Activer
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Settings */}
        <div className="mt-12 text-center">
          <button
            onClick={() => navigate("/settings")}
            className="text-gray-600 hover:text-gray-900 text-sm flex items-center justify-center mx-auto gap-2"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            Paramètres
          </button>
        </div>
      </div>
    </div>
  );
}
