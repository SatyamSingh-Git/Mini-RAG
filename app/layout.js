import './globals.css';

export const metadata = {
  title: 'Mini RAG - Qdrant + Gemini',
  description: 'Small RAG app with Qdrant, Gemini, and hosted reranker.'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
