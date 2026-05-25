interface DocumentToolsProps {
  children?: React.ReactNode;
}

export default function DocumentTools({ children }: DocumentToolsProps) {
  return (
    <div className="document-tools-container">
      {children || (
        <div>
          <h1>Document Tools</h1>
          <p>Select a tool from the sidebar to get started.</p>
        </div>
      )}
    </div>
  );
}
