import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import DashboardLayout from "./layout/DashboardLayout";
import AgentDashboard from "./pages/AgentDashboard";
import FloatOps from "./pages/FloatOps";

export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route
                    path="/"
                    element={
                        <DashboardLayout>
                            <Navigate to="/agents" replace />
                        </DashboardLayout>
                    }
                />
                <Route
                    path="/agents"
                    element={
                        <DashboardLayout>
                            <AgentDashboard />
                        </DashboardLayout>
                    }
                />
                <Route
                    path="/float"
                    element={
                        <DashboardLayout>
                            <FloatOps />
                        </DashboardLayout>
                    }
                />
            </Routes>
        </BrowserRouter>
    );
}