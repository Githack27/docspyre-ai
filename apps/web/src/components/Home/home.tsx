interface HomeProps {
  children?: React.ReactNode;
}

export default function Home({ children }: HomeProps) {
  return (
    <div className="home-container">
      {children || (
        <div>
          <h1>Welcome to DocSpyre AI</h1>
          <p>Your AI-powered document analysis platform.</p>
        </div>
      )}
    </div>
  );
}
