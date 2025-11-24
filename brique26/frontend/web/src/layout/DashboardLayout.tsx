import React from "react";
import { NavLink } from "react-router-dom";
import { BarChart3, Database } from "lucide-react";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen flex flex-col bg-gray-50 text-gray-900">
            {/* Header */}
            <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b shadow-sm p-4 flex justify-between items-center">
                <h1 className="text-xl font-semibold">Molam • Ops</h1>
                <nav className="flex gap-4">
                    <NavLink
                        to="/agents"
                        className={({ isActive }) =>
                            `flex items-center gap-1 px-3 py-2 rounded-2xl transition ${isActive ? "bg-indigo-600 text-white" : "hover:bg-gray-200"
                            }`
                        }
                    >
                        <BarChart3 size={16} />
                        Agents
                    </NavLink>
                    <NavLink
                        to="/float"
                        className={({ isActive }) =>
                            `flex items-center gap-1 px-3 py-2 rounded-2xl transition ${isActive ? "bg-indigo-600 text-white" : "hover:bg-gray-200"
                            }`
                        }
                    >
                        <Database size={16} />
                        Float Ops
                    </NavLink>
                </nav>
            </header>

            {/* Content */}
            <main className="flex-1 p-6">{children}</main>

            {/* Footer */}
            <footer className="p-4 text-xs text-center text-gray-500 border-t">
                © {new Date().getFullYear()} Molam. CGU • Confidentialité • Mentions légales
            </footer>
        </div>
    );
}