// ui/src/components/KycUpload.jsx
import React, { useState, useEffect } from 'react';

// Fonction pour calculer le SHA-256 côté client
async function computeFileHash(file) {
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

export default function KycUpload({ user }) {
    const [policy, setPolicy] = useState([]);
    const [uploading, setUploading] = useState({});

    useEffect(() => {
        fetch(`/api/kyc/policies?country=${user.country}&account_type=${user.account_type}`)
            .then(r => r.json())
            .then(data => setPolicy(data));
    }, [user]);

    async function onUpload(file, docCode) {
        setUploading(prev => ({ ...prev, [docCode]: true }));

        try {
            // Calculer le checksum côté client
            const checksum = await computeFileHash(file);

            const uploadResp = await fetch('/api/kyc/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    document_type_code: docCode,
                    filename: file.name,
                    country: user.country,
                    contentType: file.type
                })
            });

            const { docId, presignedUrl, fields } = await uploadResp.json();

            // Upload vers S3 avec les champs requis pour POST
            const formData = new FormData();
            Object.entries(fields).forEach(([key, value]) => {
                formData.append(key, value);
            });
            formData.append('file', file);

            await fetch(presignedUrl, {
                method: 'POST',
                body: formData
            });

            // Notifier l'API que l'upload est terminé
            await fetch('/api/kyc/finish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ docId, checksum })
            });

        } catch (error) {
            console.error('Upload failed:', error);
        } finally {
            setUploading(prev => ({ ...prev, [docCode]: false }));
        }
    }

    return (
        <div className="kyc-upload">
            <h2>Vérification d'identité</h2>
            <div className="documents-list">
                {policy.map(dt => (
                    <div key={dt.code} className="document-item">
                        <label>{dt.display_name}</label>
                        <input
                            type="file"
                            accept="image/*,.pdf"
                            onChange={(e) => {
                                const file = e.target.files[0];
                                if (file) onUpload(file, dt.code);
                            }}
                            disabled={uploading[dt.code]}
                        />
                        {uploading[dt.code] && <span>Upload en cours...</span>}
                    </div>
                ))}
            </div>
        </div>
    );
}