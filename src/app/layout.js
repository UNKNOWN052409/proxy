import { Inter } from "next/font/google";
import "material-symbols/outlined.css";
import "./globals.css";
import { ThemeProvider } from "@/components/shared/ThemeProvider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap", // Optimize font loading
  preload: true,
});

export const metadata = {
  title: "Kiro Proxy — Free AI Proxy with Premium UI",
  description: "OpenAI-compatible proxy for Kiro AI. Connect Claude Code, Codex, Cursor, Cline, and more.",
  icons: {
    icon: "/favicon.svg",
  },
};

export const viewport = {
  themeColor: "#111118",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `if(document.fonts&&document.fonts.ready){document.fonts.ready.then(function(){document.documentElement.classList.add('fonts-loaded')})}else{document.documentElement.classList.add('fonts-loaded')}`,
          }}
        />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
