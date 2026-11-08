import './globals.css';

export const metadata = {
  title: 'Meus Canais',
  description: 'Vídeos mais recentes só dos canais que você escolheu',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
