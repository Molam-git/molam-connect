import React, { useState } from 'react';

interface ApprovalModalProps {
    payout: any;
    isOpen: boolean;
    onClose: () => void;
    onApprove: (decision: string, comments: string) => void;
}

export const ApprovalModal: React.FC<ApprovalModalProps> = ({
    payout,
    isOpen,
    onClose,
    onApprove
}) => {
    const [comments, setComments] = useState('');
    const [decision, setDecision] = useState<'approved' | 'rejected'>('approved');

    if (!isOpen) return null;

    const handleSubmit = () => {
        onApprove(decision, comments);
        setComments('');
        onClose();
    };

    return (
        <div className="modal-overlay">
            <div className="modal">
                <h2>Approve Payout</h2>
                <div>
                    <p><strong>Reference:</strong> {payout.reference_code}</p>
                    <p><strong>Amount:</strong> {payout.amount} {payout.currency}</p>
                    <p><strong>Beneficiary:</strong> {payout.beneficiary.name}</p>
                </div>
                <div>
                    <label>
                        Decision:
                        <select value={decision} onChange={(e) => setDecision(e.target.value as any)}>
                            <option value="approved">Approve</option>
                            <option value="rejected">Reject</option>
                        </select>
                    </label>
                </div>
                <div>
                    <label>
                        Comments:
                        <textarea
                            value={comments}
                            onChange={(e) => setComments(e.target.value)}
                            rows={3}
                        />
                    </label>
                </div>
                <div className="modal-actions">
                    <button onClick={onClose}>Cancel</button>
                    <button onClick={handleSubmit}>Submit</button>
                </div>
            </div>
        </div>
    );
};