/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_WS_URL: string
    readonly VITE_API_URL: string
    // plus de variables d'environnement...
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}