import React from 'react'
import ReactDOM from 'react-dom/client'
import { OpsConsole } from './OpsConsole'
import './styles/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <OpsConsole />
    </React.StrictMode>,
)