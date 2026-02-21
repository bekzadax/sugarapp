import './polyfills'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@solana/wallet-adapter-react-ui/styles.css';
import './index.css'
import App from './App.tsx'
import { SolanaWalletProvider } from './providers/SolanaWalletProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SolanaWalletProvider>
      <App />
    </SolanaWalletProvider>
  </StrictMode>,
)
