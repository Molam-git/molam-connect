import React from 'react';
import { PayoutWorkbench } from '../components/PayoutWorkbench';

const ApprovalsPage: React.FC = () => {
    return (
        <div>
            <h1>Payout Approvals</h1>
            <PayoutWorkbench />
        </div>
    );
};

export default ApprovalsPage;