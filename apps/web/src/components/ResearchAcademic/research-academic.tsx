interface ResearchAcademicProps {
  children?: React.ReactNode;
}

export default function ResearchAcademic({ children }: ResearchAcademicProps) {
  return (
    <div className="research-academic-container">
      {children || (
        <div>
          <h1>Research & Academic Tools</h1>
          <p>Select a tool from the sidebar to get started.</p>
        </div>
      )}
    </div>
  );
}
