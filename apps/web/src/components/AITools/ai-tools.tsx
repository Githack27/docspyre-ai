interface AIToolsProps {
  children?: React.ReactNode;
}

export default function AITools({ children }: AIToolsProps) {
  return (
    <div className="ai-tools-container">
      {children}
    </div>
  );
}
