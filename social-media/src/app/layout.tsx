import type { Metadata } from "next";
import { Roboto } from "next/font/google";
import "./globals.css";

const sans = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Rede Studio",
  description: "Ferramenta para designers criarem templates e jornalistas exportarem peças sociais e thumbs.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={sans.variable}>
      <body>{children}</body>
    </html>
  );
}
