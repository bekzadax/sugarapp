import { useMemo, type ReactNode } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { SolanaMobileWalletAdapter, createDefaultAddressSelector, createDefaultAuthorizationResultCache, createDefaultWalletNotFoundHandler } from '@solana-mobile/wallet-adapter-mobile';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { clusterApiUrl } from '@solana/web3.js';

type SolanaWalletProviderProps = {
  children: ReactNode;
};

export function SolanaWalletProvider({ children }: SolanaWalletProviderProps) {
  const network = WalletAdapterNetwork.Mainnet;
  const endpoint =
    (import.meta.env.VITE_SOLANA_RPC_URL as string | undefined) || clusterApiUrl(network);
  const appOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://sugar-app.xyz';

  const wallets = useMemo(
    () => [
      new SolanaMobileWalletAdapter({
        addressSelector: createDefaultAddressSelector(),
        appIdentity: {
          name: 'SUGAR',
          uri: appOrigin,
          icon: `${appOrigin}/logo.jpeg`,
        },
        authorizationResultCache: createDefaultAuthorizationResultCache(),
        cluster: network,
        onWalletNotFound: createDefaultWalletNotFoundHandler(),
      }),
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter({ network }),
    ],
    [appOrigin]
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
