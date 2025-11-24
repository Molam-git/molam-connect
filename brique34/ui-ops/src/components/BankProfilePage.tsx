// ui-ops/src/components/BankProfilePage.tsx
import React, { useState, useEffect } from 'react';

interface BankProfile {
    id: string;
    name: string;
    country: string;
    currency_codes: string[];
    compliance_level: string;
    // ... autres champs
}

export const BankProfilePage: React.FC = () => {
    const [profiles, setProfiles] = useState<BankProfile[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchBankProfiles();
    }, []);

    const fetchBankProfiles = async () => {
        try {
            const response = await fetch('/api/treasury/bank_profiles');
            const data = await response.json();
            setProfiles(data);
        } catch (error) {
            console.error('Error fetching bank profiles:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div>Loading...</div>;

    return (
        <div className="container mx-auto p-6">
            <h1 className="text-2xl font-bold mb-6">Bank Profiles</h1>

            <div className="grid grid-cols-1 gap-6">
                {profiles.map(profile => (
                    <div key={profile.id} className="bg-white rounded-lg shadow p-6">
                        <h2 className="text-xl font-semibold">{profile.name}</h2>
                        <p className="text-gray-600">{profile.country}</p>
                        <div className="mt-4">
                            <span className={`px-2 py-1 rounded text-sm ${profile.compliance_level === 'verified'
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-yellow-100 text-yellow-800'
                                }`}>
                                {profile.compliance_level}
                            </span>
                        </div>
                        <div className="mt-4">
                            <h3 className="font-medium">Supported Currencies:</h3>
                            <div className="flex flex-wrap gap-2 mt-2">
                                {profile.currency_codes.map(currency => (
                                    <span key={currency} className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm">
                                        {currency}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};