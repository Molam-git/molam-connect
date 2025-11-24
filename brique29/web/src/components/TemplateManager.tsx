import { useEffect, useState } from 'react';
import { Template } from '../types/templates';
import { templateAPI } from '../services/api';

export default function TemplateManager() {
    const [templates, setTemplates] = useState<Template[]>([]);
    const [filterKey, setFilterKey] = useState('wallet.topup.success');
    const [loading, setLoading] = useState(false);
    const [previewData, setPreviewData] = useState({
        key: 'wallet.topup.success',
        lang: 'fr',
        channel: 'sms' as const,
        amount: '1000',
        currency: 'XOF',
        user_name: 'John Doe'
    });

    const [previewResult, setPreviewResult] = useState('');

    useEffect(() => {
        loadTemplates();
    }, [filterKey]);

    const loadTemplates = async () => {
        setLoading(true);
        try {
            const data = await templateAPI.listTemplates(filterKey);
            setTemplates(data);
        } catch (error) {
            console.error('Failed to load templates:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleActivate = async (templateId: string) => {
        try {
            await templateAPI.activateTemplate(templateId);
            loadTemplates(); // Reload to reflect changes
        } catch (error) {
            console.error('Failed to activate template:', error);
            alert('Erreur lors de l\'activation du template');
        }
    };

    const handlePreview = async () => {
        try {
            const result = await templateAPI.renderTemplate(
                previewData.key,
                previewData.lang,
                previewData.channel,
                {
                    amount: previewData.amount,
                    currency: previewData.currency,
                    user_name: previewData.user_name
                }
            );
            setPreviewResult(result.rendered);
        } catch (error) {
            console.error('Preview failed:', error);
            setPreviewResult('Erreur lors du preview');
        }
    };

    return (
        <div className="p-6 bg-white min-h-screen">
            <h1 className="text-2xl font-semibold mb-6 text-gray-900">Gestionnaire de Templates de Notification</h1>

            {/* Preview Section */}
            <div className="mb-8 p-4 border rounded-lg bg-gray-50">
                <h2 className="text-lg font-medium mb-4">Preview Template</h2>
                <div className="grid grid-cols-2 gap-4 mb-4">
                    <input
                        value={previewData.key}
                        onChange={e => setPreviewData({ ...previewData, key: e.target.value })}
                        placeholder="Template Key"
                        className="border rounded px-3 py-2"
                    />
                    <select
                        value={previewData.lang}
                        onChange={e => setPreviewData({ ...previewData, lang: e.target.value })}
                        className="border rounded px-3 py-2"
                    >
                        <option value="fr">Français</option>
                        <option value="en">English</option>
                        <option value="wo">Wolof</option>
                        <option value="ar">Arabe</option>
                    </select>
                    <select
                        value={previewData.channel}
                        onChange={e => setPreviewData({ ...previewData, channel: e.target.value as any })}
                        className="border rounded px-3 py-2"
                    >
                        <option value="sms">SMS</option>
                        <option value="email">Email</option>
                        <option value="push">Push</option>
                        <option value="ussd">USSD</option>
                        <option value="voice">Voice</option>
                    </select>
                    <input
                        value={previewData.amount}
                        onChange={e => setPreviewData({ ...previewData, amount: e.target.value })}
                        placeholder="Amount"
                        className="border rounded px-3 py-2"
                    />
                    <input
                        value={previewData.currency}
                        onChange={e => setPreviewData({ ...previewData, currency: e.target.value })}
                        placeholder="Currency"
                        className="border rounded px-3 py-2"
                    />
                    <input
                        value={previewData.user_name}
                        onChange={e => setPreviewData({ ...previewData, user_name: e.target.value })}
                        placeholder="User Name"
                        className="border rounded px-3 py-2"
                    />
                </div>
                <button
                    onClick={handlePreview}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                    Preview
                </button>
                {previewResult && (
                    <div className="mt-4 p-3 bg-white border rounded">
                        <strong>Résultat:</strong> {previewResult}
                    </div>
                )}
            </div>

            {/* Filter Section */}
            <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Filtrer par clé de template:
                </label>
                <input
                    value={filterKey}
                    onChange={e => setFilterKey(e.target.value)}
                    className="border rounded px-3 py-2 w-80 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Ex: wallet.topup.success"
                />
            </div>

            {/* Templates Table */}
            {loading ? (
                <div className="text-center py-8">Chargement...</div>
            ) : (
                <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="px-4 py-3 text-left font-medium text-gray-700">Clé</th>
                                <th className="px-4 py-3 text-left font-medium text-gray-700">Canal</th>
                                <th className="px-4 py-3 text-left font-medium text-gray-700">Langue</th>
                                <th className="px-4 py-3 text-left font-medium text-gray-700">Version</th>
                                <th className="px-4 py-3 text-left font-medium text-gray-700">Contenu</th>
                                <th className="px-4 py-3 text-left font-medium text-gray-700">Statut</th>
                                <th className="px-4 py-3 text-left font-medium text-gray-700">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {templates.map(template => (
                                <tr key={template.id} className="border-b hover:bg-gray-50">
                                    <td className="px-4 py-3">{template.template_key}</td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-1 rounded text-xs ${template.channel === 'sms' ? 'bg-green-100 text-green-800' :
                                            template.channel === 'email' ? 'bg-blue-100 text-blue-800' :
                                                template.channel === 'push' ? 'bg-purple-100 text-purple-800' :
                                                    template.channel === 'ussd' ? 'bg-orange-100 text-orange-800' :
                                                        'bg-red-100 text-red-800'
                                            }`}>
                                            {template.channel}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="px-2 py-1 bg-gray-100 rounded text-xs">
                                            {template.lang}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">v{template.version}</td>
                                    <td className="px-4 py-3 max-w-xs truncate" title={template.content}>
                                        {template.content}
                                    </td>
                                    <td className="px-4 py-3">
                                        {template.is_active ? (
                                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                ✅ Actif
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                                ❌ Inactif
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        {!template.is_active && (
                                            <button
                                                className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition-colors"
                                                onClick={() => handleActivate(template.id)}
                                            >
                                                Activer
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {templates.length === 0 && !loading && (
                <div className="text-center py-8 text-gray-500">
                    Aucun template trouvé pour la clé "{filterKey}"
                </div>
            )}
        </div>
    );
}